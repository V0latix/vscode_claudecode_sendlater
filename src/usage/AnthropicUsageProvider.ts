/**
 * Anthropic Usage Provider
 *
 * Uses the Anthropic Admin API to retrieve token usage.
 *
 * Endpoint (as of 2024 — see https://docs.anthropic.com/en/api/admin-api):
 *   GET https://api.anthropic.com/v1/organizations/{orgId}/usage
 *   Headers: x-api-key: <admin-key>
 *            anthropic-version: 2023-06-01
 *
 * The response contains daily/hourly usage buckets per model.
 *
 * NOTE: The exact endpoint path and response shape may evolve.
 * If the endpoint returns 404, check Anthropic's latest admin API docs.
 * All errors are surfaced in the UI without crashing.
 *
 * Authentication:
 *   - Admin API key (distinct from regular claude API keys).
 *   - Stored in SecretStorage as "anthropic.adminApiKey".
 */
import * as vscode from 'vscode';
import * as https from 'https';
import { IUsageProvider, TokenUsage, ProviderStatus, ModelBreakdown } from './IUsageProvider';
import { getWindowStart5h, getWindowStart7d, formatDateParam } from '../util/time';

const SECRET_KEY = 'anthropic.adminApiKey';
const ANTHROPIC_VERSION = '2023-06-01';
const BASE_HOST = 'api.anthropic.com';

interface AnthropicUsageBucket {
  /** ISO 8601 timestamp — start of the bucket. */
  start_time: string;
  end_time?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  /** Cache tokens (if reported). */
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicUsageResponse {
  data: AnthropicUsageBucket[];
  has_more?: boolean;
  first_id?: string;
  last_id?: string;
}

export class AnthropicUsageProvider implements IUsageProvider {
  readonly name = 'Anthropic';
  private status: ProviderStatus = 'unconfigured';
  private readonly secrets: vscode.SecretStorage;
  private readonly log: vscode.OutputChannel;

  constructor(secrets: vscode.SecretStorage, log: vscode.OutputChannel) {
    this.secrets = secrets;
    this.log = log;
  }

  async isConfigured(): Promise<boolean> {
    const key = await this.secrets.get(SECRET_KEY);
    return !!key;
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  async fetchUsage(): Promise<TokenUsage> {
    const apiKey = await this.secrets.get(SECRET_KEY);
    if (!apiKey) {
      this.status = 'no-key';
      return this.noKeyResult();
    }

    const config = vscode.workspace.getConfiguration();
    const orgId: string = config.get('anthropic.orgId', '');

    const now = new Date();
    const start5h = getWindowStart5h(now);
    const start7d = getWindowStart7d(now);

    // Build query parameters
    const startDate = formatDateParam(start7d);
    const endDate = formatDateParam(now);

    const pathBase = orgId
      ? `/v1/organizations/${orgId}/usage`
      : `/v1/usage`; // Fallback path — may differ per org setup

    const queryParams = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });

    let allBuckets: AnthropicUsageBucket[] = [];

    try {
      const resp = await this.fetchJson<AnthropicUsageResponse>(
        apiKey,
        `${pathBase}?${queryParams.toString()}`
      );
      allBuckets = resp.data ?? [];

      // Handle pagination (simplified — fetch up to 3 pages)
      let hasMore = resp.has_more ?? false;
      let lastId = resp.last_id;
      let page = 0;
      while (hasMore && lastId && page < 3) {
        queryParams.set('after_id', lastId);
        const next = await this.fetchJson<AnthropicUsageResponse>(
          apiKey,
          `${pathBase}?${queryParams.toString()}`
        );
        allBuckets.push(...(next.data ?? []));
        hasMore = next.has_more ?? false;
        lastId = next.last_id;
        page++;
      }
    } catch (err) {
      this.log.appendLine(`[AnthropicUsageProvider] Error: ${err}`);
      this.status = 'error';
      return {
        tokensLast5h: 0,
        tokensLast7d: 0,
        lastUpdated: new Date(),
        error: `Anthropic API error: ${err}`,
        dataDelay: true,
      };
    }

    // Aggregate
    const start5hMs = start5h.getTime();
    const start7dMs = start7d.getTime();

    let tokens5h = 0;
    let tokens7d = 0;
    const breakdownMap = new Map<string, number>();

    for (const bucket of allBuckets) {
      const bucketMs = new Date(bucket.start_time).getTime();
      const bucketTokens =
        (bucket.input_tokens ?? 0) +
        (bucket.output_tokens ?? 0) +
        (bucket.cache_read_input_tokens ?? 0) +
        (bucket.cache_creation_input_tokens ?? 0);

      if (bucketMs >= start7dMs) {
        tokens7d += bucketTokens;
        breakdownMap.set(
          bucket.model,
          (breakdownMap.get(bucket.model) ?? 0) + bucketTokens
        );
      }
      if (bucketMs >= start5hMs) {
        tokens5h += bucketTokens;
      }
    }

    const breakdown: ModelBreakdown[] = Array.from(breakdownMap.entries())
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => b.tokens - a.tokens);

    this.status = 'ok';
    return {
      tokensLast5h: tokens5h,
      tokensLast7d: tokens7d,
      lastUpdated: new Date(),
      breakdown,
      dataDelay: true,
    };
  }

  private fetchJson<T>(apiKey: string, urlPath: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: BASE_HOST,
        path: urlPath,
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 401) {
            reject(new Error('HTTP 401: Invalid admin API key.'));
            return;
          }
          if (res.statusCode === 403) {
            reject(new Error('HTTP 403: Forbidden. Ensure you are using an admin API key.'));
            return;
          }
          if (res.statusCode === 404) {
            reject(new Error(
              'HTTP 404: Usage endpoint not found. Check that your orgId is correct ' +
              '(Settings: anthropic.orgId) or consult Anthropic admin API docs.'
            ));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch (e) {
            reject(new Error(`JSON parse error: ${e}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10_000, () => req.destroy(new Error('Request timeout')));
      req.end();
    });
  }

  private noKeyResult(): TokenUsage {
    return {
      tokensLast5h: 0,
      tokensLast7d: 0,
      lastUpdated: new Date(),
      error: 'No Anthropic admin API key configured. Run "Usage: Set Anthropic Admin API Key" from the command palette.',
    };
  }

  static async setKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
    await secrets.store(SECRET_KEY, key);
  }

  static async clearKey(secrets: vscode.SecretStorage): Promise<void> {
    await secrets.delete(SECRET_KEY);
  }
}

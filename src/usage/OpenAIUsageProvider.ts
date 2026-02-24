/**
 * OpenAI Usage Provider
 *
 * Uses the OpenAI usage API:
 *   GET https://api.openai.com/v1/usage?date=YYYY-MM-DD
 *
 * Requirements:
 *   - An **admin** API key (organization-level) stored in SecretStorage.
 *   - Optional: orgId and projectId from settings.
 *
 * Notes:
 *   - The API returns per-hour buckets for completions, embeddings, etc.
 *   - Data may lag by a few minutes.
 *   - Only the "admin" key (sk-org-...) can call this endpoint — a standard
 *     project key (sk-proj-...) will return 403.
 */
import * as vscode from 'vscode';
import * as https from 'https';
import { IUsageProvider, TokenUsage, ProviderStatus, ModelBreakdown } from './IUsageProvider';
import { getWindowStart5h, getWindowStart7d, datesInRange } from '../util/time';

const SECRET_KEY = 'openai.adminApiKey';
const BASE_URL = 'https://api.openai.com';

interface OpenAIUsageEntry {
  aggregation_timestamp: number; // Unix seconds — start of the hour bucket
  n_context_tokens_total: number;
  n_generated_tokens_total: number;
  snapshot_id?: string; // model name
  operation?: string;
}

interface OpenAIUsageResponse {
  object: string;
  data: OpenAIUsageEntry[];
  ft_data?: OpenAIUsageEntry[];
}

export class OpenAIUsageProvider implements IUsageProvider {
  readonly name = 'OpenAI';
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
    const orgId: string = config.get('openai.orgId', '');
    const projectId: string = config.get('openai.projectId', '');

    const now = new Date();
    const start5h = getWindowStart5h(now);
    const start7d = getWindowStart7d(now);

    // Collect all dates we need to query (last 7 days covers both windows)
    const dates = datesInRange(start7d, now);

    const allEntries: OpenAIUsageEntry[] = [];

    for (const date of dates) {
      try {
        const resp = await this.fetchDate(apiKey, date, orgId, projectId);
        allEntries.push(...resp.data);
        if (resp.ft_data) { allEntries.push(...resp.ft_data); }
      } catch (err) {
        this.log.appendLine(`[OpenAIUsageProvider] Error fetching date ${date}: ${err}`);
        this.status = 'error';
        return {
          tokensLast5h: 0,
          tokensLast7d: 0,
          lastUpdated: new Date(),
          error: `API error: ${err}`,
          dataDelay: true,
        };
      }
    }

    // Aggregate
    const start5hMs = start5h.getTime();
    const start7dMs = start7d.getTime();

    let tokens5h = 0;
    let tokens7d = 0;
    const breakdownMap = new Map<string, number>();

    for (const entry of allEntries) {
      const entryMs = entry.aggregation_timestamp * 1000;
      const entryTokens = (entry.n_context_tokens_total ?? 0) + (entry.n_generated_tokens_total ?? 0);

      if (entryMs >= start7dMs) {
        tokens7d += entryTokens;
      }
      if (entryMs >= start5hMs) {
        tokens5h += entryTokens;
      }

      // Breakdown by model
      const model = entry.snapshot_id ?? 'unknown';
      if (entryMs >= start7dMs) {
        breakdownMap.set(model, (breakdownMap.get(model) ?? 0) + entryTokens);
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
      dataDelay: true, // OpenAI usage data typically has a few-minute lag
    };
  }

  private fetchDate(
    apiKey: string,
    date: string,
    orgId: string,
    projectId: string,
  ): Promise<OpenAIUsageResponse> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (orgId) { headers['Openai-Organization'] = orgId; }
      if (projectId) { headers['Openai-Project'] = projectId; }

      const options = {
        hostname: 'api.openai.com',
        path: `/v1/usage?date=${date}`,
        method: 'GET',
        headers,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) {
            reject(new Error(`HTTP ${res.statusCode}: Invalid or insufficient API key. Use an organization admin key.`));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as OpenAIUsageResponse);
          } catch (e) {
            reject(new Error(`JSON parse error: ${e}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10_000, () => {
        req.destroy(new Error('Request timeout'));
      });
      req.end();
    });
  }

  private noKeyResult(): TokenUsage {
    return {
      tokensLast5h: 0,
      tokensLast7d: 0,
      lastUpdated: new Date(),
      error: 'No OpenAI API key configured. Run "Usage: Set OpenAI API Key" from the command palette.',
    };
  }

  /** Store the API key in SecretStorage. */
  static async setKey(secrets: vscode.SecretStorage, key: string): Promise<void> {
    await secrets.store(SECRET_KEY, key);
  }

  /** Remove the API key from SecretStorage. */
  static async clearKey(secrets: vscode.SecretStorage): Promise<void> {
    await secrets.delete(SECRET_KEY);
  }
}

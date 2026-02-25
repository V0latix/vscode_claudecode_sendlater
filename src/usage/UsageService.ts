/**
 * UsageService — aggregates data from all providers.
 *
 * Strategy:
 *   1. Always fetch from all configured providers in parallel.
 *   2. Prefer API-backed providers over local estimate.
 *   3. Cache results; expose last-fetched values synchronously for the UI.
 */
import * as vscode from 'vscode';
import { IUsageProvider, TokenUsage } from './IUsageProvider';

export interface AggregatedUsage {
  providers: {
    name: string;
    usage: TokenUsage;
  }[];
  /** Combined best-estimate tokens (from first provider without error). */
  bestTokensLast5h: number;
  bestTokensLast7d: number;
  lastRefreshed: Date | undefined;
}

export class UsageService {
  private readonly providers: IUsageProvider[];
  private readonly log: vscode.OutputChannel;
  private cachedResult: AggregatedUsage | undefined;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;

  readonly onDidChangeEmitter = new vscode.EventEmitter<AggregatedUsage>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(providers: IUsageProvider[], log: vscode.OutputChannel) {
    this.providers = providers;
    this.log = log;
  }

  /** Start auto-refresh. intervalMinutes=0 → disabled. */
  start(intervalMinutes: number): void {
    this.stop();
    if (intervalMinutes > 0) {
      this.refreshTimer = setInterval(
        () => this.refresh(),
        intervalMinutes * 60_000
      );
    }
  }

  stop(): void {
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /** Return cached data without fetching. */
  getCached(): AggregatedUsage | undefined {
    return this.cachedResult;
  }

  /** Fetch from all providers and update cache. */
  async refresh(): Promise<AggregatedUsage> {
    this.log.appendLine('[UsageService] Refreshing…');

    const results = await Promise.allSettled(
      this.providers.map(async (p) => ({
        name: p.name,
        usage: await p.fetchUsage(),
      }))
    );

    const providers = results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      this.log.appendLine(`[UsageService] Provider ${this.providers[i].name} threw: ${r.reason}`);
      return {
        name: this.providers[i].name,
        usage: {
          tokensLast5h: 0,
          tokensLast7d: 0,
          lastUpdated: new Date(),
          error: String(r.reason),
        } satisfies TokenUsage,
      };
    });

    // Compute best estimates: use first provider without error
    const bestSource = providers.find(p => !p.usage.error);

    const result: AggregatedUsage = {
      providers,
      bestTokensLast5h: bestSource?.usage.tokensLast5h ?? 0,
      bestTokensLast7d: bestSource?.usage.tokensLast7d ?? 0,
      lastRefreshed: new Date(),
    };

    this.cachedResult = result;
    this.onDidChangeEmitter.fire(result);
    this.log.appendLine(
      `[UsageService] Done. 5h=${result.bestTokensLast5h} 7d=${result.bestTokensLast7d}`
    );

    return result;
  }
}

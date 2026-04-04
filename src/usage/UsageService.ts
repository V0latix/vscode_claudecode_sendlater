/**
 * UsageService — aggregates data from all providers.
 *
 * Strategy:
 *   1. Always fetch from all configured providers in parallel.
 *   2. Prefer API-backed providers over local estimate.
 *   3. Cache results; expose last-fetched values synchronously for the UI.
 */
import * as vscode from "vscode";
import { IUsageProvider, TokenUsage } from "./IUsageProvider";
import { ClaudeLocalProvider } from "./ClaudeLocalProvider";

export interface AggregatedUsage {
  providers: {
    name: string;
    usage: TokenUsage;
  }[];
  /** Combined best-estimate tokens (from first provider without error). */
  bestTokensLast5h: number;
  bestTokensLast7d: number;
  lastRefreshed: Date | undefined;
  /** Per-model token breakdown from the best provider (may be undefined). */
  modelBreakdown?: import("./IUsageProvider").ModelBreakdown[];
  /** 24-hour hourly sparkline from the best provider (may be undefined). */
  hourlyLast24h?: number[];
  /** Start of the current rate-limit window (from ClaudeLocalProvider). */
  bestWindowStart?: Date;
  /** When the current rate-limit window resets (from ClaudeLocalProvider). */
  bestWindowEnd?: Date;
}

export class UsageService {
  private readonly providers: IUsageProvider[];
  private readonly log: vscode.OutputChannel;
  private cachedResult: AggregatedUsage | undefined;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  /** Tracks providers for which an invalid-key notification has already been shown this session. */
  private readonly _invalidKeyNotified = new Set<string>();
  /** True while a refresh() call is in flight — prevents stacked calls from setWindowHint(). */
  private _refreshing = false;

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
        intervalMinutes * 60_000,
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

  /**
   * Inject a known window reset time from a parsed rate-limit message.
   * Delegates to ClaudeLocalProvider and triggers an immediate refresh
   * so the UI reflects the accurate window immediately.
   */
  setWindowHint(resetAt: Date): void {
    const claudeProvider = this.providers.find(
      (p) => p instanceof ClaudeLocalProvider,
    ) as ClaudeLocalProvider | undefined;
    claudeProvider?.setWindowHint(resetAt);
    // Refresh asynchronously so the UI updates with the correct window.
    // Guard against concurrent calls (e.g. rapid rate-limit messages).
    if (!this._refreshing) {
      this._refreshing = true;
      this.refresh()
        .catch(() => undefined)
        .finally(() => {
          this._refreshing = false;
        });
    }
  }

  /** Fetch from all providers and update cache. */
  async refresh(): Promise<AggregatedUsage> {
    this.log.appendLine("[UsageService] Refreshing…");

    const results = await Promise.allSettled(
      this.providers.map(async (p) => ({
        name: p.name,
        usage: await p.fetchUsage(),
      })),
    );

    const providers = results.map((r, i) => {
      if (r.status === "fulfilled") {
        return r.value;
      }
      this.log.appendLine(
        `[UsageService] Provider ${this.providers[i].name} threw: ${r.reason}`,
      );
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
    const bestSource = providers.find((p) => !p.usage.error);

    const result: AggregatedUsage = {
      providers,
      bestTokensLast5h: bestSource?.usage.tokensLast5h ?? 0,
      bestTokensLast7d: bestSource?.usage.tokensLast7d ?? 0,
      lastRefreshed: new Date(),
      modelBreakdown: bestSource?.usage.breakdown,
      hourlyLast24h: bestSource?.usage.hourlyLast24h,
      bestWindowStart: bestSource?.usage.currentWindowStart,
      bestWindowEnd: bestSource?.usage.currentWindowEnd,
    };

    // Notify once per session when a key is invalid/expired
    for (const p of providers) {
      if (p.usage.isInvalidKey && !this._invalidKeyNotified.has(p.name)) {
        this._invalidKeyNotified.add(p.name);
        const updateCmd =
          p.name === "OpenAI" ? "usage.setOpenAIKey" : "usage.setAnthropicKey";
        vscode.window
          .showWarningMessage(
            `${p.name}: API key is invalid or expired — usage tracking paused.`,
            `Update ${p.name} key`,
          )
          .then((action) => {
            if (action) {
              vscode.commands.executeCommand(updateCmd);
            }
          });
      } else if (!p.usage.isInvalidKey) {
        // Key is no longer flagged as invalid — re-arm notification for future 401/403
        this._invalidKeyNotified.delete(p.name);
      }
    }

    this.cachedResult = result;
    this.onDidChangeEmitter.fire(result);
    this.log.appendLine(
      `[UsageService] Done. 5h=${result.bestTokensLast5h} 7d=${result.bestTokensLast7d}`,
    );

    return result;
  }
}

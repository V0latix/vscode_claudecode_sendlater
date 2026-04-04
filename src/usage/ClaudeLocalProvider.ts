/**
 * ClaudeLocalProvider
 *
 * Reads real token usage from Claude Code CLI's local session files:
 *   ~/.claude/projects/ * / *.jsonl
 *
 * Each assistant message entry contains:
 *   { timestamp: "ISO 8601", message: { usage: { input_tokens, output_tokens,
 *     cache_creation_input_tokens, cache_read_input_tokens }, model } }
 *
 * Window detection:
 *   Claude's rate-limit window is anchored at the first request in a session,
 *   NOT a rolling "last 5 hours". This provider detects the actual window start
 *   by scanning for gaps ≥ 5h between consecutive JSONL entries. A known
 *   reset time (from a parsed rate-limit message) can also be injected via
 *   setWindowHint() for higher accuracy.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import {
  IUsageProvider,
  TokenUsage,
  ProviderStatus,
  ModelBreakdown,
} from "./IUsageProvider";
import { getWindowStart7d } from "../util/time";
import { detectWindowStart, FIVE_HOURS_MS } from "../util/windowDetection";

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
/** How far back to read entries for window-start detection (must be > 5h). */
const WINDOW_LOOKBACK_MS = 12 * 3_600_000;

interface JournalEntry {
  timestamp?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    model?: string;
  };
}

interface ParsedEntry {
  ts: number;
  tokens: number;
  model: string;
}

export class ClaudeLocalProvider implements IUsageProvider {
  readonly name = "Claude (local)";
  private status: ProviderStatus = "unconfigured";
  private readonly log: vscode.OutputChannel;

  /**
   * Hint from a parsed rate-limit message: the time when the current window
   * resets. When set and still in the future, this takes priority over
   * gap-based window detection.
   */
  private _windowHint?: Date;

  constructor(log: vscode.OutputChannel) {
    this.log = log;
  }

  /**
   * Inject a known window reset time (from parseRateLimitMessage).
   * Call this whenever the user gets rate-limited so the window calculation
   * is anchored to Claude's actual counter rather than a JSONL heuristic.
   */
  setWindowHint(resetAt: Date): void {
    this._windowHint = resetAt;
    this.log.appendLine(
      `[ClaudeLocalProvider] Window hint set: resets at ${resetAt.toISOString()}`,
    );
  }

  async isConfigured(): Promise<boolean> {
    return fs.existsSync(CLAUDE_DIR);
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  async fetchUsage(): Promise<TokenUsage> {
    if (!fs.existsSync(CLAUDE_DIR)) {
      this.status = "unconfigured";
      return {
        tokensLast5h: 0,
        tokensLast7d: 0,
        lastUpdated: new Date(),
        error: "Claude Code CLI not found (~/.claude/projects missing).",
      };
    }

    const now = new Date();
    const nowMs = now.getTime();
    const start7d = getWindowStart7d(now).getTime();
    const start12h = nowMs - WINDOW_LOOKBACK_MS;
    const start24h = nowMs - 24 * 3_600_000;

    const recentEntries: ParsedEntry[] = []; // last 12h — used for window detection
    let tokens7d = 0;
    const breakdownMap = new Map<string, number>();
    const hourlyBuckets = new Array<number>(24).fill(0);

    try {
      const sessionDirs = fs
        .readdirSync(CLAUDE_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(CLAUDE_DIR, e.name));

      for (const dir of sessionDirs) {
        let files: string[];
        try {
          files = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => path.join(dir, f));
        } catch {
          continue;
        }

        for (const file of files) {
          // Skip files older than 7 days (mtime check avoids reading old files)
          try {
            const stat = fs.statSync(file);
            if (stat.mtimeMs < start7d) {
              continue;
            }
          } catch {
            continue;
          }

          try {
            const content = fs.readFileSync(file, "utf8");
            for (const line of content.split("\n")) {
              if (!line.trim()) {
                continue;
              }
              const parsed = this.parseLine(line);
              if (!parsed || parsed.ts < start7d) {
                continue;
              }

              // 7-day aggregate + model breakdown
              tokens7d += parsed.tokens;
              breakdownMap.set(
                parsed.model,
                (breakdownMap.get(parsed.model) ?? 0) + parsed.tokens,
              );

              // 24h sparkline
              if (parsed.ts >= start24h && parsed.ts <= nowMs) {
                const ageMs = nowMs - parsed.ts;
                const idx = Math.max(
                  0,
                  Math.min(23, 23 - Math.floor(ageMs / 3_600_000)),
                );
                hourlyBuckets[idx] += parsed.tokens;
              }

              // Collect for window detection
              if (parsed.ts >= start12h) {
                recentEntries.push(parsed);
              }
            }
          } catch (err) {
            this.log.appendLine(
              `[ClaudeLocalProvider] Error reading ${file}: ${err}`,
            );
          }
        }
      }
    } catch (err) {
      this.log.appendLine(
        `[ClaudeLocalProvider] Error scanning ${CLAUDE_DIR}: ${err}`,
      );
      this.status = "error";
      return {
        tokensLast5h: 0,
        tokensLast7d: 0,
        lastUpdated: new Date(),
        error: `Failed to read ~/.claude/projects: ${err}`,
      };
    }

    // ── Window detection ────────────────────────────────────────────────────
    recentEntries.sort((a, b) => a.ts - b.ts);

    const hintResetMs = this._windowHint?.getTime();
    const windowStartMs = detectWindowStart(recentEntries, nowMs, hintResetMs);

    // Clear hint once it expires (pure function can't do this itself)
    if (this._windowHint && this._windowHint.getTime() <= nowMs) {
      this._windowHint = undefined;
    }
    const windowEndMs =
      windowStartMs !== null ? windowStartMs + FIVE_HOURS_MS : null;

    // Tokens in the current rate-limit window
    const tokensInWindow =
      windowStartMs !== null
        ? recentEntries
            .filter((e) => e.ts >= windowStartMs && e.ts <= nowMs)
            .reduce((sum, e) => sum + e.tokens, 0)
        : 0;

    const breakdown: ModelBreakdown[] = Array.from(breakdownMap.entries())
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => b.tokens - a.tokens);

    this.status = "ok";
    return {
      tokensLast5h: tokensInWindow,
      tokensLast7d: tokens7d,
      lastUpdated: now,
      breakdown,
      hourlyLast24h: hourlyBuckets,
      currentWindowStart:
        windowStartMs !== null ? new Date(windowStartMs) : undefined,
      currentWindowEnd:
        windowEndMs !== null ? new Date(windowEndMs) : undefined,
    };
  }

  /** Parse a single JSONL line. Returns null if the line is not a token-bearing entry. */
  private parseLine(line: string): ParsedEntry | null {
    let entry: JournalEntry;
    try {
      entry = JSON.parse(line) as JournalEntry;
    } catch {
      return null;
    }

    if (!entry.timestamp || !entry.message?.usage) {
      return null;
    }

    const ts = new Date(entry.timestamp).getTime();
    if (isNaN(ts)) {
      return null;
    }

    const u = entry.message.usage;
    const tokens =
      (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0);

    if (tokens === 0) {
      return null;
    }

    return { ts, tokens, model: entry.message.model ?? "unknown" };
  }
}

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
 * Advantages over LocalEstimateProvider:
 *   - Uses actual token counts, not chars/4 estimates
 *   - Covers all Claude Code CLI sessions, not just queued prompts
 *   - Zero network calls, zero credentials needed
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { IUsageProvider, TokenUsage, ProviderStatus, ModelBreakdown } from './IUsageProvider';
import { getWindowStart5h, getWindowStart7d } from '../util/time';

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

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

export class ClaudeLocalProvider implements IUsageProvider {
  readonly name = 'Claude (local)';
  private status: ProviderStatus = 'unconfigured';
  private readonly log: vscode.OutputChannel;

  constructor(log: vscode.OutputChannel) {
    this.log = log;
  }

  async isConfigured(): Promise<boolean> {
    return fs.existsSync(CLAUDE_DIR);
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  async fetchUsage(): Promise<TokenUsage> {
    if (!fs.existsSync(CLAUDE_DIR)) {
      this.status = 'unconfigured';
      return {
        tokensLast5h: 0,
        tokensLast7d: 0,
        lastUpdated: new Date(),
        error: 'Claude Code CLI not found (~/.claude/projects missing).',
      };
    }

    const now = new Date();
    const start5h = getWindowStart5h(now).getTime();
    const start7d = getWindowStart7d(now).getTime();

    let tokens5h = 0;
    let tokens7d = 0;
    const breakdownMap = new Map<string, number>();

    try {
      const sessionDirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(CLAUDE_DIR, e.name));

      for (const dir of sessionDirs) {
        let files: string[];
        try {
          files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => path.join(dir, f));
        } catch {
          continue;
        }

        for (const file of files) {
          // Skip files older than 7 days (mtime check avoids reading old files)
          try {
            const stat = fs.statSync(file);
            if (stat.mtimeMs < start7d) { continue; }
          } catch {
            continue;
          }

          try {
            const content = fs.readFileSync(file, 'utf8');
            for (const line of content.split('\n')) {
              if (!line.trim()) { continue; }
              this.processLine(line, start5h, start7d, breakdownMap,
                (t5, t7) => { tokens5h += t5; tokens7d += t7; });
            }
          } catch (err) {
            this.log.appendLine(`[ClaudeLocalProvider] Error reading ${file}: ${err}`);
          }
        }
      }
    } catch (err) {
      this.log.appendLine(`[ClaudeLocalProvider] Error scanning ${CLAUDE_DIR}: ${err}`);
      this.status = 'error';
      return {
        tokensLast5h: 0,
        tokensLast7d: 0,
        lastUpdated: new Date(),
        error: `Failed to read ~/.claude/projects: ${err}`,
      };
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
    };
  }

  private processLine(
    line: string,
    start5h: number,
    start7d: number,
    breakdownMap: Map<string, number>,
    addTokens: (t5: number, t7: number) => void,
  ): void {
    let entry: JournalEntry;
    try {
      entry = JSON.parse(line) as JournalEntry;
    } catch {
      return;
    }

    if (!entry.timestamp || !entry.message?.usage) { return; }

    const ts = new Date(entry.timestamp).getTime();
    if (isNaN(ts) || ts < start7d) { return; }

    const u = entry.message.usage;
    const total =
      (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0);

    if (total === 0) { return; }

    addTokens(ts >= start5h ? total : 0, total);

    const model = entry.message.model ?? 'unknown';
    breakdownMap.set(model, (breakdownMap.get(model) ?? 0) + total);
  }
}

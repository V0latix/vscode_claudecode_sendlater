import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { QueueStore, QueueItem, DeliveryLogEntry } from "./QueueStore";
import { isOverdue } from "../util/time";

const PROCESS_INTERVAL_MS = 60_000; // 1 minute

/**
 * Thrown when delivery cannot proceed due to permanent/config issues.
 * These errors keep the item in queue for the user to manually retry —
 * they are NOT rescheduled with exponential backoff.
 *
 * Examples: configured terminal name not found, wrong terminal name.
 * (Contrast with transient errors like momentary storage failures, which
 * go through the normal retry path.)
 */
class NonRetryableDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableDeliveryError";
  }
}

export class QueueProcessor {
  private readonly store: QueueStore;
  private readonly log: vscode.OutputChannel;
  private timer: ReturnType<typeof setInterval> | undefined;

  /** Fires whenever items change (for tree-view refresh). */
  readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(store: QueueStore, log: vscode.OutputChannel) {
    this.store = store;
    this.log = log;
  }

  /** Start the background polling interval. */
  start(): void {
    this.timer = setInterval(() => this.process(), PROCESS_INTERVAL_MS);
  }

  /** Stop the background polling interval. */
  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Process all due items immediately. Returns number of items delivered. */
  async process(): Promise<number> {
    const pending = this.store.getPending();
    const due = pending.filter((i) => isOverdue(new Date(i.notBefore)));

    this.log.appendLine(
      `[QueueProcessor] Tick: ${pending.length} pending, ${due.length} overdue`,
    );

    if (due.length === 0) {
      return 0;
    }

    const cfg = vscode.workspace.getConfiguration("promptQueue");
    const maxRetries: number = cfg.get("maxDeliveryRetries", 3);

    for (const item of due) {
      try {
        // deliver() writes the success log entry before removing the item,
        // so a failure in the log write leaves the item in queue for retry.
        await this.deliver(item);
      } catch (err) {
        if (err instanceof NonRetryableDeliveryError) {
          // Config/permanent issue — keep item in queue, user must resolve manually.
          this.log.appendLine(
            `[QueueProcessor] Non-retryable delivery failure for ${item.id}: ${err.message}`,
          );
          vscode.window.showErrorMessage(
            `PromptQueue: ${err.message}. Prompt kept in queue — resolve the issue and retry manually.`,
          );
        } else {
          // Transient error — apply exponential backoff up to maxRetries.
          const attempts = (item.deliveryAttempts ?? 0) + 1;
          if (attempts < maxRetries) {
            const delayMs = 60_000 * Math.pow(2, attempts - 1);
            const newNotBefore = new Date(Date.now() + delayMs).toISOString();
            await this.store.update(item.id, {
              deliveryAttempts: attempts,
              notBefore: newNotBefore,
            });
            this.log.appendLine(
              `[QueueProcessor] Attempt ${attempts}/${maxRetries} failed for ${item.id}, ` +
                `retrying in ${delayMs / 1000}s: ${err}`,
            );
          } else {
            // Max retries exhausted — log failure and notify user.
            this.log.appendLine(
              `[QueueProcessor] Max retries (${maxRetries}) reached for ${item.id}: ${err}`,
            );
            await this.store.addDeliveryLogEntry({
              itemId: item.id,
              timestamp: new Date().toISOString(),
              status: "failed",
              error: String(err),
              promptPreview: item.promptText.slice(0, 80),
            });
            vscode.window.showErrorMessage(
              `PromptQueue: failed to deliver prompt ${item.id} after ${maxRetries} attempts: ${err}`,
            );
          }
        }
      }
    }

    this.onDidChangeEmitter.fire();
    return due.length;
  }

  /** Force-deliver a specific item immediately, regardless of its notBefore time. */
  async forceDeliver(id: string): Promise<void> {
    const item = this.store.getAll().find((i) => i.id === id && !i.processed);
    if (!item) {
      return;
    }
    try {
      await this.deliver(item);
    } catch (err) {
      this.log.appendLine(
        `[QueueProcessor] Error force-delivering ${id}: ${err}`,
      );
      await this.store.addDeliveryLogEntry({
        itemId: item.id,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: String(err),
        promptPreview: item.promptText.slice(0, 80),
      });
      vscode.window.showErrorMessage(
        `PromptQueue: failed to deliver ${id}: ${err}`,
      );
    }
    this.onDidChangeEmitter.fire();
  }

  private async deliver(item: QueueItem): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("promptQueue");
    const configuredName: string = cfg.get("targetTerminalName", "");

    // When a target terminal is explicitly configured but not found, this is a
    // non-retryable error — the item stays in queue for the user to fix manually
    // (open the terminal or clear promptQueue.targetTerminalName).
    if (configuredName) {
      const target = vscode.window.terminals.find(
        (t) => t.name === configuredName,
      );
      if (!target) {
        throw new NonRetryableDeliveryError(
          `Terminal "${configuredName}" not found — open it or clear promptQueue.targetTerminalName`,
        );
      }
    }

    const existing = this.findClaudeTerminal(item.targetTerminalName);

    if (existing) {
      this.log.appendLine(
        `[QueueProcessor] Sending to existing terminal "${existing.name}"`,
      );

      // Best-effort check: if the terminal process has already exited before we
      // even send, warn immediately (checked BEFORE sendText for reliability —
      // exitStatus is set synchronously when the process exits, so this catches
      // zombie terminals that VS Code still lists but whose process is gone).
      if (existing.exitStatus !== undefined) {
        this.log.appendLine(
          `[QueueProcessor] Warning: terminal "${existing.name}" process has already exited ` +
            `(code=${existing.exitStatus.code})`,
        );
        vscode.window.showWarningMessage(
          `PromptQueue: terminal "${existing.name}" process has already exited — prompt may not be received.`,
        );
      }

      existing.show(true);
      // Strip ESC chars to avoid interfering with Claude Code CLI's TUI keybindings.
      const safe = item.promptText.replace(/\x1b/g, "");
      existing.sendText(safe, false);
      existing.sendText("\r", false); // Press Enter to submit
    } else {
      // No Claude terminal found — create one and launch Claude Code CLI.
      this.log.appendLine(
        `[QueueProcessor] No Claude terminal found, creating new session`,
      );
      const folder = this.resolveWorkspaceFolder(item);
      const cwd = folder?.uri.fsPath ?? os.homedir();
      const tmpFile = path.join(os.tmpdir(), `cq-${item.id}.txt`);
      fs.writeFileSync(tmpFile, item.promptText, "utf8");
      const terminal = vscode.window.createTerminal({ name: "Claude", cwd });
      terminal.show(true);
      terminal.sendText(`claude "$(cat '${tmpFile}')" ; rm -f '${tmpFile}'`);
    }

    // Write success log entry BEFORE removing from queue:
    // if this write fails, the item stays in queue and can be retried.
    await this.store.addDeliveryLogEntry({
      itemId: item.id,
      timestamp: new Date().toISOString(),
      status: "delivered",
      promptPreview: item.promptText.slice(0, 80),
    });

    await this.store.remove(item.id);

    this.log.appendLine(`[QueueProcessor] Delivered ${item.id}`);
    vscode.window.showInformationMessage(
      `PromptQueue: Prompt sent to Claude  [id: ${item.id}]`,
    );
  }

  /**
   * Find the terminal to deliver to.
   *
   * Priority:
   *  1. User-configured `promptQueue.targetTerminalName` (exact match).
   *  2. Terminal whose name matches the hint recorded at queue time.
   *  3. Terminal named exactly 'Claude' (created by a previous delivery).
   *  4. Any terminal whose name contains 'claude' (case-insensitive).
   *  5. The currently active terminal (last resort — user may have it focused).
   */
  private findClaudeTerminal(hint?: string): vscode.Terminal | undefined {
    const terminals = vscode.window.terminals;

    const cfg = vscode.workspace.getConfiguration("promptQueue");
    const configuredName: string = cfg.get("targetTerminalName", "");
    if (configuredName) {
      const byConfig = terminals.find((t) => t.name === configuredName);
      if (byConfig) {
        return byConfig;
      }
    }

    if (hint) {
      const byHint = terminals.find((t) => t.name === hint);
      if (byHint) {
        return byHint;
      }
    }
    return (
      terminals.find((t) => t.name === "Claude") ??
      terminals.find((t) => t.name.toLowerCase().includes("claude")) ??
      vscode.window.activeTerminal
    );
  }

  private resolveWorkspaceFolder(
    item: QueueItem,
  ): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }

    if (item.workspaceFolder) {
      const match = folders.find((f) => f.uri.fsPath === item.workspaceFolder);
      if (match) {
        return match;
      }
    }

    return folders[0];
  }
}

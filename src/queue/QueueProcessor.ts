import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { QueueStore, QueueItem } from './QueueStore';
import { isOverdue } from '../util/time';

const PROCESS_INTERVAL_MS = 60_000; // 1 minute

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
    const due = pending.filter(i => isOverdue(new Date(i.notBefore)));

    this.log.appendLine(`[QueueProcessor] Tick: ${pending.length} pending, ${due.length} overdue`);

    if (due.length === 0) {
      return 0;
    }

    for (const item of due) {
      try {
        await this.deliver(item);
      } catch (err) {
        this.log.appendLine(`[QueueProcessor] Error delivering ${item.id}: ${err}`);
        vscode.window.showErrorMessage(`PromptQueue: failed to deliver prompt ${item.id}: ${err}`);
      }
    }

    this.onDidChangeEmitter.fire();
    return due.length;
  }

  /** Force-deliver a specific item immediately, regardless of its notBefore time. */
  async forceDeliver(id: string): Promise<void> {
    const item = this.store.getAll().find(i => i.id === id && !i.processed);
    if (!item) { return; }
    try {
      await this.deliver(item);
    } catch (err) {
      this.log.appendLine(`[QueueProcessor] Error force-delivering ${id}: ${err}`);
      vscode.window.showErrorMessage(`PromptQueue: failed to deliver ${id}: ${err}`);
    }
    this.onDidChangeEmitter.fire();
  }

  private async deliver(item: QueueItem): Promise<void> {
    const existing = this.findClaudeTerminal(item.targetTerminalName);

    if (existing) {
      // Send directly to the existing Claude Code session.
      // Bracketed paste mode (\x1b[200~ ... \x1b[201~) lets us inject multi-line text
      // as a single unit — newlines won't trigger premature submission.
      this.log.appendLine(`[QueueProcessor] Sending to existing terminal "${existing.name}"`);
      existing.show(true);
      // Strip ESC chars to avoid interfering with Claude Code CLI's TUI keybindings.
      // \x1b[200~…\x1b[201~ (bracketed paste) starts with ESC (\x1b) which Claude Code
      // CLI interprets as the Escape key — closing the current conversation context.
      const safe = item.promptText.replace(/\x1b/g, '');
      existing.sendText(safe, false);
      existing.sendText('\r', false); // Press Enter to submit
    } else {
      // No Claude terminal found — create one and launch Claude Code CLI.
      this.log.appendLine(`[QueueProcessor] No Claude terminal found, creating new session`);
      const folder = this.resolveWorkspaceFolder(item);
      const cwd = folder?.uri.fsPath ?? os.homedir();
      const tmpFile = path.join(os.tmpdir(), `cq-${item.id}.txt`);
      fs.writeFileSync(tmpFile, item.promptText, 'utf8');
      const terminal = vscode.window.createTerminal({ name: 'Claude', cwd });
      terminal.show(true);
      terminal.sendText(`claude "$(cat '${tmpFile}')" ; rm -f '${tmpFile}'`);
    }

    // Remove from queue (not just mark processed).
    await this.store.remove(item.id);

    this.log.appendLine(`[QueueProcessor] Delivered ${item.id}`);
    vscode.window.showInformationMessage(
      `PromptQueue: Prompt sent to Claude  [id: ${item.id}]`
    );
  }

  /**
   * Find the terminal to deliver to.
   *
   * Priority:
   *  1. Terminal whose name matches the hint recorded at queue time.
   *  2. Terminal named exactly 'Claude' (created by a previous delivery).
   *  3. Any terminal whose name contains 'claude' (case-insensitive).
   *  4. The currently active terminal (last resort — user may have it focused).
   */
  private findClaudeTerminal(hint?: string): vscode.Terminal | undefined {
    const terminals = vscode.window.terminals;
    if (hint) {
      const byHint = terminals.find(t => t.name === hint);
      if (byHint) { return byHint; }
    }
    return (
      terminals.find(t => t.name === 'Claude') ??
      terminals.find(t => t.name.toLowerCase().includes('claude')) ??
      vscode.window.activeTerminal
    );
  }

  private resolveWorkspaceFolder(item: QueueItem): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }

    // Try to match the stored workspace folder path
    if (item.workspaceFolder) {
      const match = folders.find(f => f.uri.fsPath === item.workspaceFolder);
      if (match) { return match; }
    }

    // Fallback to first available folder
    return folders[0];
  }
}

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { QueueStore, QueueItem } from './QueueStore';
import { isOverdue, formatDisplayTime } from '../util/time';

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

  /** Process all due items immediately. */
  async process(): Promise<void> {
    const pending = this.store.getPending();
    const due = pending.filter(i => isOverdue(new Date(i.notBefore)));

    if (due.length === 0) {
      return;
    }

    this.log.appendLine(`[QueueProcessor] Processing ${due.length} due item(s)…`);

    for (const item of due) {
      try {
        await this.deliver(item);
      } catch (err) {
        this.log.appendLine(`[QueueProcessor] Error delivering ${item.id}: ${err}`);
        vscode.window.showErrorMessage(`PromptQueue: failed to deliver prompt ${item.id}: ${err}`);
      }
    }

    this.onDidChangeEmitter.fire();
  }

  private async deliver(item: QueueItem): Promise<void> {
    const folder = this.resolveWorkspaceFolder(item);
    const cwd = folder?.uri.fsPath ?? os.homedir();

    // Write prompt to a temp file — handles multiline safely, no shell-quoting issues
    const tmpFile = path.join(os.tmpdir(), `cq-${item.id}.txt`);
    fs.writeFileSync(tmpFile, item.promptText, 'utf8');

    // Open a dedicated terminal and launch Claude Code CLI.
    // The rm cleans up the temp file once claude exits.
    const terminal = vscode.window.createTerminal({
      name: `Claude ▶ ${item.id}`,
      cwd,
    });
    terminal.show(/* preserveFocus */ false);
    terminal.sendText(`claude "$(cat '${tmpFile}')" ; rm -f '${tmpFile}'`);

    await this.store.markProcessed(item.id);

    this.log.appendLine(`[QueueProcessor] Launched Claude for ${item.id} in ${cwd}`);
    vscode.window.showInformationMessage(
      `PromptQueue: Prompt sent to Claude — terminal opened  [id: ${item.id}]`
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

import * as vscode from 'vscode';
import * as path from 'path';
import { QueueStore, QueueItem } from './QueueStore';
import { isOverdue, formatTimestamp, formatDisplayTime } from '../util/time';
import { ensureDir, resolveCollision, writeText } from '../util/fs';

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
    // Resolve the target workspace folder
    const folder = this.resolveWorkspaceFolder(item);
    if (!folder) {
      this.log.appendLine(`[QueueProcessor] No workspace folder for item ${item.id} — skipping.`);
      // Still mark processed to avoid infinite retry
      await this.store.markProcessed(item.id);
      vscode.window.showWarningMessage(
        `PromptQueue: No workspace open to deliver prompt ${item.id}. Open a workspace and use "Process Queue Now".`
      );
      return;
    }

    const config = vscode.workspace.getConfiguration('promptQueue');
    const outputDir: string = config.get('outputDir', '.prompt-queue');
    const template: string = config.get('filenameTemplate', '{timestamp}_{id}.md');

    // Build filename from template
    const timestamp = formatTimestamp(new Date(item.notBefore));
    const filename = template
      .replace('{timestamp}', timestamp)
      .replace('{id}', item.id);

    const dirUri = vscode.Uri.joinPath(folder.uri, outputDir);
    await ensureDir(dirUri);

    const fileUri = await resolveCollision(vscode.Uri.joinPath(dirUri, filename));

    // Build file content
    const header = [
      `<!-- Prompt Queue Delivery -->`,
      `<!-- id: ${item.id} -->`,
      `<!-- created: ${formatDisplayTime(new Date(item.createdAt))} -->`,
      `<!-- notBefore: ${formatDisplayTime(new Date(item.notBefore))} -->`,
      `<!-- delivered: ${formatDisplayTime(new Date())} -->`,
      ``,
      `# Queued Prompt`,
      ``,
    ].join('\n');

    const content = header + item.promptText + '\n';
    await writeText(fileUri, content);

    // Mark as processed
    await this.store.markProcessed(item.id);

    this.log.appendLine(`[QueueProcessor] Delivered: ${fileUri.fsPath}`);

    // Notification with actions
    const relPath = path.join(outputDir, path.basename(fileUri.fsPath));
    const action = await vscode.window.showInformationMessage(
      `PromptQueue: Prompt file created — ${relPath}`,
      'Open File',
      'Reveal in Explorer'
    );

    if (action === 'Open File') {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(doc);
    } else if (action === 'Reveal in Explorer') {
      await vscode.commands.executeCommand('revealInExplorer', fileUri);
    }
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

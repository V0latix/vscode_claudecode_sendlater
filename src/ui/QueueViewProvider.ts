import * as vscode from 'vscode';
import { QueueStore, QueueItem } from '../queue/QueueStore';
import { formatDisplayTime, isOverdue } from '../util/time';

export class QueueViewProvider implements vscode.TreeDataProvider<QueueItem> {
  private readonly store: QueueStore;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<QueueItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(store: QueueStore) {
    this.store = store;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(item: QueueItem): vscode.TreeItem {
    const due = isOverdue(new Date(item.notBefore));
    const label = `[${item.id}] ${formatDisplayTime(new Date(item.notBefore))}`;

    const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    treeItem.description = item.processed
      ? '✓ delivered'
      : due
        ? '⏰ due now'
        : `⏳ ${item.promptText.slice(0, 40).replace(/\n/g, ' ')}…`;

    treeItem.tooltip = new vscode.MarkdownString(
      `**ID:** ${item.id}\n\n` +
      `**Created:** ${formatDisplayTime(new Date(item.createdAt))}\n\n` +
      `**Not before:** ${formatDisplayTime(new Date(item.notBefore))}\n\n` +
      `**Prompt:**\n\`\`\`\n${item.promptText.slice(0, 300)}\n\`\`\``
    );

    treeItem.iconPath = new vscode.ThemeIcon(
      item.processed ? 'check' : due ? 'alert' : 'clock'
    );

    treeItem.contextValue = item.processed ? 'queueItemProcessed' : 'queueItemPending';
    return treeItem;
  }

  getChildren(): QueueItem[] {
    const all = this.store.getAll();
    // Show pending first (sorted by notBefore), then processed
    const pending = all.filter(i => !i.processed).sort(
      (a, b) => new Date(a.notBefore).getTime() - new Date(b.notBefore).getTime()
    );
    const processed = all.filter(i => i.processed).sort(
      (a, b) => new Date(b.notBefore).getTime() - new Date(a.notBefore).getTime()
    );
    return [...pending, ...processed];
  }
}

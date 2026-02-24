import * as vscode from 'vscode';
import { UsageService, AggregatedUsage } from '../usage/UsageService';
import { formatDisplayTime } from '../util/time';

type UsageTreeNode =
  | { kind: 'header'; label: string; description: string; icon: string }
  | { kind: 'row'; label: string; value: string; icon: string }
  | { kind: 'provider'; name: string; status: string; error?: string }
  | { kind: 'quota'; label: string; used: number; limit: number; percent: number; resetAt: Date | null };

export class UsageViewProvider implements vscode.TreeDataProvider<UsageTreeNode> {
  private readonly service: UsageService;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<UsageTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(service: UsageService) {
    this.service = service;
    service.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
  }

  getTreeItem(element: UsageTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'header': {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
        item.description = element.description;
        item.iconPath = new vscode.ThemeIcon(element.icon);
        return item;
      }
      case 'row': {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.description = element.value;
        item.iconPath = new vscode.ThemeIcon(element.icon);
        return item;
      }
      case 'provider': {
        const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
        item.description = element.status;
        item.tooltip = element.error ?? element.status;
        item.iconPath = new vscode.ThemeIcon(
          element.error ? 'warning' : 'check'
        );
        return item;
      }
      case 'quota': {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        const resetPart = element.resetAt ? ` — resets in ${formatResetIn(element.resetAt)}` : '';
        item.description = `${element.percent}% (${formatNumber(element.used)}/${formatNumber(element.limit)})${resetPart}`;
        const color =
          element.percent >= 85
            ? new vscode.ThemeColor('charts.red')
            : element.percent >= 60
            ? new vscode.ThemeColor('charts.yellow')
            : new vscode.ThemeColor('charts.green');
        item.iconPath = new vscode.ThemeIcon('circle-filled', color);
        return item;
      }
    }
  }

  getChildren(element?: UsageTreeNode): UsageTreeNode[] {
    if (element) { return []; } // Leaf nodes have no children

    const data = this.service.getCached();

    if (!data) {
      return [
        {
          kind: 'row',
          label: 'No data yet',
          value: 'Click ↺ to refresh',
          icon: 'info',
        },
      ];
    }

    const nodes: UsageTreeNode[] = [];

    // ── Summary ──────────────────────────────────────────────────────────────
    nodes.push({
      kind: 'header',
      label: 'Token Usage',
      description: '',
      icon: 'graph',
    });

    nodes.push(
      {
        kind: 'row',
        label: 'Last 5 hours',
        value: formatNumber(data.bestTokensLast5h),
        icon: 'clock',
      },
      {
        kind: 'row',
        label: 'Last 7 days',
        value: formatNumber(data.bestTokensLast7d),
        icon: 'calendar',
      },
      {
        kind: 'row',
        label: 'Last refreshed',
        value: data.lastRefreshed ? formatDisplayTime(data.lastRefreshed) : '—',
        icon: 'sync',
      }
    );

    // ── Claude quota rows (injected after summary rows) ────────────────────
    const claudeEntry = data.providers.find(
      (p) => p.name === 'Claude (OAuth)' && !p.usage.error
    );
    if (claudeEntry) {
      const { sessionUsage, weeklyUsage, opusUsage } = claudeEntry.usage;
      if (sessionUsage) {
        nodes.push({
          kind: 'quota',
          label: 'Session usage',
          ...sessionUsage,
        });
      }
      if (weeklyUsage) {
        nodes.push({
          kind: 'quota',
          label: 'Weekly usage',
          ...weeklyUsage,
        });
      }
      if (opusUsage) {
        nodes.push({
          kind: 'quota',
          label: 'Opus usage',
          used: opusUsage.used,
          limit: opusUsage.limit,
          percent: opusUsage.percent,
          resetAt: null,
        });
      }
    }

    // ── Providers ─────────────────────────────────────────────────────────────
    nodes.push({
      kind: 'header',
      label: 'Providers',
      description: '',
      icon: 'server',
    });

    for (const p of data.providers) {
      let status: string;
      if (p.usage.error?.startsWith('No ') || p.usage.error?.includes('No API key')) {
        status = 'No key';
      } else if (p.usage.error) {
        status = `Error`;
      } else {
        status = `OK — ${formatNumber(p.usage.tokensLast7d)} tok/7d`;
      }

      nodes.push({
        kind: 'provider',
        name: p.name,
        status,
        error: p.usage.error,
      });
    }

    return nodes;
  }
}

function formatNumber(n: number): string {
  if (n === 0) { return '0'; }
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(2)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
  return n.toString();
}

function formatResetIn(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) { return '—'; }

  const totalMinutes = Math.floor(diffMs / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays >= 1) {
    const remainingHours = totalHours - totalDays * 24;
    return remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays}d`;
  }
  if (totalHours >= 1) {
    const remainingMinutes = totalMinutes - totalHours * 60;
    return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
  }
  return `${totalMinutes}m`;
}

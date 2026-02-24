/**
 * Extension entry point — Prompt Queue + Usage Monitor
 */
import * as vscode from 'vscode';
import { QueueStore } from './queue/QueueStore';
import { QueueProcessor } from './queue/QueueProcessor';
import { OpenAIUsageProvider } from './usage/OpenAIUsageProvider';
import { AnthropicUsageProvider } from './usage/AnthropicUsageProvider';
import { LocalEstimateProvider } from './usage/LocalEstimateProvider';
import { UsageService } from './usage/UsageService';
import { UsageViewProvider } from './ui/UsageViewProvider';
import { QueueWebviewProvider } from './ui/QueueWebviewProvider';
import { generateShortId } from './util/crypto';
import { addHours, formatDisplayTime, parseRateLimitDelay, parseRateLimitMessage, RateLimitInfo } from './util/time';

export function activate(context: vscode.ExtensionContext): void {
  // ── Output channel ─────────────────────────────────────────────────────────
  const log = vscode.window.createOutputChannel('PromptQueue');
  log.appendLine('[Extension] Activating Prompt Queue + Usage Monitor…');
  context.subscriptions.push(log);

  // ── Queue ──────────────────────────────────────────────────────────────────
  const store = new QueueStore(context.globalState);
  const processor = new QueueProcessor(store, log);

  // ── Usage providers ────────────────────────────────────────────────────────
  const openaiProvider = new OpenAIUsageProvider(context.secrets, log);
  const anthropicProvider = new AnthropicUsageProvider(context.secrets, log);
  const localProvider = new LocalEstimateProvider(store);

  const usageService = new UsageService(
    [openaiProvider, anthropicProvider, localProvider],
    log
  );

  // ── Tree views ─────────────────────────────────────────────────────────────
  const usageViewProvider = new UsageViewProvider(usageService);
  const queueWebviewProvider = new QueueWebviewProvider(store, processor, log);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('usageMonitorView', usageViewProvider),
    vscode.window.registerWebviewViewProvider(
      QueueWebviewProvider.viewType,
      queueWebviewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Commands — Queue ───────────────────────────────────────────────────────

  /**
   * Main queue command.
   * 1. Get prompt text (from selection, clipboard, or input).
   * 2. Ask for delay.
   * 3. Enqueue.
   */
  const cmdQueuePrompt = vscode.commands.registerCommand('promptQueue.queuePrompt', async () => {
    const promptText = await getPromptText('Enter the prompt to queue:');
    if (!promptText) { return; }
    await enqueuePrompt(promptText);
  });

  const cmdQueueFromClipboard = vscode.commands.registerCommand(
    'promptQueue.queueFromClipboard',
    async () => {
      const text = await vscode.env.clipboard.readText();
      if (!text.trim()) {
        vscode.window.showWarningMessage('Clipboard is empty.');
        return;
      }
      await enqueuePrompt(text);
    }
  );

  const cmdQueueFromEditor = vscode.commands.registerCommand(
    'promptQueue.queueFromEditor',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return;
      }
      const selection = editor.selection;
      const text = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);
      if (!text.trim()) {
        vscode.window.showWarningMessage('Editor / selection is empty.');
        return;
      }
      await enqueuePrompt(text);
    }
  );

  const cmdProcessNow = vscode.commands.registerCommand('promptQueue.processNow', async () => {
    await processor.process();
    queueWebviewProvider.refresh();
    vscode.window.showInformationMessage('PromptQueue: Queue processed.');
  });

  /**
   * "I'm Rate Limited" — the primary entry point when hitting a rate limit.
   *
   * Flow:
   *  1. Read clipboard → try to parse reset time automatically
   *  2. If not found → show input box to paste the error message
   *  3. Confirm the parsed delay with the user (or let them override)
   *  4. Ask for prompt text
   *  5. Queue with computed delay
   */
  const cmdImRateLimited = vscode.commands.registerCommand('promptQueue.imRateLimited', async () => {
    // ── Step 1: try clipboard ──────────────────────────────────────────────
    let rateLimitInfo: RateLimitInfo | undefined;
    let sourceLabel = '';

    try {
      const clip = await vscode.env.clipboard.readText();
      if (clip.trim()) {
        rateLimitInfo = parseRateLimitMessage(clip);
        if (rateLimitInfo) { sourceLabel = 'clipboard'; }
      }
    } catch { /* ignore clipboard errors */ }

    // ── Step 2: also check active editor selection ─────────────────────────
    if (!rateLimitInfo) {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        const sel = editor.document.getText(editor.selection);
        rateLimitInfo = parseRateLimitMessage(sel);
        if (rateLimitInfo) { sourceLabel = 'editor selection'; }
      }
    }

    // ── Step 3: if nothing found → ask user to paste the message ──────────
    if (!rateLimitInfo) {
      const pasted = await vscode.window.showInputBox({
        title: 'Rate Limit — Paste the error message',
        prompt:
          'Copy the rate-limit error from Claude Code or Copilot, then paste it here.\n' +
          'Examples: "try again in 4h 30m" · "resets at 14:30" · "retry after 45 minutes"',
        placeHolder: 'Paste error message here…',
        ignoreFocusOut: true,
      });

      if (!pasted) { return; } // user cancelled

      rateLimitInfo = parseRateLimitMessage(pasted);
      sourceLabel = 'pasted message';

      if (!rateLimitInfo) {
        // Fallback: ask for manual delay
        const manualStr = await vscode.window.showInputBox({
          title: 'Rate Limit — Manual delay',
          prompt: 'Could not detect a reset time. Enter the delay manually (hours):',
          value: '5',
          validateInput: v => (isNaN(parseFloat(v)) || parseFloat(v) <= 0 ? 'Positive number required' : null),
          ignoreFocusOut: true,
        });
        if (!manualStr) { return; }
        const h = parseFloat(manualStr);
        rateLimitInfo = {
          delayHours: h,
          resetAt: new Date(Date.now() + h * 3_600_000),
          rawMatch: manualStr,
          confidence: 'low',
        };
        sourceLabel = 'manual input';
      }
    }

    // ── Step 4: show parsed result and let user confirm / adjust ──────────
    const { delayHours, resetAt, confidence } = rateLimitInfo;
    const resetLabel = resetAt ? formatDisplayTime(resetAt) : `in ${delayHours}h`;
    const confidenceTag = confidence === 'high' ? '' : ` (${confidence} confidence)`;

    const confirmItems: vscode.QuickPickItem[] = [
      {
        label: `$(clock) Queue for ${resetLabel}${confidenceTag}`,
        description: `Detected from ${sourceLabel} — delay: ${delayHours}h`,
        detail: `Your prompt will be delivered as a .md file at ${resetLabel}`,
      },
      {
        label: '$(edit) Change delay',
        description: 'Override the detected delay',
      },
      {
        label: '$(close) Cancel',
      },
    ];

    const picked = await vscode.window.showQuickPick(confirmItems, {
      title: '⏰ Rate Limit Detected',
      placeHolder: 'Confirm the queuing delay',
      ignoreFocusOut: true,
    });

    if (!picked || picked.label.includes('Cancel')) { return; }

    let finalDelay = delayHours;

    if (picked.label.includes('Change delay')) {
      const overrideStr = await vscode.window.showInputBox({
        title: 'Override delay (hours)',
        value: String(delayHours),
        validateInput: v => (isNaN(parseFloat(v)) || parseFloat(v) <= 0 ? 'Positive number required' : null),
        ignoreFocusOut: true,
      });
      if (!overrideStr) { return; }
      finalDelay = parseFloat(overrideStr);
    }

    // ── Step 5: get prompt text ────────────────────────────────────────────
    const promptText = await getRateLimitedPromptText();
    if (!promptText) { return; }

    // ── Step 6: queue ──────────────────────────────────────────────────────
    const now = new Date();
    const notBefore = addHours(now, finalDelay);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    const item = {
      id: generateShortId(),
      createdAt: now.toISOString(),
      notBefore: notBefore.toISOString(),
      promptText,
      workspaceFolder,
      processed: false,
    };

    await store.add(item);
    queueWebviewProvider.refresh();

    const resetStr = formatDisplayTime(notBefore);
    log.appendLine(`[Extension] Rate-limited queue: ${item.id} notBefore=${item.notBefore}`);
    vscode.window.showInformationMessage(
      `⏰ PromptQueue: Prompt queued — will be delivered at ${resetStr}  [id: ${item.id}]`
    );
  });

  // ── Commands — Usage ───────────────────────────────────────────────────────

  const cmdRefreshUsage = vscode.commands.registerCommand('usage.refresh', async () => {
    await usageService.refresh();
  });

  const cmdShowSummary = vscode.commands.registerCommand('usage.showSummary', async () => {
    const data = usageService.getCached();
    if (!data) {
      vscode.window.showInformationMessage('No usage data yet. Run "Usage: Refresh" first.');
      return;
    }

    const lines: string[] = [
      `**Token Usage Summary**`,
      ``,
      `- Last 5 hours: **${fmtNum(data.bestTokensLast5h)}** tokens`,
      `- Last 7 days:  **${fmtNum(data.bestTokensLast7d)}** tokens`,
      ``,
      `**Providers:**`,
    ];
    for (const p of data.providers) {
      const status = p.usage.error ? `⚠ ${p.usage.error.slice(0, 80)}` : '✓ OK';
      lines.push(`- ${p.name}: ${status}`);
    }
    if (data.lastRefreshed) {
      lines.push(``, `_Last refreshed: ${formatDisplayTime(data.lastRefreshed)}_`);
    }

    const panel = vscode.window.createWebviewPanel(
      'usageSummary',
      'Usage Summary',
      vscode.ViewColumn.Beside,
      {}
    );
    panel.webview.html = markdownToHtml(lines.join('\n'));
    context.subscriptions.push(panel);
  });

  const cmdSetOpenAIKey = vscode.commands.registerCommand('usage.setOpenAIKey', async () => {
    const key = await vscode.window.showInputBox({
      prompt: 'Paste your OpenAI admin API key (sk-org-… or sk-…). Stored in SecretStorage.',
      password: true,
      placeHolder: 'sk-org-…',
      ignoreFocusOut: true,
    });
    if (!key) { return; }
    await OpenAIUsageProvider.setKey(context.secrets, key.trim());
    vscode.window.showInformationMessage('OpenAI API key saved. Run "Usage: Refresh" to fetch data.');
  });

  const cmdSetAnthropicKey = vscode.commands.registerCommand('usage.setAnthropicKey', async () => {
    const key = await vscode.window.showInputBox({
      prompt: 'Paste your Anthropic admin API key. Stored in SecretStorage.',
      password: true,
      placeHolder: 'sk-ant-admin-…',
      ignoreFocusOut: true,
    });
    if (!key) { return; }
    await AnthropicUsageProvider.setKey(context.secrets, key.trim());
    vscode.window.showInformationMessage('Anthropic admin key saved. Run "Usage: Refresh" to fetch data.');
  });

  const cmdClearOpenAIKey = vscode.commands.registerCommand('usage.clearOpenAIKey', async () => {
    await OpenAIUsageProvider.clearKey(context.secrets);
    vscode.window.showInformationMessage('OpenAI API key cleared.');
  });

  const cmdClearAnthropicKey = vscode.commands.registerCommand('usage.clearAnthropicKey', async () => {
    await AnthropicUsageProvider.clearKey(context.secrets);
    vscode.window.showInformationMessage('Anthropic admin key cleared.');
  });

  // ── Register everything ────────────────────────────────────────────────────
  context.subscriptions.push(
    cmdQueuePrompt,
    cmdQueueFromClipboard,
    cmdQueueFromEditor,
    cmdImRateLimited,
    cmdProcessNow,
    cmdRefreshUsage,
    cmdShowSummary,
    cmdSetOpenAIKey,
    cmdSetAnthropicKey,
    cmdClearOpenAIKey,
    cmdClearAnthropicKey,
  );

  // ── Start background processes ─────────────────────────────────────────────
  processor.start();

  const config = vscode.workspace.getConfiguration('usage');
  const refreshInterval: number = config.get('refreshIntervalMinutes', 10);
  usageService.start(refreshInterval);

  // Initial processing pass + usage refresh (deferred slightly)
  setTimeout(() => {
    processor.process().catch(err => log.appendLine(`[Extension] Initial process error: ${err}`));
    usageService.refresh().catch(err => log.appendLine(`[Extension] Initial usage refresh error: ${err}`));
  }, 2000);

  context.subscriptions.push({
    dispose: () => {
      processor.stop();
      usageService.stop();
    },
  });

  log.appendLine('[Extension] Activated.');

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Specifically for "I'm rate limited" flow:
   * Offers 3 sources in a QuickPick so the user can pick the right one.
   */
  async function getRateLimitedPromptText(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    const hasSelection = editor && !editor.selection.isEmpty;
    const hasEditorContent = !!editor;

    const sources: vscode.QuickPickItem[] = [];

    if (hasSelection) {
      sources.push({
        label: '$(selection) Use current editor selection',
        description: `${editor.document.getText(editor.selection).slice(0, 60)}…`,
      });
    }
    if (hasEditorContent && !hasSelection) {
      sources.push({
        label: '$(file-text) Use entire current file',
        description: editor.document.fileName.split('/').pop(),
      });
    }
    sources.push(
      { label: '$(clippy) Paste from clipboard', description: 'Use whatever is in your clipboard' },
      { label: '$(edit) Type a prompt now', description: 'Open an input box' },
    );

    const pick = await vscode.window.showQuickPick(sources, {
      title: 'What prompt do you want to queue?',
      placeHolder: 'Choose the source for your prompt',
      ignoreFocusOut: true,
    });

    if (!pick) { return undefined; }

    if (pick.label.includes('selection')) {
      return editor!.document.getText(editor!.selection);
    }
    if (pick.label.includes('entire current file')) {
      return editor!.document.getText();
    }
    if (pick.label.includes('clipboard')) {
      const clip = await vscode.env.clipboard.readText();
      if (!clip.trim()) {
        vscode.window.showWarningMessage('Clipboard is empty.');
        return undefined;
      }
      return clip;
    }
    // Type now
    return vscode.window.showInputBox({
      title: 'Enter your prompt',
      placeHolder: 'Type or paste your prompt here…',
      ignoreFocusOut: true,
    });
  }

  /**
   * Get prompt text:
   *   1. Active editor selection
   *   2. If no selection → show input box
   */
  async function getPromptText(placeholder: string): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      return editor.document.getText(editor.selection);
    }

    // Show input box — for multi-line prompts user can paste
    return vscode.window.showInputBox({
      prompt: placeholder,
      placeHolder: 'Paste or type your prompt here…',
      ignoreFocusOut: true,
    });
  }

  /**
   * Ask for delay, create queue item.
   */
  async function enqueuePrompt(promptText: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('promptQueue');
    const defaultDelay: number = cfg.get('defaultDelayHours', 5);

    // Try to detect rate-limit hint in clipboard / active editor
    let suggestedDelay = defaultDelay;
    try {
      const clip = await vscode.env.clipboard.readText();
      const parsed = parseRateLimitDelay(clip);
      if (parsed) { suggestedDelay = Math.ceil(parsed * 10) / 10; }
    } catch { /* ignore */ }

    const delayStr = await vscode.window.showInputBox({
      prompt: `Delay before delivery (hours). Detected: ${suggestedDelay}h`,
      value: String(suggestedDelay),
      validateInput: (v) => {
        const n = parseFloat(v);
        if (isNaN(n) || n < 0) { return 'Enter a positive number'; }
        return null;
      },
      ignoreFocusOut: true,
    });

    if (delayStr === undefined) { return; } // User cancelled

    const delayHours = parseFloat(delayStr);
    const now = new Date();
    const notBefore = addHours(now, delayHours);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    const item = {
      id: generateShortId(),
      createdAt: now.toISOString(),
      notBefore: notBefore.toISOString(),
      promptText,
      workspaceFolder,
      processed: false,
    };

    await store.add(item);
    queueWebviewProvider.refresh();

    vscode.window.showInformationMessage(
      `PromptQueue: Queued for ${formatDisplayTime(notBefore)}  [id: ${item.id}]`
    );

    log.appendLine(`[Extension] Queued ${item.id} notBefore=${item.notBefore}`);
  }
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions
}

// ── Formatting helpers (not exported) ─────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(2)}M`; }
  if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}K`; }
  return n.toString();
}

function markdownToHtml(md: string): string {
  // Very minimal converter — only for the summary panel
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
         color: var(--vscode-foreground); background: var(--vscode-editor-background);
         padding: 16px; line-height: 1.6; }
  code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; }
  ul { padding-left: 1.5em; }
</style>
</head>
<body>${html}</body>
</html>`;
}

import * as vscode from 'vscode';
import * as nodeCrypto from 'crypto';
import { QueueStore, QueueItem } from '../queue/QueueStore';
import { QueueProcessor } from '../queue/QueueProcessor';
import { generateShortId } from '../util/crypto';
import { addHours, formatDisplayTime, isOverdue, parseRateLimitMessage, RateLimitInfo } from '../util/time';

// ── Message types (webview → extension) ───────────────────────────────────────
type InMsg =
  | { type: 'ready' }
  | { type: 'detectRateLimit' }
  | { type: 'pasteClipboard' }
  | { type: 'useSelection' }
  | { type: 'queuePrompt'; promptText: string; delayHours: number }
  | { type: 'deleteItem'; id: string }
  | { type: 'processNow' }
  | { type: 'forceSend'; id: string };

// ── Message types (extension → webview) ───────────────────────────────────────
type OutMsg =
  | { type: 'rateLimitDetected'; info: RateLimitInfo | null }
  | { type: 'textLoaded'; text: string }
  | { type: 'queueUpdated'; items: QueueItem[] }
  | { type: 'queued' }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string };

export class QueueWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptQueueView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly store: QueueStore,
    private readonly processor: QueueProcessor,
    private readonly log: vscode.OutputChannel,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.buildHtml();

    webviewView.webview.onDidReceiveMessage(async (msg: InMsg) => {
      try { await this.handle(msg); }
      catch (err) {
        this.log.appendLine(`[QueueWebview] ${err}`);
        this.post({ type: 'toast', level: 'error', message: String(err) });
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) { this.sendQueue(); }
    });

    this.processor.onDidChange(() => this.sendQueue());
  }

  /** Force a queue-list refresh from outside (e.g. after command-palette queue). */
  refresh(): void { this.sendQueue(); }

  // ── Private helpers ────────────────────────────────────────────────────────

  private post(msg: OutMsg): void {
    this._view?.webview.postMessage(msg);
  }

  private sendQueue(): void {
    this.post({ type: 'queueUpdated', items: this.store.getAll() });
  }

  private async handle(msg: InMsg): Promise<void> {
    switch (msg.type) {

      case 'ready':
        this.sendQueue();
        await this.tryDetect();   // auto-parse clipboard on first render
        break;

      case 'detectRateLimit':
        await this.tryDetect();
        break;

      case 'pasteClipboard': {
        const text = await vscode.env.clipboard.readText();
        if (!text.trim()) {
          this.post({ type: 'toast', level: 'warn', message: 'Clipboard is empty.' });
          return;
        }
        this.post({ type: 'textLoaded', text });
        break;
      }

      case 'useSelection': {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          this.post({ type: 'toast', level: 'warn', message: 'No selection in active editor.' });
          return;
        }
        this.post({ type: 'textLoaded', text: editor.document.getText(editor.selection) });
        break;
      }

      case 'queuePrompt': {
        const { promptText, delayHours } = msg;
        if (!promptText.trim()) {
          this.post({ type: 'toast', level: 'warn', message: 'Prompt is empty.' });
          return;
        }
        const now = new Date();
        const item: QueueItem = {
          id: generateShortId(),
          createdAt: now.toISOString(),
          notBefore: addHours(now, delayHours).toISOString(),
          promptText,
          workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
          processed: false,
        };
        await this.store.add(item);
        this.log.appendLine(`[QueueWebview] Queued ${item.id} → ${item.notBefore}`);
        this.post({ type: 'queued' });
        this.sendQueue();
        vscode.window.showInformationMessage(
          `⏰ Queued for ${formatDisplayTime(new Date(item.notBefore))}  [id: ${item.id}]`
        );
        break;
      }

      case 'deleteItem':
        await this.store.remove(msg.id);
        this.sendQueue();
        break;

      case 'processNow': {
        const count = await this.processor.process();
        this.sendQueue();
        if (count === 0) {
          this.post({ type: 'toast', level: 'info', message: 'No overdue items to process.' });
        } else {
          this.post({ type: 'toast', level: 'info', message: `Sent ${count} prompt(s) to Claude.` });
        }
        break;
      }

      case 'forceSend':
        await this.processor.forceDeliver(msg.id);
        this.sendQueue();
        break;
    }
  }

  private async tryDetect(): Promise<void> {
    try {
      const clip = await vscode.env.clipboard.readText();
      const info = clip.trim() ? parseRateLimitMessage(clip) : null;
      this.post({ type: 'rateLimitDetected', info: info ?? null });
    } catch {
      this.post({ type: 'rateLimitDetected', info: null });
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private buildHtml(): string {
    const nonce = nodeCrypto.randomBytes(16).toString('base64');
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 0 12px 24px;
    line-height: 1.5;
  }

  /* ── Sections ─────────────────────────────────────────────────────────── */
  .section {
    padding: 12px 0 10px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
  }
  .section:last-child { border-bottom: none; }

  .section-title {
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--vscode-sideBarTitle-foreground, var(--vscode-descriptionForeground));
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* ── Rate limit card ──────────────────────────────────────────────────── */
  .rl-card {
    background: var(--vscode-editorWidget-background, var(--vscode-input-background));
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 8px;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rl-icon { font-size: 1.1em; flex-shrink: 0; }
  .rl-text { flex: 1; }
  .rl-label {
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .rl-sub {
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    margin-top: 1px;
  }
  .rl-card.detected {
    border-color: var(--vscode-focusBorder, #007acc);
    background: var(--vscode-editor-selectionHighlightBackground,
      color-mix(in srgb, var(--vscode-focusBorder, #007acc) 10%, transparent));
  }
  .rl-card.none {
    border-style: dashed;
    color: var(--vscode-descriptionForeground);
  }

  /* ── Delay row ────────────────────────────────────────────────────────── */
  .delay-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .delay-row label {
    color: var(--vscode-descriptionForeground);
    font-size: 0.88em;
    white-space: nowrap;
  }
  .delay-input {
    width: 68px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 3px 6px;
    font-size: var(--vscode-font-size, 13px);
    font-family: inherit;
  }
  .delay-input:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }
  .delivery-time {
    font-size: 0.85em;
    color: var(--vscode-textLink-foreground, #4fc1ff);
    font-weight: 500;
    white-space: nowrap;
  }
  .arrow { color: var(--vscode-descriptionForeground); }

  /* ── Prompt textarea ──────────────────────────────────────────────────── */
  .prompt-toolbar {
    display: flex;
    gap: 4px;
    margin-bottom: 5px;
  }
  textarea {
    width: 100%;
    min-height: 130px;
    resize: vertical;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 7px 8px;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 0.92em;
    line-height: 1.5;
    display: block;
  }
  textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }
  textarea::placeholder { color: var(--vscode-input-placeholderForeground); }

  .hint {
    font-size: 0.78em;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
    min-height: 16px;
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */
  button {
    cursor: pointer;
    font-family: inherit;
    font-size: var(--vscode-font-size, 13px);
    border: none;
    border-radius: 2px;
    padding: 4px 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    width: 100%;
    justify-content: center;
    padding: 7px;
    margin-top: 10px;
    font-weight: 500;
    font-size: 0.95em;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }
  .btn-primary:disabled {
    opacity: .45;
    cursor: default;
  }

  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.2));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    width: 100%;
    justify-content: center;
    padding: 5px;
    font-size: 0.88em;
  }
  .btn-secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.3));
  }

  .btn-small {
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.15));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    padding: 3px 8px;
    font-size: 0.82em;
  }
  .btn-small:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.25));
  }

  .btn-icon {
    background: transparent;
    color: var(--vscode-descriptionForeground);
    padding: 2px 5px;
    font-size: 1em;
  }
  .btn-icon:hover { color: var(--vscode-foreground); }

  /* ── Badge ────────────────────────────────────────────────────────────── */
  .badge {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 10px;
    padding: 0 6px;
    font-size: 0.78em;
    font-weight: 600;
    min-width: 18px;
    text-align: center;
  }

  /* ── Queue list ───────────────────────────────────────────────────────── */
  .queue-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .queue-header .title { flex: 1; }

  .queue-item {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 7px 6px;
    border-radius: 3px;
    margin-bottom: 3px;
    background: var(--vscode-list-inactiveSelectionBackground, transparent);
    border: 1px solid transparent;
    transition: background .1s;
  }
  .queue-item:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,.12));
  }
  .queue-item.overdue {
    border-color: var(--vscode-editorWarning-foreground, #cca700);
  }
  .queue-item.delivered {
    opacity: .55;
  }

  .item-icon { font-size: 0.95em; flex-shrink: 0; margin-top: 1px; }
  .item-body { flex: 1; min-width: 0; }
  .item-time {
    font-size: 0.82em;
    font-weight: 600;
    color: var(--vscode-textLink-foreground, #4fc1ff);
    margin-bottom: 2px;
  }
  .item-time.delivered-label {
    color: var(--vscode-testing-iconPassed, #89d185);
  }
  .item-preview {
    font-size: 0.84em;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
  }
  .queue-item:hover .item-actions { opacity: 1; }
  .item-delete, .item-send {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 3px;
    font-size: 0.9em;
    border-radius: 2px;
    color: var(--vscode-descriptionForeground);
  }
  .item-delete:hover { color: var(--vscode-errorForeground, #f48771); }
  .item-send:hover { color: var(--vscode-textLink-foreground, #4fc1ff); }

  .empty-state {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    padding: 8px 4px;
    font-style: italic;
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */
  #toast {
    position: sticky;
    bottom: 0;
    left: 0; right: 0;
    padding: 6px 10px;
    border-radius: 3px;
    font-size: 0.85em;
    display: none;
    margin-top: 8px;
  }
  #toast.info { background: var(--vscode-editorInfo-background, #1b4b6e); color: var(--vscode-editorInfo-foreground, #75bfff); }
  #toast.warn { background: var(--vscode-editorWarning-background, #5a4b00); color: var(--vscode-editorWarning-foreground, #cca700); }
  #toast.error { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: var(--vscode-errorForeground, #f48771); }
</style>
</head>
<body>

<!-- ── Rate limit section ─────────────────────────────────────────────────── -->
<div class="section">
  <div class="section-title">⏰ Rate Limit</div>

  <div class="rl-card none" id="rlCard">
    <span class="rl-icon" id="rlIcon">🔍</span>
    <div class="rl-text">
      <div class="rl-label" id="rlLabel">No rate limit detected</div>
      <div class="rl-sub" id="rlSub">Copy the error message and click below</div>
    </div>
  </div>

  <button class="btn-secondary" id="detectBtn">
    🔍 Detect from clipboard
  </button>
</div>

<!-- ── New prompt form ────────────────────────────────────────────────────── -->
<div class="section">
  <div class="section-title">✏️ Your Prompt</div>

  <div class="delay-row">
    <label for="delayInput">Queue in</label>
    <input class="delay-input" type="number" id="delayInput" value="5" min="0.1" step="0.5">
    <span class="arrow">h →</span>
    <span class="delivery-time" id="deliveryTime"></span>
  </div>

  <div class="prompt-toolbar">
    <button class="btn-small" id="pasteBtn">📋 Paste clipboard</button>
    <button class="btn-small" id="selBtn">✂️ Use selection</button>
  </div>

  <textarea id="promptInput"
    placeholder="Write or paste your prompt here.&#10;It will be saved as a .md file when the rate limit resets."></textarea>

  <div class="hint" id="tokenHint"></div>

  <button class="btn-primary" id="queueBtn" disabled>
    ⏰ Queue Prompt
  </button>
</div>

<!-- ── Queue list ─────────────────────────────────────────────────────────── -->
<div class="section">
  <div class="queue-header section-title">
    <span class="title">Queue</span>
    <span class="badge" id="pendingBadge">0</span>
    <button class="btn-icon" id="processNowBtn" title="Process due items now">↻</button>
  </div>
  <div id="queueList"><div class="empty-state">No prompts queued yet.</div></div>
</div>

<div id="toast"></div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();

  // ── Restore persisted state ──────────────────────────────────────────────
  const saved = vscode.getState() || {};
  let delayHours = saved.delayHours ?? 5;
  let promptText = saved.promptText ?? '';

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const rlCard       = document.getElementById('rlCard');
  const rlIcon       = document.getElementById('rlIcon');
  const rlLabel      = document.getElementById('rlLabel');
  const rlSub        = document.getElementById('rlSub');
  const detectBtn    = document.getElementById('detectBtn');
  const delayInput   = document.getElementById('delayInput');
  const deliveryTime = document.getElementById('deliveryTime');
  const pasteBtn     = document.getElementById('pasteBtn');
  const selBtn       = document.getElementById('selBtn');
  const promptInput  = document.getElementById('promptInput');
  const tokenHint    = document.getElementById('tokenHint');
  const queueBtn     = document.getElementById('queueBtn');
  const pendingBadge = document.getElementById('pendingBadge');
  const queueList    = document.getElementById('queueList');
  const processNowBtn= document.getElementById('processNowBtn');
  const toast        = document.getElementById('toast');

  // ── Restore persisted values ─────────────────────────────────────────────
  delayInput.value   = delayHours;
  promptInput.value  = promptText;
  updateDeliveryTime();
  updateTokenHint();
  updateQueueBtn();

  // ── Event listeners ───────────────────────────────────────────────────────
  detectBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'detectRateLimit' });
  });

  delayInput.addEventListener('input', () => {
    delayHours = parseFloat(delayInput.value) || 5;
    persist();
    updateDeliveryTime();
  });

  pasteBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'pasteClipboard' });
  });

  selBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'useSelection' });
  });

  promptInput.addEventListener('input', () => {
    promptText = promptInput.value;
    persist();
    updateTokenHint();
    updateQueueBtn();
  });

  queueBtn.addEventListener('click', () => {
    const text = promptInput.value.trim();
    const delay = parseFloat(delayInput.value) || 5;
    if (!text) { showToast('warn', 'Please enter a prompt.'); return; }
    queueBtn.disabled = true;
    queueBtn.textContent = 'Queuing…';
    vscode.postMessage({ type: 'queuePrompt', promptText: text, delayHours: delay });
  });

  processNowBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'processNow' });
  });

  // ── Messages from extension ───────────────────────────────────────────────
  window.addEventListener('message', ({ data: msg }) => {
    switch (msg.type) {

      case 'rateLimitDetected':
        renderRateLimit(msg.info);
        if (msg.info) {
          // Auto-fill the delay
          delayHours = msg.info.delayHours;
          delayInput.value = delayHours;
          persist();
          updateDeliveryTime();
        }
        break;

      case 'textLoaded':
        promptInput.value = msg.text;
        promptText = msg.text;
        persist();
        updateTokenHint();
        updateQueueBtn();
        promptInput.focus();
        break;

      case 'queueUpdated':
        renderQueueItems(msg.items);
        break;

      case 'queued':
        // Reset form after successful queue
        promptInput.value = '';
        promptText = '';
        persist();
        updateTokenHint();
        updateQueueBtn();
        queueBtn.disabled = false;
        queueBtn.textContent = '⏰ Queue Prompt';
        showToast('info', 'Prompt queued successfully!');
        break;

      case 'toast':
        showToast(msg.level, msg.message);
        if (msg.level !== 'info') {
          // Re-enable button if error occurred during queue
          queueBtn.disabled = !promptInput.value.trim();
          queueBtn.textContent = '⏰ Queue Prompt';
        }
        break;
    }
  });

  // ── Rate limit render ─────────────────────────────────────────────────────
  function renderRateLimit(info) {
    if (!info) {
      rlCard.className = 'rl-card none';
      rlIcon.textContent = '🔍';
      rlLabel.textContent = 'No rate limit detected';
      rlSub.textContent = 'Copy the error message and click below';
      return;
    }
    rlCard.className = 'rl-card detected';
    rlIcon.textContent = '⏰';
    const h = Math.floor(info.delayHours);
    const m = Math.round((info.delayHours - h) * 60);
    const timeLabel = info.resetAt
      ? 'at ' + formatTime(new Date(info.resetAt))
      : 'in ' + info.delayHours + 'h';
    rlLabel.textContent = 'Rate limit detected — resets ' + timeLabel;
    rlSub.textContent =
      (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'min ' : '') +
      '· ' + (info.confidence === 'high' ? 'high confidence' : info.confidence + ' confidence');
  }

  // ── Delivery time ─────────────────────────────────────────────────────────
  function updateDeliveryTime() {
    const h = parseFloat(delayInput.value) || 0;
    if (h <= 0) { deliveryTime.textContent = ''; return; }
    const d = new Date(Date.now() + h * 3600000);
    deliveryTime.textContent = formatTime(d);
  }

  function formatTime(d) {
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const timeStr = hh + ':' + mm;
    if (isToday) return 'today ' + timeStr;
    if (isTomorrow) return 'tomorrow ' + timeStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + timeStr;
  }

  // ── Token hint ────────────────────────────────────────────────────────────
  function updateTokenHint() {
    const len = promptInput.value.length;
    if (len === 0) { tokenHint.textContent = ''; return; }
    const est = Math.ceil(len / 4);
    tokenHint.textContent = '~' + est + ' tokens estimated · ' + len + ' chars';
  }

  // ── Queue button ──────────────────────────────────────────────────────────
  function updateQueueBtn() {
    queueBtn.disabled = !promptInput.value.trim();
  }

  // ── Queue list render ─────────────────────────────────────────────────────
  function renderQueueItems(items) {
    const pending = items.filter(i => !i.processed);
    const done    = items.filter(i =>  i.processed).slice(0, 3); // show last 3 delivered

    pendingBadge.textContent = pending.length;

    if (items.length === 0) {
      queueList.innerHTML = '<div class="empty-state">No prompts queued yet.</div>';
      return;
    }

    const sorted = [
      ...pending.sort((a, b) => new Date(a.notBefore) - new Date(b.notBefore)),
      ...done.sort((a, b) => new Date(b.notBefore) - new Date(a.notBefore)),
    ];

    queueList.innerHTML = sorted.map(item => {
      const due = !item.processed && new Date(item.notBefore) <= new Date();
      const cls = item.processed ? 'delivered' : due ? 'overdue' : '';
      const icon = item.processed ? '✓' : due ? '🔴' : '⏰';
      const timeLabel = item.processed
        ? 'Delivered ' + formatTime(new Date(item.notBefore))
        : formatTime(new Date(item.notBefore));
      const timeCls = item.processed ? 'item-time delivered-label' : 'item-time';
      const preview = (item.promptText || '').replace(/\\n/g, ' ').slice(0, 72);
      const previewTrunc = item.promptText.length > 72 ? preview + '…' : preview;

      return \`<div class="queue-item \${cls}" title="\${esc(item.promptText)}">
  <span class="item-icon">\${icon}</span>
  <div class="item-body">
    <div class="\${timeCls}">\${timeLabel}</div>
    <div class="item-preview">\${esc(previewTrunc)}</div>
  </div>
  \${!item.processed ? \`<div class="item-actions">
    <button class="item-send" data-id="\${item.id}" title="Send to Claude now">➤</button>
    <button class="item-delete" data-id="\${item.id}" title="Remove">×</button>
  </div>\` : ''}
</div>\`;
    }).join('');

    // Wire send buttons
    queueList.querySelectorAll('.item-send').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'forceSend', id: btn.dataset.id });
      });
    });

    // Wire delete buttons
    queueList.querySelectorAll('.item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'deleteItem', id: btn.dataset.id });
      });
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  let toastTimer;
  function showToast(level, message) {
    toast.textContent = message;
    toast.className = level;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function persist() {
    vscode.setState({ delayHours, promptText });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
  }
}

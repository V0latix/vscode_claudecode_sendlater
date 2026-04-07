import * as vscode from "vscode";
import * as nodeCrypto from "crypto";
import {
  QueueStore,
  QueueItem,
  DeliveryLogEntry,
  isValidQueueItemShape,
} from "../queue/QueueStore";
import { QueueProcessor } from "../queue/QueueProcessor";
import { generateShortId } from "../util/crypto";
import { addMinutes, formatDisplayTime, isOverdue } from "../util/time";

// ── Message types (webview → extension) ───────────────────────────────────────
type InMsg =
  | { type: "ready" }
  | { type: "triggerRateLimitCommand" }
  | { type: "pasteClipboard" }
  | { type: "useSelection" }
  | { type: "queuePrompt"; promptText: string; delayMinutes: number }
  | { type: "deleteItem"; id: string }
  | { type: "processNow" }
  | { type: "forceSend"; id: string }
  | { type: "snoozeItem"; id: string; minutes: number }
  | { type: "editItem"; id: string; promptText: string; notBefore: string }
  | { type: "exportQueue" }
  | { type: "importQueue" }
  | { type: "togglePause" };

// ── Message types (extension → webview) ───────────────────────────────────────
type OutMsg =
  | { type: "textLoaded"; text: string }
  | {
      type: "queueUpdated";
      items: QueueItem[];
      deliveryLog: DeliveryLogEntry[];
      paused: boolean;
    }
  | { type: "queued" }
  | { type: "toast"; level: "info" | "warn" | "error"; message: string };

export class QueueWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "promptQueueView";
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
      try {
        await this.handle(msg);
      } catch (err) {
        this.log.appendLine(`[QueueWebview] ${err}`);
        this.post({ type: "toast", level: "error", message: String(err) });
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.sendQueue();
      }
    });

    this.processor.onDidChange(() => this.sendQueue());
  }

  /** Force a queue-list refresh from outside (e.g. after command-palette queue). */
  refresh(): void {
    this.sendQueue();
  }

  /**
   * Export pending queue items to a JSON file chosen by the user.
   * Machine-specific fields (workspaceFolder, targetTerminalName, deliveryAttempts)
   * are stripped so the export is portable across machines.
   */
  async exportQueue(): Promise<void> {
    const items = this.store.getPending();
    if (items.length === 0) {
      vscode.window.showInformationMessage(
        "PromptQueue: Nothing to export — queue is empty.",
      );
      return;
    }
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file("prompt-queue-export.json"),
      filters: { JSON: ["json"] },
      title: "Export Prompt Queue",
    });
    if (!uri) {
      return;
    }
    // Strip machine-specific fields — they won't transfer to another workspace.
    const portable = items.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({
        workspaceFolder: _wf,
        targetTerminalName: _tn,
        deliveryAttempts: _da,
        ...rest
      }) => rest,
    );
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(JSON.stringify(portable, null, 2), "utf8"),
    );
    vscode.window.showInformationMessage(
      `PromptQueue: Exported ${items.length} item(s).`,
    );
  }

  /**
   * Import queue items from a JSON file chosen by the user.
   * - Validates required fields (id, promptText, notBefore) before inserting.
   * - Resets machine-specific fields to safe defaults for the current machine.
   * - Skips duplicates (same id already in store).
   */
  async importQueue(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { JSON: ["json"] },
      title: "Import Prompt Queue",
    });
    if (!uris || uris.length === 0) {
      return;
    }
    const content = await vscode.workspace.fs.readFile(uris[0]);
    let rawItems: unknown[];
    try {
      const parsed: unknown = JSON.parse(Buffer.from(content).toString("utf8"));
      if (!Array.isArray(parsed)) {
        throw new Error("not an array");
      }
      rawItems = parsed;
    } catch {
      this.post({
        type: "toast",
        level: "error",
        message: "Invalid JSON file — expected an array of queue items.",
      });
      return;
    }

    const existing = new Set(this.store.getAll().map((i) => i.id));
    let added = 0;
    for (const raw of rawItems) {
      if (!isValidQueueItemShape(raw) || existing.has(raw.id)) {
        continue;
      }
      await this.store.add({
        ...raw,
        processed: false,
        deliveryAttempts: 0,
        // Reset machine-specific routing to safe defaults for the current machine.
        workspaceFolder:
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
        targetTerminalName: undefined,
      });
      added++;
    }
    this.sendQueue();
    const skipped = rawItems.length - added;
    vscode.window.showInformationMessage(
      `PromptQueue: Imported ${added} item(s)${skipped > 0 ? ` (${skipped} skipped — invalid or duplicate)` : ""}.`,
    );
  }

  private updateBadge(): void {
    if (!this._view) {
      return;
    }
    const pending = this.store.getPending().length;
    this._view.badge =
      pending > 0
        ? { value: pending, tooltip: `${pending} prompt(s) queued` }
        : undefined;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private post(msg: OutMsg): void {
    this._view?.webview.postMessage(msg);
  }

  private sendQueue(): void {
    this.updateBadge();
    this.post({
      type: "queueUpdated",
      items: this.store.getAll(),
      deliveryLog: this.store.getDeliveryLog(),
      paused: this.processor.isPaused(),
    });
  }

  private async handle(msg: InMsg): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.sendQueue();
        break;

      case "triggerRateLimitCommand":
        await vscode.commands.executeCommand("promptQueue.imRateLimited");
        break;

      case "pasteClipboard": {
        const text = await vscode.env.clipboard.readText();
        if (!text.trim()) {
          this.post({
            type: "toast",
            level: "warn",
            message: "Clipboard is empty.",
          });
          return;
        }
        this.post({ type: "textLoaded", text });
        break;
      }

      case "useSelection": {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          this.post({
            type: "toast",
            level: "warn",
            message: "No selection in active editor.",
          });
          return;
        }
        this.post({
          type: "textLoaded",
          text: editor.document.getText(editor.selection),
        });
        break;
      }

      case "queuePrompt": {
        const { promptText, delayMinutes } = msg;
        if (!promptText.trim()) {
          this.post({
            type: "toast",
            level: "warn",
            message: "Prompt is empty.",
          });
          return;
        }
        const now = new Date();
        const item: QueueItem = {
          id: generateShortId(),
          createdAt: now.toISOString(),
          notBefore: addMinutes(now, delayMinutes).toISOString(),
          promptText,
          workspaceFolder:
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
          processed: false,
          targetTerminalName: vscode.window.activeTerminal?.name,
        };
        await this.store.add(item);
        this.log.appendLine(
          `[QueueWebview] Queued ${item.id} → ${item.notBefore}`,
        );
        this.post({ type: "queued" });
        this.sendQueue();
        vscode.window.showInformationMessage(
          `⏰ Queued for ${formatDisplayTime(new Date(item.notBefore))}  [id: ${item.id}]`,
        );
        break;
      }

      case "deleteItem":
        await this.store.remove(msg.id);
        this.sendQueue();
        break;

      case "processNow": {
        const count = await this.processor.process();
        this.sendQueue();
        if (count === 0) {
          this.post({
            type: "toast",
            level: "info",
            message: "No overdue items to process.",
          });
        } else {
          this.post({
            type: "toast",
            level: "info",
            message: `Sent ${count} prompt(s) to Claude.`,
          });
        }
        break;
      }

      case "forceSend":
        // forceDeliver fires onDidChange → sendQueue() via listener; no manual refresh needed.
        await this.processor.forceDeliver(msg.id);
        break;

      case "snoozeItem": {
        const item = this.store.getAll().find((i) => i.id === msg.id);
        if (!item) {
          return;
        }
        const base = new Date(
          Math.max(Date.now(), new Date(item.notBefore).getTime()),
        );
        // Reset deliveryAttempts: user is rescheduling, so start fresh.
        await this.store.update(msg.id, {
          notBefore: addMinutes(base, msg.minutes).toISOString(),
          deliveryAttempts: 0,
        });
        this.sendQueue();
        break;
      }

      case "editItem": {
        if (!msg.promptText.trim()) {
          this.post({
            type: "toast",
            level: "warn",
            message: "Prompt cannot be empty.",
          });
          return;
        }
        // Reset deliveryAttempts: user is manually rescheduling, so start fresh.
        await this.store.update(msg.id, {
          promptText: msg.promptText,
          notBefore: msg.notBefore,
          deliveryAttempts: 0,
        });
        this.sendQueue();
        break;
      }

      case "exportQueue":
        await this.exportQueue();
        break;

      case "importQueue":
        await this.importQueue();
        break;

      case "togglePause":
        // Delegate to command so extension.ts can persist state in globalState.
        await vscode.commands.executeCommand("promptQueue.togglePause");
        break;
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private buildHtml(): string {
    const nonce = nodeCrypto.randomBytes(16).toString("base64");
    return /* html */ `<!DOCTYPE html>
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

  /* ── Section header row (mode toggle + rl hint) ──────────────────────── */
  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 8px;
  }

  /* ── Rate-limit hint button ───────────────────────────────────────────── */
  .btn-rl-hint {
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: 1px dashed var(--vscode-input-border, rgba(128,128,128,.3));
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 0.78em;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
  }
  .btn-rl-hint:hover {
    color: var(--vscode-foreground);
    border-color: var(--vscode-focusBorder, #007acc);
    background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.1));
  }

  /* ── Mode toggle ──────────────────────────────────────────────────────── */
  .mode-toggle {
    display: flex;
    gap: 0;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,.3));
    border-radius: 3px;
    overflow: hidden;
    width: fit-content;
  }
  .mode-btn {
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    border-radius: 0;
    padding: 4px 10px;
    font-size: 0.82em;
    cursor: pointer;
    transition: background .1s, color .1s;
  }
  .mode-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
  .mode-btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
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
  .time-input { width: 90px; }
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
    cursor: default;
  }
  .queue-item.expanded .item-preview {
    white-space: pre-wrap;
    overflow: visible;
    text-overflow: clip;
    max-height: 120px;
    overflow-y: auto;
  }
  .item-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
  }
  .queue-item:hover .item-actions { opacity: 1; }
  .item-delete, .item-send, .item-snooze, .item-edit {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 3px;
    font-size: 0.9em;
    border-radius: 2px;
    color: var(--vscode-descriptionForeground);
  }
  .item-delete:hover { color: var(--vscode-errorForeground, #f48771); }
  .item-send:hover   { color: var(--vscode-textLink-foreground, #4fc1ff); }
  .item-snooze:hover { color: var(--vscode-testing-iconPassed, #89d185); }
  .item-edit:hover   { color: var(--vscode-foreground); }
  .item-snooze { font-size: 0.78em; padding: 0 4px; }

  /* ── Inline edit form ─────────────────────────────────────────────────── */
  .edit-form { margin-top: 5px; }
  .edit-textarea {
    width: 100%;
    min-height: 72px;
    resize: vertical;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-focusBorder, #007acc);
    border-radius: 2px;
    padding: 5px 7px;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 0.88em;
    line-height: 1.4;
    display: block;
  }
  .edit-time-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
  }
  .edit-datetime {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 2px 5px;
    font-family: inherit;
    font-size: 0.88em;
  }
  .edit-btn-row {
    display: flex;
    gap: 4px;
    margin-top: 5px;
  }
  .item-save {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .item-save:hover { background: var(--vscode-button-hoverBackground); }
  .item-cancel {
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.2));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .item-cancel:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.3)); }

  .empty-state {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    padding: 8px 4px;
    font-style: italic;
  }

  /* ── Delivery history ─────────────────────────────────────────────────── */
  .history-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.1));
    font-size: 0.82em;
  }
  .history-item:last-child { border-bottom: none; }
  .history-icon { flex-shrink: 0; width: 14px; text-align: center; }
  .history-item.delivered .history-icon { color: var(--vscode-testing-iconPassed, #89d185); }
  .history-item.failed .history-icon { color: var(--vscode-errorForeground, #f48771); }
  .history-body { flex: 1; min-width: 0; }
  .history-time { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .history-preview {
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .history-item.failed .history-preview { color: var(--vscode-errorForeground, #f48771); }

  /* ── Pause notice ────────────────────────────────────────────────────── */
  .pause-notice {
    font-size: 0.82em;
    color: var(--vscode-editorWarning-foreground, #cca700);
    background: var(--vscode-inputValidation-warningBackground, rgba(204,167,0,.12));
    border-radius: 3px;
    padding: 4px 8px;
    margin-bottom: 6px;
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
  #toast.info { background: var(--vscode-inputValidation-infoBackground, var(--vscode-editorInfo-background)); color: var(--vscode-inputValidation-infoForeground, var(--vscode-editorInfo-foreground)); }
  #toast.warn { background: var(--vscode-inputValidation-warningBackground, var(--vscode-editorWarning-background)); color: var(--vscode-inputValidation-warningForeground, var(--vscode-editorWarning-foreground)); }
  #toast.error { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: var(--vscode-errorForeground, #f48771); }
</style>
</head>
<body>

<!-- ── New prompt form ────────────────────────────────────────────────────── -->
<div class="section">
  <div class="section-title">✏️ Your Prompt</div>

  <div class="section-header-row">
    <div class="mode-toggle">
      <button class="mode-btn active" id="modeDelay">In X min</button>
      <button class="mode-btn" id="modeAt">At time</button>
    </div>
    <button class="btn-rl-hint" id="rlHintBtn" title="Detect rate-limit reset time from clipboard">⚡ Rate-limited?</button>
  </div>

  <div class="delay-row" id="rowDelay">
    <label for="delayInput">Queue in</label>
    <input class="delay-input" type="number" id="delayInput" value="30" min="1" step="5">
    <span class="arrow">min →</span>
    <span class="delivery-time" id="deliveryTime"></span>
  </div>

  <div class="delay-row" id="rowAt" style="display:none">
    <label for="atTimeInput">At</label>
    <input class="delay-input time-input" type="time" id="atTimeInput" value="22:00">
    <span class="arrow">→</span>
    <span class="delivery-time" id="deliveryTimeAt"></span>
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
    <button class="btn-icon" id="pauseBtn" title="Pause queue processing">⏸</button>
    <button class="btn-icon" id="exportBtn" title="Export queue to JSON">⬇</button>
    <button class="btn-icon" id="importBtn" title="Import queue from JSON">⬆</button>
    <button class="btn-icon" id="processNowBtn" title="Process due items now">↻</button>
  </div>
  <div id="pauseNotice" class="pause-notice" style="display:none">⏸ Queue processing paused</div>
  <div id="queueList"><div class="empty-state">No prompts queued yet.</div></div>
</div>

<!-- ── Delivery history ────────────────────────────────────────────────────── -->
<div class="section" id="historySection" style="display:none">
  <div class="section-title">📋 Delivery History</div>
  <div id="historyList"></div>
</div>

<div id="toast"></div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();

  // ── Restore persisted state ──────────────────────────────────────────────
  const saved = vscode.getState() || {};
  let delayMinutes = saved.delayMinutes ?? 30;
  let promptText = saved.promptText ?? '';
  let delayMode = saved.delayMode ?? 'delay'; // 'delay' | 'at'
  let lastItems = []; // last queue snapshot, used for local re-renders

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const rlHintBtn     = document.getElementById('rlHintBtn');
  const modeDelayBtn  = document.getElementById('modeDelay');
  const modeAtBtn     = document.getElementById('modeAt');
  const rowDelay      = document.getElementById('rowDelay');
  const rowAt         = document.getElementById('rowAt');
  const delayInput    = document.getElementById('delayInput');
  const deliveryTime  = document.getElementById('deliveryTime');
  const atTimeInput   = document.getElementById('atTimeInput');
  const deliveryTimeAt= document.getElementById('deliveryTimeAt');
  const pasteBtn      = document.getElementById('pasteBtn');
  const selBtn        = document.getElementById('selBtn');
  const promptInput   = document.getElementById('promptInput');
  const tokenHint     = document.getElementById('tokenHint');
  const queueBtn      = document.getElementById('queueBtn');
  const pendingBadge  = document.getElementById('pendingBadge');
  const queueList     = document.getElementById('queueList');
  const pauseBtn        = document.getElementById('pauseBtn');
  const exportBtn       = document.getElementById('exportBtn');
  const importBtn       = document.getElementById('importBtn');
  const pauseNotice     = document.getElementById('pauseNotice');
  const processNowBtn   = document.getElementById('processNowBtn');
  const toast           = document.getElementById('toast');
  const historySection  = document.getElementById('historySection');
  const historyList     = document.getElementById('historyList');

  // ── Restore persisted values ─────────────────────────────────────────────
  delayInput.value  = delayMinutes;
  promptInput.value = promptText;
  if (saved.atTime) { atTimeInput.value = saved.atTime; }
  applyMode(delayMode);
  updateDeliveryTime();
  updateDeliveryTimeAt();
  updateTokenHint();
  updateQueueBtn();

  // ── Event listeners ───────────────────────────────────────────────────────
  rlHintBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'triggerRateLimitCommand' });
  });

  modeDelayBtn.addEventListener('click', () => { applyMode('delay'); persist(); });
  modeAtBtn.addEventListener('click',    () => { applyMode('at');    persist(); });

  delayInput.addEventListener('input', () => {
    delayMinutes = parseFloat(delayInput.value) || 30;
    persist();
    updateDeliveryTime();
  });

  atTimeInput.addEventListener('input', () => {
    persist();
    updateDeliveryTimeAt();
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
    if (!text) { showToast('warn', 'Please enter a prompt.'); return; }
    const delay = delayMode === 'at' ? minutesUntilTime(atTimeInput.value) : (parseFloat(delayInput.value) || 30);
    if (delay === null) { showToast('warn', 'Invalid time.'); return; }
    queueBtn.disabled = true;
    queueBtn.textContent = 'Queuing…';
    vscode.postMessage({ type: 'queuePrompt', promptText: text, delayMinutes: delay });
  });

  processNowBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'processNow' });
  });

  pauseBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'togglePause' });
  });

  exportBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'exportQueue' });
  });

  importBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'importQueue' });
  });

  // ── Messages from extension ───────────────────────────────────────────────
  window.addEventListener('message', ({ data: msg }) => {
    switch (msg.type) {

      case 'textLoaded':
        promptInput.value = msg.text;
        promptText = msg.text;
        persist();
        updateTokenHint();
        updateQueueBtn();
        promptInput.focus();
        break;

      case 'queueUpdated':
        lastItems = msg.items;
        updatePauseState(msg.paused); // update before render so item buttons reflect current state
        renderQueueItems(lastItems);
        renderDeliveryLog(msg.deliveryLog || []);
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

  // ── Mode helpers ──────────────────────────────────────────────────────────
  function applyMode(mode) {
    delayMode = mode;
    const isAt = mode === 'at';
    rowDelay.style.display = isAt ? 'none' : '';
    rowAt.style.display    = isAt ? '' : 'none';
    modeDelayBtn.classList.toggle('active', !isAt);
    modeAtBtn.classList.toggle('active',    isAt);
  }

  /** Returns minutes until the given "HH:MM" string (next occurrence). */
  function minutesUntilTime(value) {
    if (!value) { return null; }
    const [hh, mm] = value.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) { return null; }
    const target = new Date();
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1); // next day
    }
    return (target.getTime() - Date.now()) / 60_000;
  }

  // ── Delivery time ─────────────────────────────────────────────────────────
  function updateDeliveryTime() {
    const m = parseFloat(delayInput.value) || 0;
    if (m <= 0) { deliveryTime.textContent = ''; return; }
    const d = new Date(Date.now() + m * 60000);
    deliveryTime.textContent = formatTime(d);
  }

  function updateDeliveryTimeAt() {
    const mins = minutesUntilTime(atTimeInput.value);
    if (mins === null) { deliveryTimeAt.textContent = ''; return; }
    const d = new Date(Date.now() + mins * 60_000);
    deliveryTimeAt.textContent = formatTime(d);
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

  // ── Pause state ───────────────────────────────────────────────────────────
  let queueIsPaused = false;

  function updatePauseState(paused) {
    queueIsPaused = paused;
    pauseBtn.textContent = paused ? '▶' : '⏸';
    pauseBtn.title = paused ? 'Resume queue processing' : 'Pause queue processing';
    pauseNotice.style.display = paused ? '' : 'none';
  }

  // ── Queue list render ─────────────────────────────────────────────────────
  let editingId = null;

  function renderQueueItems(items) {
    const pending = items.filter(i => !i.processed);
    const done    = items.filter(i =>  i.processed).slice(0, 3);

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
      const preview = (item.promptText || '').replace(/\\n/g, ' ').slice(0, 200);
      const previewTrunc = item.promptText.length > 200 ? preview + '…' : preview;
      const isEditing = editingId === item.id;

      const editForm = isEditing ? \`<div class="edit-form">
    <textarea class="edit-textarea" data-id="\${item.id}">\${esc(item.promptText)}</textarea>
    <div class="edit-time-row">
      <span>At</span>
      <input type="datetime-local" class="edit-datetime" data-id="\${item.id}" value="\${toDatetimeLocal(item.notBefore)}">
    </div>
    <div class="edit-btn-row">
      <button class="btn-small item-save" data-id="\${item.id}">✓ Save</button>
      <button class="btn-small item-cancel" data-id="\${item.id}">Cancel</button>
    </div>
  </div>\` : \`<div class="item-preview">\${esc(previewTrunc)}</div>\`;

      const sendTitle = queueIsPaused ? 'Force-send to Claude now (bypasses pause)' : 'Send to Claude now';
      const actions = !item.processed ? \`<div class="item-actions">
    <button class="item-snooze" data-id="\${item.id}" data-minutes="15" title="Snooze +15 min">+15m</button>
    <button class="item-snooze" data-id="\${item.id}" data-minutes="60" title="Snooze +1 hour">+1h</button>
    <button class="item-edit" data-id="\${item.id}" title="Edit">✏</button>
    <button class="item-send" data-id="\${item.id}" title="\${sendTitle}">➤</button>
    <button class="item-delete" data-id="\${item.id}" title="Remove">×</button>
  </div>\` : '';

      return \`<div class="queue-item \${cls}\${isEditing ? ' editing' : ''}" title="\${isEditing ? '' : esc(item.promptText)}">
  <span class="item-icon">\${icon}</span>
  <div class="item-body">
    <div class="\${timeCls}">\${timeLabel}</div>
    \${editForm}
  </div>
  \${actions}
</div>\`;
    }).join('');

    // Wire snooze buttons
    queueList.querySelectorAll('.item-snooze').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'snoozeItem', id: btn.dataset.id, minutes: Number(btn.dataset.minutes) });
      });
    });

    // Wire edit buttons
    queueList.querySelectorAll('.item-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        editingId = editingId === btn.dataset.id ? null : btn.dataset.id;
        renderQueueItems(lastItems);
      });
    });

    // Wire save buttons
    queueList.querySelectorAll('.item-save').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const textarea = queueList.querySelector(\`.edit-textarea[data-id="\${id}"]\`);
        const dtInput  = queueList.querySelector(\`.edit-datetime[data-id="\${id}"]\`);
        if (!textarea || !dtInput) { return; }
        const newNotBefore = new Date(dtInput.value).toISOString();
        vscode.postMessage({ type: 'editItem', id, promptText: textarea.value, notBefore: newNotBefore });
        editingId = null;
      });
    });

    // Wire cancel buttons
    queueList.querySelectorAll('.item-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        editingId = null;
        renderQueueItems(lastItems);
      });
    });

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

    // Click on preview → toggle expand
    queueList.querySelectorAll('.item-preview').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        el.closest('.queue-item').classList.toggle('expanded');
      });
    });
  }

  /** Convert ISO UTC string to datetime-local value (YYYY-MM-DDTHH:MM) in local time. */
  function toDatetimeLocal(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
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

  // ── Delivery history render ───────────────────────────────────────────────
  function renderDeliveryLog(log) {
    if (!log.length) {
      historySection.style.display = 'none';
      return;
    }
    historySection.style.display = '';
    historyList.innerHTML = log.map(entry => {
      const icon = entry.status === 'delivered' ? '✓' : '✕';
      const cls  = entry.status === 'delivered' ? 'delivered' : 'failed';
      const time = formatTime(new Date(entry.timestamp));
      const detail = entry.error
        ? esc(entry.promptPreview) + ' — ' + esc(entry.error.slice(0, 60))
        : esc(entry.promptPreview);
      return \`<div class="history-item \${cls}">
  <span class="history-icon">\${icon}</span>
  <div class="history-body">
    <div class="history-time">\${time}</div>
    <div class="history-preview">\${detail}</div>
  </div>
</div>\`;
    }).join('');
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
    vscode.setState({ delayMinutes, promptText, delayMode, atTime: atTimeInput.value });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
  }
}

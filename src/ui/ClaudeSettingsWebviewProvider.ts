import * as vscode from "vscode";
import * as nodeCrypto from "crypto";
import {
  ClaudeSettings,
  SETTINGS_PATH,
  readSettings,
  writeSettings,
} from "../settings/ClaudeSettingsService";

// ── Message types (webview → extension) ───────────────────────────────────────
type InMsg =
  | { type: "ready" }
  | { type: "save"; settings: ClaudeSettings }
  | { type: "openRawFile" };

// ── Message types (extension → webview) ───────────────────────────────────────
type OutMsg =
  | { type: "loaded"; settings: ClaudeSettings; filePath: string }
  | { type: "saveOk" }
  | { type: "toast"; level: "info" | "warn" | "error"; message: string };

export class ClaudeSettingsWebviewProvider
  implements vscode.WebviewViewProvider
{
  static readonly viewType = "claudeSettingsView";
  private _view?: vscode.WebviewView;

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
        this.post({
          type: "toast",
          level: "error",
          message: String(err),
        });
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.pushSettings();
      }
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private post(msg: OutMsg): void {
    this._view?.webview.postMessage(msg);
  }

  private pushSettings(): void {
    const result = readSettings();
    if (!result.ok) {
      this.post({ type: "toast", level: "error", message: result.error });
      return;
    }
    this.post({
      type: "loaded",
      settings: result.settings,
      filePath: result.filePath,
    });
  }

  private async handle(msg: InMsg): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.pushSettings();
        break;

      case "save": {
        const result = writeSettings(msg.settings);
        if (!result.ok) {
          this.post({ type: "toast", level: "error", message: result.error });
          return;
        }
        this.post({ type: "saveOk" });
        this.post({ type: "toast", level: "info", message: "Settings saved." });
        break;
      }

      case "openRawFile": {
        const uri = vscode.Uri.file(SETTINGS_PATH);
        await vscode.commands.executeCommand("vscode.open", uri);
        break;
      }
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
  }

  /* ── Field rows ───────────────────────────────────────────────────────── */
  .field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .field-label {
    font-size: 0.88em;
    color: var(--vscode-foreground);
  }
  .field-desc {
    font-size: 0.78em;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
  }

  /* ── Toggle / Checkbox ────────────────────────────────────────────────── */
  .toggle-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  input[type="checkbox"] {
    width: 14px;
    height: 14px;
    cursor: pointer;
    accent-color: var(--vscode-button-background);
  }

  /* ── Select ───────────────────────────────────────────────────────────── */
  select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 3px 6px;
    font-family: inherit;
    font-size: var(--vscode-font-size, 13px);
    cursor: pointer;
  }
  select:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }

  /* ── Permission lists ─────────────────────────────────────────────────── */
  .perm-list {
    margin-bottom: 6px;
  }
  .perm-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 0;
  }
  .perm-text {
    flex: 1;
    font-size: 0.82em;
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .perm-remove {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-size: 1em;
    padding: 0 3px;
    border-radius: 2px;
    line-height: 1;
  }
  .perm-remove:hover { color: var(--vscode-errorForeground, #f48771); }

  .add-row {
    display: flex;
    gap: 5px;
    margin-top: 4px;
  }
  .add-input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 3px 6px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.82em;
  }
  .add-input:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }
  .add-input::placeholder { color: var(--vscode-input-placeholderForeground); }

  .empty-list {
    font-size: 0.78em;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    padding: 2px 0 4px;
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
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    width: 100%;
    justify-content: center;
    padding: 6px;
    margin-top: 4px;
    font-weight: 500;
  }
  .btn-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.2));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    width: 100%;
    justify-content: center;
    padding: 5px;
    font-size: 0.88em;
  }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.3)); }
  .btn-small {
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.15));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    padding: 3px 8px;
    font-size: 0.82em;
  }
  .btn-small:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.25)); }

  /* ── Toast ────────────────────────────────────────────────────────────── */
  #toast {
    position: sticky;
    bottom: 0;
    padding: 6px 10px;
    border-radius: 3px;
    font-size: 0.85em;
    display: none;
    margin-top: 8px;
  }
  #toast.info { background: var(--vscode-inputValidation-infoBackground); color: var(--vscode-inputValidation-infoForeground); }
  #toast.warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground); }
  #toast.error { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: var(--vscode-errorForeground, #f48771); }
</style>
</head>
<body>

<!-- ── Co-author ──────────────────────────────────────────────────────────── -->
<div class="section">
  <div class="section-title">Git Co-author</div>
  <div class="field-row">
    <div>
      <div class="field-label">Include co-authored-by</div>
      <div class="field-desc">Adds "Co-authored-by: Claude" footer to git commits.</div>
    </div>
    <label class="toggle-wrap" title="includeCoAuthoredBy">
      <input type="checkbox" id="coAuthorChk">
    </label>
  </div>
</div>

<!-- ── Theme ──────────────────────────────────────────────────────────────── -->
<div class="section">
  <div class="section-title">Theme</div>
  <div class="field-row">
    <div class="field-label">UI theme</div>
    <select id="themeSelect">
      <option value="">(not set)</option>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </div>
</div>

<!-- ── Permissions: allow ─────────────────────────────────────────────────── -->
<div class="section">
  <div class="section-title">Permissions — Allow</div>
  <div class="perm-list" id="allowList"></div>
  <div class="add-row">
    <input class="add-input" id="allowInput" type="text" placeholder="e.g. Bash(git log *) or Read">
    <button class="btn-small" id="allowAddBtn">+ Add</button>
  </div>
</div>

<!-- ── Permissions: deny ──────────────────────────────────────────────────── -->
<div class="section">
  <div class="section-title">Permissions — Deny</div>
  <div class="perm-list" id="denyList"></div>
  <div class="add-row">
    <input class="add-input" id="denyInput" type="text" placeholder="e.g. Write or Bash(rm *)">
    <button class="btn-small" id="denyAddBtn">+ Add</button>
  </div>
</div>

<!-- ── Actions ────────────────────────────────────────────────────────────── -->
<div class="section">
  <button class="btn-primary" id="saveBtn">💾 Save Settings</button>
  <button class="btn-secondary" id="openRawBtn" style="margin-top:6px">
    📄 Open raw settings.json
  </button>
</div>

<div id="toast"></div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();

  // ── State ─────────────────────────────────────────────────────────────────
  let allowRules = [];
  let denyRules  = [];

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const coAuthorChk = document.getElementById('coAuthorChk');
  const themeSelect  = document.getElementById('themeSelect');
  const allowList    = document.getElementById('allowList');
  const denyList     = document.getElementById('denyList');
  const allowInput   = document.getElementById('allowInput');
  const denyInput    = document.getElementById('denyInput');
  const allowAddBtn  = document.getElementById('allowAddBtn');
  const denyAddBtn   = document.getElementById('denyAddBtn');
  const saveBtn      = document.getElementById('saveBtn');
  const openRawBtn   = document.getElementById('openRawBtn');
  const toast        = document.getElementById('toast');

  // ── Event listeners ───────────────────────────────────────────────────────
  allowAddBtn.addEventListener('click', () => addRule('allow'));
  denyAddBtn.addEventListener('click',  () => addRule('deny'));

  allowInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addRule('allow'); });
  denyInput.addEventListener('keydown',  (e) => { if (e.key === 'Enter') addRule('deny'); });

  saveBtn.addEventListener('click', save);
  openRawBtn.addEventListener('click', () => vscode.postMessage({ type: 'openRawFile' }));

  // ── Messages from extension ───────────────────────────────────────────────
  window.addEventListener('message', ({ data: msg }) => {
    switch (msg.type) {
      case 'loaded':
        applySettings(msg.settings);
        break;
      case 'saveOk':
        saveBtn.textContent = '💾 Save Settings';
        saveBtn.disabled = false;
        break;
      case 'toast':
        showToast(msg.level, msg.message);
        if (msg.level === 'error') {
          saveBtn.textContent = '💾 Save Settings';
          saveBtn.disabled = false;
        }
        break;
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function applySettings(s) {
    coAuthorChk.checked = s.includeCoAuthoredBy === true;
    themeSelect.value   = s.theme ?? '';
    allowRules = (s.permissions?.allow ?? []).slice();
    denyRules  = (s.permissions?.deny  ?? []).slice();
    renderList(allowList, allowRules, 'allow');
    renderList(denyList,  denyRules,  'deny');
  }

  function renderList(container, rules, kind) {
    container.textContent = '';
    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'No rules — all ' + kind + 'ed by default.';
      container.appendChild(empty);
      return;
    }
    for (let i = 0; i < rules.length; i++) {
      const row = document.createElement('div');
      row.className = 'perm-item';

      const text = document.createElement('span');
      text.className = 'perm-text';
      text.textContent = rules[i];
      text.title = rules[i];

      const btn = document.createElement('button');
      btn.className = 'perm-remove';
      btn.textContent = '×';
      btn.title = 'Remove rule';
      btn.addEventListener('click', () => {
        if (kind === 'allow') { allowRules.splice(i, 1); renderList(allowList, allowRules, 'allow'); }
        else                  { denyRules.splice(i, 1);  renderList(denyList,  denyRules,  'deny');  }
      });

      row.appendChild(text);
      row.appendChild(btn);
      container.appendChild(row);
    }
  }

  function addRule(kind) {
    const input = kind === 'allow' ? allowInput : denyInput;
    const rule  = input.value.trim();
    if (!rule) { return; }
    if (kind === 'allow') {
      if (!allowRules.includes(rule)) { allowRules.push(rule); }
      renderList(allowList, allowRules, 'allow');
    } else {
      if (!denyRules.includes(rule)) { denyRules.push(rule); }
      renderList(denyList, denyRules, 'deny');
    }
    input.value = '';
    input.focus();
  }

  function save() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    const settings = {
      includeCoAuthoredBy: coAuthorChk.checked,
      theme: themeSelect.value || null,
      permissions: { allow: allowRules.slice(), deny: denyRules.slice() },
    };
    vscode.postMessage({ type: 'save', settings });
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

  // ── Boot ──────────────────────────────────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
  }
}

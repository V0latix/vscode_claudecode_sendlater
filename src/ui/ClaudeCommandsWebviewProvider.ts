import * as vscode from "vscode";
import * as nodeCrypto from "crypto";
import * as path from "path";
import * as fs from "fs";

export interface ClaudeCommand {
  /** e.g. "git-status" */
  name: string;
  /** e.g. "tools" | "workflows" */
  category: string;
  /** e.g. "/tools/git-status" */
  slash: string;
  /** Value of the `description` frontmatter field */
  description: string;
  /** Absolute path to the .md file */
  filePath: string;
}

export class ClaudeCommandsWebviewProvider
  implements vscode.WebviewViewProvider
{
  public static readonly viewType = "claudeCommandsView";
  private _view?: vscode.WebviewView;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.buildHtml([]);
    this.loadAndRender();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.loadAndRender();
      }
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "openFile") {
        const doc = await vscode.workspace.openTextDocument(msg.path);
        vscode.window.showTextDocument(doc, { preview: true });
      }
      if (msg.type === "refresh") {
        this.loadAndRender();
      }
    });
  }

  refresh(): void {
    this.loadAndRender();
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  private scanCommands(): ClaudeCommand[] {
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsFolder) {
      return [];
    }

    const commandsRoot = path.join(wsFolder, ".claude", "commands");
    if (!fs.existsSync(commandsRoot)) {
      return [];
    }

    const commands: ClaudeCommand[] = [];

    for (const category of fs.readdirSync(commandsRoot)) {
      const categoryPath = path.join(commandsRoot, category);
      if (!fs.statSync(categoryPath).isDirectory()) {
        continue;
      }

      for (const file of fs.readdirSync(categoryPath)) {
        if (!file.endsWith(".md")) {
          continue;
        }
        const filePath = path.join(categoryPath, file);
        const name = file.replace(/\.md$/, "");
        const slash = `/${category}/${name}`;

        let description = "";
        try {
          const content = fs.readFileSync(filePath, "utf8");
          description = parseFrontmatterDescription(content);
        } catch {
          /* ignore unreadable files */
        }

        commands.push({ name, category, slash, description, filePath });
      }
    }

    return commands.sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  }

  private loadAndRender(): void {
    const commands = this.scanCommands();
    if (this._view) {
      this._view.webview.html = this.buildHtml(commands);
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private buildHtml(commands: ClaudeCommand[]): string {
    const nonce = nodeCrypto.randomBytes(16).toString("base64");
    const commandsJson = JSON.stringify(commands);

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

  /* ── Search bar ───────────────────────────────────────────────────────── */
  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 0 8px;
    position: sticky;
    top: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    z-index: 10;
  }
  .search-input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    padding: 4px 8px;
    font-size: var(--vscode-font-size, 13px);
    font-family: inherit;
  }
  .search-input:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }
  .search-input::placeholder { color: var(--vscode-input-placeholderForeground); }

  .btn-icon {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    padding: 3px 5px;
    border-radius: 2px;
    font-size: 1em;
  }
  .btn-icon:hover { color: var(--vscode-foreground); }

  /* ── Category header ──────────────────────────────────────────────────── */
  .category-header {
    font-size: 0.72em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--vscode-sideBarTitle-foreground, var(--vscode-descriptionForeground));
    padding: 10px 0 5px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .category-icon { font-size: 1.1em; }
  .count-badge {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 10px;
    padding: 0 5px;
    font-size: 0.85em;
    min-width: 16px;
    text-align: center;
    margin-left: auto;
  }

  /* ── Command card ─────────────────────────────────────────────────────── */
  .cmd-card {
    padding: 7px 8px;
    border-radius: 3px;
    margin-bottom: 3px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background .1s;
  }
  .cmd-card:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,.12));
    border-color: var(--vscode-focusBorder, transparent);
  }
  .cmd-card:active { opacity: .8; }

  .cmd-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .cmd-slash {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    color: var(--vscode-textLink-foreground, #4fc1ff);
    font-weight: 600;
    flex: 1;
  }
  .cmd-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity .1s;
  }
  .cmd-card:hover .cmd-actions { opacity: 1; }
  .action-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 2px;
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
  }
  .action-btn:hover { color: var(--vscode-foreground); background: rgba(128,128,128,.2); }

  .cmd-desc {
    font-size: 0.83em;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
  }
  .cmd-desc mark {
    background: var(--vscode-editor-findMatchHighlightBackground, rgba(255,200,0,.3));
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }

  /* ── Empty / no-workspace ─────────────────────────────────────────────── */
  .empty {
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    padding: 16px 4px;
    font-style: italic;
    text-align: center;
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */
  #toast {
    position: sticky;
    bottom: 0;
    padding: 5px 10px;
    border-radius: 3px;
    font-size: 0.82em;
    display: none;
    margin-top: 8px;
    background: var(--vscode-editorInfo-background, #1b4b6e);
    color: var(--vscode-editorInfo-foreground, #75bfff);
  }
</style>
</head>
<body>

<div class="search-row">
  <input class="search-input" id="searchInput" type="text" placeholder="Filter commands…" autocomplete="off">
  <button class="btn-icon" id="refreshBtn" title="Refresh">↻</button>
</div>

<div id="commandList"></div>
<div id="toast"></div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const commands = ${commandsJson};

  const searchInput   = document.getElementById('searchInput');
  const commandList   = document.getElementById('commandList');
  const refreshBtn    = document.getElementById('refreshBtn');
  const toast         = document.getElementById('toast');

  let query = '';

  searchInput.addEventListener('input', () => {
    query = searchInput.value.toLowerCase();
    render();
  });

  refreshBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  function render() {
    const filtered = query
      ? commands.filter(c =>
          c.slash.toLowerCase().includes(query) ||
          c.description.toLowerCase().includes(query)
        )
      : commands;

    if (filtered.length === 0) {
      commandList.innerHTML = '<div class="empty">' +
        (commands.length === 0
          ? 'No .claude/commands/ directory found in workspace.'
          : 'No commands match your search.') +
        '</div>';
      return;
    }

    // Group by category
    const groups = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) { groups[cmd.category] = []; }
      groups[cmd.category].push(cmd);
    }

    const categoryIcons = { tools: '🔧', workflows: '⚙️' };
    let html = '';

    for (const [cat, cmds] of Object.entries(groups)) {
      const icon = categoryIcons[cat] || '📁';
      html += \`<div class="category-header">
  <span class="category-icon">\${icon}</span> \${esc(cat)}
  <span class="count-badge">\${cmds.length}</span>
</div>\`;
      for (const cmd of cmds) {
        const desc = highlight(esc(cmd.description), query);
        const slashHl = highlight(esc(cmd.slash), query);
        html += \`<div class="cmd-card" data-path="\${esc(cmd.filePath)}" data-slash="\${esc(cmd.slash)}">
  <div class="cmd-header">
    <span class="cmd-slash">\${slashHl}</span>
    <div class="cmd-actions">
      <button class="action-btn copy-btn" data-slash="\${esc(cmd.slash)}" title="Copy slash command">⎘ copy</button>
      <button class="action-btn open-btn" data-path="\${esc(cmd.filePath)}" title="Open file">↗ open</button>
    </div>
  </div>
  \${desc ? \`<div class="cmd-desc">\${desc}</div>\` : ''}
</div>\`;
      }
    }

    commandList.innerHTML = html;

    // Wire copy buttons
    commandList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.slash).then(() => {
          showToast('Copied: ' + btn.dataset.slash);
        });
      });
    });

    // Wire open buttons
    commandList.querySelectorAll('.open-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'openFile', path: btn.dataset.path });
      });
    });

    // Click on card → copy
    commandList.querySelectorAll('.cmd-card').forEach(card => {
      card.addEventListener('click', () => {
        navigator.clipboard.writeText(card.dataset.slash).then(() => {
          showToast('Copied: ' + card.dataset.slash);
        });
      });
    });
  }

  function highlight(text, q) {
    if (!q) { return text; }
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    let result = '';
    let i = 0;
    while (i < text.length) {
      const idx = lower.indexOf(qLower, i);
      if (idx === -1) { result += text.slice(i); break; }
      result += text.slice(i, idx) + '<mark>' + text.slice(idx, idx + q.length) + '</mark>';
      i = idx + q.length;
    }
    return result;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2000);
  }

  render();
})();
</script>
</body>
</html>`;
  }
}

// ── Frontmatter parser ──────────────────────────────────────────────────────

function parseFrontmatterDescription(content: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return "";
  }
  const descMatch = match[1].match(/^description:\s*["']?(.*?)["']?\s*$/m);
  if (!descMatch) {
    return "";
  }
  return descMatch[1].trim().replace(/^["']|["']$/g, "");
}

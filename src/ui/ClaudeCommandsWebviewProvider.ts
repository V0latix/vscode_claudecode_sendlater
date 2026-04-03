import * as vscode from "vscode";
import * as nodeCrypto from "crypto";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export interface ClaudeCommand {
  /** e.g. "git-status" */
  name: string;
  /** e.g. "tools" | "workflows" */
  category: string;
  /** e.g. "/tools/git-status" */
  slash: string;
  /** Value of the `description` frontmatter field */
  description: string;
  /** Absolute path to the .md file, empty for built-ins */
  filePath: string;
  /** Where the command comes from */
  source: "workspace" | "global" | "plugin" | "builtin";
  /** Plugin name, e.g. "codex" or "vercel" */
  plugin?: string;
}

// ── Native Claude Code built-in commands (extracted from binary v2.1.91) ────
// Source: `strings` on Mach-O + local-jsx marker extraction. Re-run when
// updating Claude Code: python3 script in docs/extract-builtins.md

type BuiltinDef = Omit<ClaudeCommand, "filePath" | "source" | "category">;

const BUILTIN_COMMANDS: BuiltinDef[] = [
  // ── Conversation ──────────────────────────────────────────────────────────
  {
    name: "help",
    slash: "/help",
    description: "Show available commands and usage help",
  },
  {
    name: "clear",
    slash: "/clear",
    description: "Clear conversation history and free context window",
  },
  {
    name: "compact",
    slash: "/compact",
    description: "Compact conversation with an optional summary instruction",
  },
  {
    name: "rewind",
    slash: "/rewind",
    description: "Rewind the conversation to a previous point (double-tap Esc)",
  },
  {
    name: "branch",
    slash: "/branch",
    description: "Create a branch of the current conversation at this point",
  },
  {
    name: "resume",
    slash: "/resume",
    description: "Resume a previous conversation",
  },
  {
    name: "rename",
    slash: "/rename",
    description: "Rename the current conversation",
  },
  {
    name: "export",
    slash: "/export",
    description: "Export the current conversation to a file or clipboard",
  },
  {
    name: "copy",
    slash: "/copy",
    description:
      "Copy Claude's last response to clipboard (or /copy N for Nth-latest)",
  },
  {
    name: "diff",
    slash: "/diff",
    description: "View uncommitted changes and per-turn diffs",
  },
  {
    name: "think-back",
    slash: "/think-back",
    description: "Your 2025 Claude Code Year in Review",
  },
  // ── Mode & Model ─────────────────────────────────────────────────────────
  {
    name: "model",
    slash: "/model",
    description: "Set the AI model for this session",
  },
  {
    name: "effort",
    slash: "/effort",
    description: "Set effort level for model usage (low / medium / high / max)",
  },
  {
    name: "fast",
    slash: "/fast",
    description: "Toggle fast mode (Max subscription only)",
  },
  {
    name: "plan",
    slash: "/plan",
    description: "Enable plan mode or view the current session plan",
  },
  { name: "brief", slash: "/brief", description: "Toggle brief-only mode" },
  { name: "vim", slash: "/vim", description: "Toggle Vim keybindings" },
  // ── Project & Memory ─────────────────────────────────────────────────────
  {
    name: "init",
    slash: "/init",
    description: "Create a CLAUDE.md file with project guidelines",
  },
  { name: "memory", slash: "/memory", description: "Edit Claude memory files" },
  {
    name: "add-dir",
    slash: "/add-dir",
    description: "Add a new working directory to the session",
  },
  // ── Automation & Tasks ───────────────────────────────────────────────────
  {
    name: "hooks",
    slash: "/hooks",
    description: "View hook configurations for tool events",
  },
  {
    name: "tasks",
    slash: "/tasks",
    description: "List and manage background tasks",
  },
  {
    name: "agents",
    slash: "/agents",
    description: "Manage agent configurations",
  },
  {
    name: "loop",
    slash: "/loop",
    description:
      "Run a prompt on a recurring schedule (e.g. /loop 5m check deploy)",
  },
  {
    name: "autocompact",
    slash: "/autocompact",
    description: "Configure the auto-compact window size",
  },
  {
    name: "security-review",
    slash: "/security-review",
    description:
      "Complete a security review of pending changes on the current branch",
  },
  // ── MCP & Skills ─────────────────────────────────────────────────────────
  {
    name: "mcp",
    slash: "/mcp",
    description: "List and manage MCP server connections",
  },
  { name: "skills", slash: "/skills", description: "List available skills" },
  {
    name: "plugin",
    slash: "/plugin",
    description: "Manage Claude Code plugins (install / update / remove)",
  },
  // ── Permissions & Security ───────────────────────────────────────────────
  {
    name: "permissions",
    slash: "/permissions",
    description: "Manage allow & deny tool permission rules",
  },
  {
    name: "review",
    slash: "/review",
    description: "Review the current file or selection",
  },
  {
    name: "pr_comments",
    slash: "/pr_comments",
    description: "Fetch and display open pull request comments",
  },
  // ── UI & Appearance ──────────────────────────────────────────────────────
  {
    name: "color",
    slash: "/color",
    description: "Set a color for this session (useful when multi-Claudes)",
  },
  { name: "theme", slash: "/theme", description: "Change the color theme" },
  {
    name: "config",
    slash: "/config",
    description: "Open config panel — permission mode, model, and more",
  },
  {
    name: "statusline",
    slash: "/statusline",
    description: "Set up a custom status line beneath the input box",
  },
  // ── Status & Monitoring ──────────────────────────────────────────────────
  {
    name: "status",
    slash: "/status",
    description:
      "Show Claude Code status: version, model, account, connectivity",
  },
  { name: "usage", slash: "/usage", description: "Show plan usage limits" },
  {
    name: "cost",
    slash: "/cost",
    description: "Show token usage and cost for the current session",
  },
  {
    name: "stats",
    slash: "/stats",
    description: "Show your Claude Code usage statistics and activity",
  },
  {
    name: "rate-limit-options",
    slash: "/rate-limit-options",
    description: "Show options when rate limit is reached",
  },
  // ── Account & Auth ───────────────────────────────────────────────────────
  { name: "login", slash: "/login", description: "Switch Anthropic accounts" },
  { name: "logout", slash: "/logout", description: "Sign out of Claude Code" },
  {
    name: "upgrade",
    slash: "/upgrade",
    description: "Upgrade to Max for higher rate limits and more Opus",
  },
  {
    name: "passes",
    slash: "/passes",
    description:
      "Share a free week of Claude Code with friends and earn extra usage",
  },
  {
    name: "extra-usage",
    slash: "/extra-usage",
    description: "Configure extra usage to keep working when limits are hit",
  },
  {
    name: "privacy-settings",
    slash: "/privacy-settings",
    description: "View and update your privacy settings",
  },
  {
    name: "feedback",
    slash: "/feedback",
    description: "Submit feedback about Claude Code",
  },
  {
    name: "bug",
    slash: "/bug",
    description: "Submit a bug report to Anthropic",
  },
  {
    name: "doctor",
    slash: "/doctor",
    description: "Verify Claude Code installation health",
  },
  {
    name: "release-notes",
    slash: "/release-notes",
    description: "Show what's new in the current Claude Code version",
  },
  // ── Integrations & Setup ─────────────────────────────────────────────────
  {
    name: "terminal-setup",
    slash: "/terminal-setup",
    description: "Enable Option+Enter / Shift+Enter key bindings for newlines",
  },
  { name: "ide", slash: "/ide", description: "Connect Claude to your IDE" },
  {
    name: "install-github-app",
    slash: "/install-github-app",
    description: "Set up Claude GitHub Actions for a repository",
  },
  {
    name: "install-slack-app",
    slash: "/install-slack-app",
    description: "Install Claude Code in Slack",
  },
  {
    name: "desktop",
    slash: "/desktop",
    description: "Continue this session in Claude Code Desktop",
  },
  {
    name: "mobile",
    slash: "/mobile",
    description: "Show QR code to download the Claude mobile app",
  },
  {
    name: "web-setup",
    slash: "/web-setup",
    description: "Set up Claude Code on the web (requires GitHub account)",
  },
  {
    name: "remote-control",
    slash: "/remote-control",
    description: "Connect this terminal for remote-control sessions",
  },
  {
    name: "remote-env",
    slash: "/remote-env",
    description: "Toggle a searchable tag on the current session",
  },
  {
    name: "session",
    slash: "/session",
    description: "Show remote session URL and QR code",
  },
  // ── Misc ─────────────────────────────────────────────────────────────────
  {
    name: "stickers",
    slash: "/stickers",
    description: "Order Claude Code stickers",
  },
  {
    name: "powerup",
    slash: "/powerup",
    description:
      "Discover Claude Code features through quick interactive lessons",
  },
  {
    name: "buddy",
    slash: "/buddy",
    description: "Hatch a coding companion (/buddy on | off | pet)",
  },
  {
    name: "install",
    slash: "/install",
    description: "Install Claude Code native build",
  },
  {
    name: "ultraplan",
    slash: "/ultraplan",
    description: "Draft a plan on the web that you can edit and approve",
  },
  {
    name: "ultrareview",
    slash: "/ultrareview",
    description: "Show remote session URL and QR code for review",
  },
];

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
    const results: ClaudeCommand[] = [];

    // 1. Workspace-level: <wsFolder>/.claude/commands
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsFolder) {
      const wsRoot = path.join(wsFolder, ".claude", "commands");
      if (fs.existsSync(wsRoot)) {
        results.push(...scanDir(wsRoot, "", "workspace"));
      }
    }

    // 2. Global user-level: ~/.claude/commands
    const globalRoot = path.join(os.homedir(), ".claude", "commands");
    if (fs.existsSync(globalRoot)) {
      results.push(...scanDir(globalRoot, "", "global"));
    }

    // 3. Installed plugins: ~/.claude/plugins/installed_plugins.json
    results.push(...scanPlugins());

    // 4. Built-in Claude Code native commands
    for (const cmd of BUILTIN_COMMANDS) {
      results.push({
        ...cmd,
        category: "built-in",
        filePath: "",
        source: "builtin",
      });
    }

    // Deduplicate by slash (workspace > global > plugin > builtin)
    const seen = new Map<string, ClaudeCommand>();
    const priority: Record<string, number> = {
      workspace: 0,
      global: 1,
      plugin: 2,
      builtin: 3,
    };
    for (const cmd of results) {
      const existing = seen.get(cmd.slash);
      if (!existing || priority[cmd.source] < priority[existing.source]) {
        seen.set(cmd.slash, cmd);
      }
    }

    return Array.from(seen.values()).sort(
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

  .source-badge {
    font-size: 0.72em;
    padding: 1px 5px;
    border-radius: 8px;
    font-weight: 500;
    flex-shrink: 0;
  }
  .source-badge.workspace {
    background: color-mix(in srgb, var(--vscode-textLink-foreground, #4fc1ff) 15%, transparent);
    color: var(--vscode-textLink-foreground, #4fc1ff);
  }
  .source-badge.global {
    background: color-mix(in srgb, var(--vscode-testing-iconPassed, #89d185) 15%, transparent);
    color: var(--vscode-testing-iconPassed, #89d185);
  }
  .source-badge.plugin {
    background: color-mix(in srgb, #c586c0 15%, transparent);
    color: #c586c0;
  }
  .source-badge.builtin {
    background: rgba(128,128,128,.15);
    color: var(--vscode-descriptionForeground);
  }

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

    const categoryIcons = { 'tools': '🔧', 'workflows': '⚙️', 'built-in': '✦', 'commands': '📄' };
    const sourcePriority = { workspace: 0, global: 1, plugin: 2, builtin: 3 };
    // Sort: workspace/global first (α), plugins second (α), built-in last
    const sortedCats = Object.keys(groups).sort((a, b) => {
      const aIsBuiltin = a === 'built-in';
      const bIsBuiltin = b === 'built-in';
      const aIsPlugin = groups[a][0]?.source === 'plugin';
      const bIsPlugin = groups[b][0]?.source === 'plugin';
      if (aIsBuiltin !== bIsBuiltin) { return aIsBuiltin ? 1 : -1; }
      if (aIsPlugin !== bIsPlugin) { return aIsPlugin ? 1 : -1; }
      return a.localeCompare(b);
    });
    let html = '';

    for (const cat of sortedCats) {
      const cmds = groups[cat];
      const isPlugin = cmds[0]?.source === 'plugin';
      const icon = categoryIcons[cat] || (isPlugin ? '🔌' : '📁');
      html += \`<div class="category-header">
  <span class="category-icon">\${icon}</span> \${esc(cat)}
  <span class="count-badge">\${cmds.length}</span>
</div>\`;
      for (const cmd of cmds) {
        const desc = highlight(esc(cmd.description), query);
        const slashHl = highlight(esc(cmd.slash), query);
        const sourceLabel = { workspace: 'ws', global: 'global', plugin: cmd.plugin || 'plugin', builtin: 'native' }[cmd.source] || cmd.source;
        const openBtn = cmd.filePath
          ? \`<button class="action-btn open-btn" data-path="\${esc(cmd.filePath)}" title="Open file">↗ open</button>\`
          : '';
        html += \`<div class="cmd-card" data-path="\${esc(cmd.filePath || '')}" data-slash="\${esc(cmd.slash)}">
  <div class="cmd-header">
    <span class="cmd-slash">\${slashHl}</span>
    <span class="source-badge \${cmd.source}">\${esc(sourceLabel)}</span>
    <div class="cmd-actions">
      <button class="action-btn copy-btn" data-slash="\${esc(cmd.slash)}" title="Copy slash command">⎘ copy</button>
      \${openBtn}
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

// ── Recursive directory scanner ─────────────────────────────────────────────

function scanDir(
  dirPath: string,
  slashPrefix: string,
  source: "workspace" | "global",
): ClaudeCommand[] {
  const results: ClaudeCommand[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...scanDir(entryPath, `${slashPrefix}/${entry}`, source));
    } else if (entry.endsWith(".md")) {
      const name = entry.replace(/\.md$/, "");
      const slash = `${slashPrefix}/${name}`;
      // category = everything between the first / and the last segment
      const parts = slash.split("/").filter(Boolean);
      const category =
        parts.length > 1 ? parts.slice(0, -1).join("/") : "commands";

      let description = "";
      try {
        description = parseFrontmatterDescription(
          fs.readFileSync(entryPath, "utf8"),
        );
      } catch {
        /* ignore unreadable files */
      }

      results.push({
        name,
        category,
        slash,
        description,
        filePath: entryPath,
        source,
      });
    }
  }

  return results;
}

// ── Plugin scanner ───────────────────────────────────────────────────────────

function scanPlugins(): ClaudeCommand[] {
  const results: ClaudeCommand[] = [];
  const registryPath = path.join(
    os.homedir(),
    ".claude",
    "plugins",
    "installed_plugins.json",
  );

  let registry: { plugins?: Record<string, { installPath: string }[]> } = {};
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch {
    return results;
  }

  for (const installs of Object.values(registry.plugins ?? {})) {
    // Take the most recently installed entry
    const install = installs[installs.length - 1];
    if (!install?.installPath) {
      continue;
    }

    const installPath = install.installPath;

    // Resolve plugin name from manifest (.claude-plugin/plugin.json or .plugin/plugin.json)
    let pluginName = "";
    for (const manifestDir of [".claude-plugin", ".plugin"]) {
      const manifestPath = path.join(installPath, manifestDir, "plugin.json");
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (manifest.name) {
          pluginName = manifest.name;
          break;
        }
      } catch {
        /* try next */
      }
    }
    if (!pluginName) {
      continue;
    }

    // Scan installPath/commands/*.md (flat only — plugin commands are never nested)
    const commandsDir = path.join(installPath, "commands");
    let files: string[];
    try {
      files = fs.readdirSync(commandsDir);
    } catch {
      continue;
    }

    for (const file of files) {
      // Skip internal convention files (prefixed with _)
      if (!file.endsWith(".md") || file.startsWith("_")) {
        continue;
      }

      const filePath = path.join(commandsDir, file);
      const name = file.replace(/\.md$/, "");
      const slash = `/${pluginName}:${name}`;

      let description = "";
      try {
        description = parseFrontmatterDescription(
          fs.readFileSync(filePath, "utf8"),
        );
      } catch {
        /* ignore */
      }

      results.push({
        name,
        category: pluginName,
        slash,
        description,
        filePath,
        source: "plugin",
        plugin: pluginName,
      });
    }
  }

  return results;
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

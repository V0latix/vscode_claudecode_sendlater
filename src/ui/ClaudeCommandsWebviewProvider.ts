import * as vscode from "vscode";
import * as nodeCrypto from "crypto";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execSync } from "child_process";

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
  source:
    | "workspace"
    | "global"
    | "plugin"
    | "builtin"
    | "agent"
    | "skill"
    | "mcp";
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

    // 4. Agents: <ws>/.claude/agents/*.md + ~/.claude/agents/*.md
    if (wsFolder) {
      results.push(
        ...scanAgents(path.join(wsFolder, ".claude", "agents"), "workspace"),
      );
    }
    results.push(
      ...scanAgents(path.join(os.homedir(), ".claude", "agents"), "global"),
    );

    // 5. Skills: <ws>/.claude/skills/*/SKILL.md + ~/.claude/skills/*/SKILL.md
    if (wsFolder) {
      results.push(
        ...scanSkills(path.join(wsFolder, ".claude", "skills"), "workspace"),
      );
    }
    results.push(
      ...scanSkills(path.join(os.homedir(), ".claude", "skills"), "global"),
    );

    // 6. MCP servers from ~/.claude/mcp.json + workspace .claude/settings.json
    results.push(...scanMcpServers(wsFolder));

    // 7. Built-in Claude Code native commands (dynamic + hardcoded fallback)
    for (const cmd of loadBuiltins()) {
      results.push({
        ...cmd,
        category: "built-in",
        filePath: "",
        source: "builtin",
      });
    }

    // Deduplicate by slash (workspace > global > plugin > agent > skill > mcp > builtin)
    const seen = new Map<string, ClaudeCommand>();
    const priority: Record<string, number> = {
      workspace: 0,
      global: 1,
      plugin: 2,
      agent: 3,
      skill: 4,
      mcp: 5,
      builtin: 6,
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
  .source-badge.agent {
    background: color-mix(in srgb, #f0a050 15%, transparent);
    color: #f0a050;
  }
  .source-badge.skill {
    background: color-mix(in srgb, #50c8c8 15%, transparent);
    color: #50c8c8;
  }
  .source-badge.mcp {
    background: color-mix(in srgb, #c8c850 15%, transparent);
    color: #c8c850;
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

    const categoryIcons = { 'tools': '🔧', 'workflows': '⚙️', 'built-in': '✦', 'commands': '📄', 'agents': '🤖', 'skills': '⚡', 'mcp': '🔗' };
    const sourceSortOrder = { workspace: 0, global: 1, plugin: 2, agent: 3, skill: 4, mcp: 5, builtin: 6 };
    // Sort: workspace/global first (α), plugins/agents/skills/mcp next (α), built-in last
    const sortedCats = Object.keys(groups).sort((a, b) => {
      const aOrder = sourceSortOrder[groups[a][0]?.source] ?? 2;
      const bOrder = sourceSortOrder[groups[b][0]?.source] ?? 2;
      if (aOrder !== bOrder) { return aOrder - bOrder; }
      return a.localeCompare(b);
    });
    let html = '';

    for (const cat of sortedCats) {
      const cmds = groups[cat];
      const src = cmds[0]?.source;
      const icon = categoryIcons[cat] || (src === 'plugin' ? '🔌' : '📁');
      html += \`<div class="category-header">
  <span class="category-icon">\${icon}</span> \${esc(cat)}
  <span class="count-badge">\${cmds.length}</span>
</div>\`;
      for (const cmd of cmds) {
        const desc = highlight(esc(cmd.description), query);
        const slashHl = highlight(esc(cmd.slash), query);
        const sourceLabel = { workspace: 'ws', global: 'global', plugin: cmd.plugin || 'plugin', builtin: 'native', agent: 'agent', skill: 'skill', mcp: 'mcp' }[cmd.source] || cmd.source;
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

// ── Agent scanner ────────────────────────────────────────────────────────────

export function scanAgents(
  dir: string,
  source: "workspace" | "global",
): ClaudeCommand[] {
  const results: ClaudeCommand[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) {
      continue;
    }
    const filePath = path.join(dir, entry);
    const name = entry.replace(/\.md$/, "");
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
      category: "agents",
      slash: `@${name}`,
      description,
      filePath,
      source: "agent" as const,
    });
  }
  return results;
}

// ── Skill scanner ─────────────────────────────────────────────────────────────

export function scanSkills(
  dir: string,
  source: "workspace" | "global",
): ClaudeCommand[] {
  const results: ClaudeCommand[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const skillDir = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }

    const skillFile = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      continue;
    }

    let description = "";
    try {
      description = parseFrontmatterDescription(
        fs.readFileSync(skillFile, "utf8"),
      );
    } catch {
      /* ignore */
    }

    results.push({
      name: entry,
      category: "skills",
      slash: `/${entry}`,
      description,
      filePath: skillFile,
      source: "skill" as const,
    });
  }
  return results;
}

// ── MCP server scanner ────────────────────────────────────────────────────────

interface McpServerConfig {
  command?: string;
  args?: string[];
  url?: string;
}

export function scanMcpServers(wsFolder: string | undefined): ClaudeCommand[] {
  const results: ClaudeCommand[] = [];
  const seen = new Set<string>();

  function addServer(name: string, cfg: McpServerConfig): void {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    const cmdParts = cfg.command
      ? [cfg.command, ...(cfg.args ?? [])].join(" ")
      : (cfg.url ?? "");
    results.push({
      name,
      category: "mcp",
      slash: `mcp:${name}`,
      description: cmdParts
        ? `MCP server — ${cmdParts.slice(0, 80)}`
        : "MCP server",
      filePath: "",
      source: "mcp" as const,
    });
  }

  // 1. Global ~/.claude/mcp.json
  try {
    const globalMcp = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".claude", "mcp.json"), "utf8"),
    ) as { mcpServers?: Record<string, McpServerConfig> };
    for (const [name, cfg] of Object.entries(globalMcp.mcpServers ?? {})) {
      addServer(name, cfg);
    }
  } catch {
    /* no global mcp.json */
  }

  // 2. Workspace .claude/settings.json (mcpServers key)
  if (wsFolder) {
    try {
      const wsSettings = JSON.parse(
        fs.readFileSync(
          path.join(wsFolder, ".claude", "settings.json"),
          "utf8",
        ),
      ) as { mcpServers?: Record<string, McpServerConfig> };
      for (const [name, cfg] of Object.entries(wsSettings.mcpServers ?? {})) {
        addServer(name, cfg);
      }
    } catch {
      /* no workspace settings.json or no mcpServers key */
    }
  }

  return results;
}

// ── Dynamic built-in loader ──────────────────────────────────────────────────

type BuiltinEntry = Omit<ClaudeCommand, "filePath" | "source" | "category">;
const BUILTINS_CACHE_FILE = path.join(
  os.homedir(),
  ".claude",
  "vscode-ext-builtins-cache.json",
);

/**
 * Returns built-in commands: tries a binary extraction (cached per Claude version),
 * falls back to the hardcoded BUILTIN_COMMANDS list.
 */
function loadBuiltins(): BuiltinEntry[] {
  try {
    const dynamic = extractBuiltinsFromBinary();
    if (dynamic.length > 0) {
      return dynamic;
    }
  } catch {
    /* fall through */
  }
  return BUILTIN_COMMANDS;
}

function extractBuiltinsFromBinary(): BuiltinEntry[] {
  // 1. Locate the claude binary (follow symlinks)
  let claudePath: string;
  try {
    const which = execSync("which claude", {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    claudePath = execSync(
      `readlink -f "${which}" 2>/dev/null || echo "${which}"`,
      {
        encoding: "utf8",
        timeout: 3000,
      },
    ).trim();
  } catch {
    return [];
  }

  // 2. Get version string for cache key
  let version: string;
  try {
    version = execSync("claude --version", { encoding: "utf8", timeout: 3000 })
      .trim()
      .split(" ")[0];
  } catch {
    return [];
  }

  // 3. Return cached result if version matches
  try {
    const cache = JSON.parse(fs.readFileSync(BUILTINS_CACHE_FILE, "utf8"));
    if (
      cache.version === version &&
      Array.isArray(cache.commands) &&
      cache.commands.length > 0
    ) {
      return cache.commands as BuiltinEntry[];
    }
  } catch {
    /* cache miss */
  }

  // 4. Extract from binary: `strings` + local-jsx marker pattern
  let stringsOut: string;
  try {
    stringsOut = execSync(`strings "${claudePath}"`, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    return [];
  }

  const lines = stringsOut.split("\n");
  const commands: BuiltinEntry[] = [];
  const seen = new Set<string>();
  const SKIP = new Set([
    "local",
    "jsx",
    "text",
    "path",
    "stub",
    "console",
    "crypto",
    "local-jsx",
  ]);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "local-jsx") {
      continue;
    }

    // First valid candidate after the marker is the command name
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const candidate = lines[j].trim();
      if (!/^[a-z][a-z0-9_-]{1,30}$/.test(candidate) || SKIP.has(candidate)) {
        continue;
      }
      if (seen.has(candidate)) {
        break;
      }
      seen.add(candidate);

      // Look ahead for a human-readable description
      let description = "";
      for (let k = j + 1; k < Math.min(j + 15, lines.length); k++) {
        const s = lines[k].trim();
        if (
          s.length > 15 &&
          /^[A-Z]/.test(s) &&
          !/^[A-Z_]+$/.test(s) &&
          !s.includes("{") &&
          !s.includes("(") &&
          !s.startsWith("local")
        ) {
          description = s.slice(0, 120);
          break;
        }
      }
      commands.push({ name: candidate, slash: `/${candidate}`, description });
      break;
    }
  }

  if (commands.length === 0) {
    return [];
  }

  // 5. Persist cache
  try {
    fs.writeFileSync(
      BUILTINS_CACHE_FILE,
      JSON.stringify({
        version,
        extractedAt: new Date().toISOString(),
        commands,
      }),
    );
  } catch {
    /* ignore write failures */
  }

  return commands;
}

// ── Frontmatter parser ──────────────────────────────────────────────────────

export function parseFrontmatterDescription(content: string): string {
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

import * as vscode from "vscode";
import { UsageService } from "../usage/UsageService";
import { formatDisplayTime } from "../util/time";

interface UpdatePayload {
  type: "update";
  tokens5h: number;
  tokens7d: number;
  limit5h: number;
  limitWeekly: number;
  lastRefreshed: string | null;
  providers: Array<{ name: string; ok: boolean; detail: string }>;
  modelBreakdown: Array<{ model: string; tokens: number; pct: number }>;
  hourlyLast24h: number[];
  dailyLast7d: number[];
  /** Epoch ms of the window reset, or null if no active window. */
  windowResetAt: number | null;
}

export class UsageWebviewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "usageMonitorView";
  private _view?: vscode.WebviewView;

  constructor(private readonly service: UsageService) {
    service.onDidChange((data) => {
      this.checkQuotaAlert(data);
      this.push();
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = buildHtml();

    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
      if (msg.type === "ready") {
        this.push();
      } else if (msg.type === "refresh") {
        vscode.commands.executeCommand("usage.refresh");
      } else if (msg.type === "setLimits") {
        this.promptSetLimits();
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.push();
      }
    });
  }

  /** Called by `usage.setLimits` command and the ⚙ button in the WebView. */
  async promptSetLimits(): Promise<void> {
    const data = this.service.getCached();
    const tokens5h = data?.bestTokensLast5h ?? 0;
    const tokens7d = data?.bestTokensLast7d ?? 0;

    const pct5hStr = await vscode.window.showInputBox({
      title: "Calibrate — 5h window",
      prompt: `Extension shows ${fmtTok(tokens5h)} tokens for the last 5h. What % does claude.ai show?`,
      placeHolder: "e.g. 89",
      validateInput: (v) => {
        const n = parseFloat(v);
        return !v || (n > 0 && n <= 100) ? null : "Enter a % between 1 and 100";
      },
    });
    if (pct5hStr === undefined) {
      return;
    }

    const pct7dStr = await vscode.window.showInputBox({
      title: "Calibrate — weekly window",
      prompt: `Extension shows ${fmtTok(tokens7d)} tokens for the last 7d. What % does claude.ai show?`,
      placeHolder: "e.g. 53",
      validateInput: (v) => {
        const n = parseFloat(v);
        return !v || (n > 0 && n <= 100) ? null : "Enter a % between 1 and 100";
      },
    });
    if (pct7dStr === undefined) {
      return;
    }

    const pct5h = parseFloat(pct5hStr) / 100;
    const pct7d = parseFloat(pct7dStr) / 100;
    const limit5h = pct5h > 0 ? Math.round(tokens5h / pct5h) : 0;
    const limitWeekly = pct7d > 0 ? Math.round(tokens7d / pct7d) : 0;

    const cfg = vscode.workspace.getConfiguration("claude");
    if (limit5h > 0) {
      await cfg.update(
        "tokenLimit5h",
        limit5h,
        vscode.ConfigurationTarget.Global,
      );
    }
    if (limitWeekly > 0) {
      await cfg.update(
        "tokenLimitWeekly",
        limitWeekly,
        vscode.ConfigurationTarget.Global,
      );
    }

    vscode.window.showInformationMessage(
      `Limits calibrated — 5h: ${fmtTok(limit5h)}, weekly: ${fmtTok(limitWeekly)} tokens`,
    );
    this.push();
  }

  private _lastAlertPct = -1;

  /**
   * Quota alert — runs on every refresh, regardless of panel visibility.
   * Fires at most once per distinct percentage point above the threshold.
   */
  private checkQuotaAlert(
    data: import("../usage/UsageService").AggregatedUsage,
  ): void {
    const usageCfg = vscode.workspace.getConfiguration("usage");
    const alertThreshold: number = usageCfg.get("quotaAlertThreshold", 80);
    if (alertThreshold <= 0) {
      return;
    }
    const limit5h: number = vscode.workspace
      .getConfiguration("claude")
      .get("tokenLimit5h", 0);
    const tokens5h = data.bestTokensLast5h;
    if (limit5h <= 0 || tokens5h <= 0) {
      return;
    }

    const pct = Math.round((tokens5h / limit5h) * 100);
    if (pct >= alertThreshold && pct !== this._lastAlertPct) {
      this._lastAlertPct = pct;
      vscode.window.showWarningMessage(
        `⚠️ Claude usage at ${pct}% of 5h quota (${fmtTok(tokens5h)} / ${fmtTok(limit5h)} tokens)`,
        "Dismiss",
      );
    }
  }

  private push(): void {
    if (!this._view?.visible) {
      return;
    }
    const data = this.service.getCached();
    const cfg = vscode.workspace.getConfiguration("claude");
    const limit5h: number = cfg.get("tokenLimit5h", 0);
    const limitWeekly: number = cfg.get("tokenLimitWeekly", 0);

    const tokens5h = data?.bestTokensLast5h ?? 0;

    // Model breakdown (top 5, with % of 7d total)
    const totalTok =
      data?.modelBreakdown?.reduce((s, b) => s + b.tokens, 0) ?? 0;
    const modelBreakdown = (data?.modelBreakdown ?? [])
      .slice(0, 5)
      .map((b) => ({
        model: b.model,
        tokens: b.tokens,
        pct: totalTok > 0 ? Math.round((b.tokens / totalTok) * 100) : 0,
      }));

    const payload: UpdatePayload = {
      type: "update",
      tokens5h,
      tokens7d: data?.bestTokensLast7d ?? 0,
      limit5h,
      limitWeekly,
      lastRefreshed: data?.lastRefreshed
        ? formatDisplayTime(data.lastRefreshed)
        : null,
      providers:
        data?.providers.map((p) => ({
          name: p.name,
          ok: !p.usage.error,
          detail: p.usage.error
            ? p.usage.error.slice(0, 55)
            : `${fmtTok(p.usage.tokensLast7d)} tok/7d`,
        })) ?? [],
      modelBreakdown,
      hourlyLast24h: data?.hourlyLast24h ?? [],
      dailyLast7d: data?.dailyLast7d ?? [],
      windowResetAt: data?.bestWindowEnd ? data.bestWindowEnd.getTime() : null,
    };

    this._view.webview.postMessage(payload);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTok(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(0)}K`;
  }
  return n.toString();
}

// ── HTML template ─────────────────────────────────────────────────────────────

function buildHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 12px 14px 8px;
    line-height: 1.4;
  }

  /* ── Usage block ─────────────────────────────────── */
  .block { margin-bottom: 14px; }

  .block-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 5px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground);
  }
  .block-header .icon { margin-right: 4px; }

  /* ── Progress bar ────────────────────────────────── */
  .bar-track {
    height: 7px;
    background: var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.2));
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease, background-color 0.3s ease;
    min-width: 0;
  }
  .bar-green  { background: var(--vscode-charts-green,  #4ec9b0); }
  .bar-yellow { background: var(--vscode-charts-yellow, #d7ba7d); }
  .bar-red    { background: var(--vscode-charts-red,    #f48771); }

  .bar-stats {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .bar-pct {
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .bar-detail { color: var(--vscode-descriptionForeground); }

  /* ── No-limit state ──────────────────────────────── */
  .big-tok {
    font-size: 20px;
    font-weight: 700;
    color: var(--vscode-foreground);
    line-height: 1;
    margin-bottom: 2px;
  }
  .big-sub { font-size: 11px; color: var(--vscode-descriptionForeground); }

  /* ── Calibrate notice ────────────────────────────── */
  .calibrate-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0 2px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  /* ── Sparkline ───────────────────────────────────── */
  .sparkline {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 28px;
    margin-bottom: 4px;
  }
  .spark-bar {
    flex: 1;
    min-width: 2px;
    background: var(--vscode-charts-blue, #4fc1ff);
    border-radius: 1px 1px 0 0;
    opacity: 0.7;
    min-height: 1px;
    transition: opacity .1s;
  }
  .spark-bar:hover { opacity: 1; }
  .spark-labels {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.6;
    margin-bottom: 8px;
  }

  /* ── Model breakdown ─────────────────────────────── */
  .model-row {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    padding: 1px 0;
  }
  .model-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model-pct {
    font-weight: 600;
    color: var(--vscode-foreground);
    min-width: 28px;
    text-align: right;
  }
  .model-bar-track {
    width: 40px;
    height: 4px;
    background: rgba(121,121,121,0.2);
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .model-bar-fill {
    height: 100%;
    background: var(--vscode-charts-blue, #4fc1ff);
    border-radius: 2px;
  }

  /* ── Divider ─────────────────────────────────────── */
  .divider {
    height: 1px;
    background: var(--vscode-widget-border, rgba(121,121,121,0.2));
    margin: 10px 0;
  }

  /* ── Providers ───────────────────────────────────── */
  .provider-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding: 2px 0;
    overflow: hidden;
  }
  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-ok  { background: var(--vscode-charts-green, #4ec9b0); }
  .dot-err { background: var(--vscode-charts-red,   #f48771); }
  .provider-name  { flex-shrink: 0; min-width: 80px; }
  .provider-detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.75; }

  /* ── Footer ──────────────────────────────────────── */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--vscode-widget-border, rgba(121,121,121,0.2));
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .btn-row { display: flex; gap: 4px; }
  button {
    padding: 2px 7px;
    font-size: 11px;
    font-family: inherit;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid var(--vscode-button-border, rgba(121,121,121,0.35));
    background: transparent;
    color: var(--vscode-foreground);
  }
  button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(121,121,121,0.1)); }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
<div id="app">

  <!-- 5h block -->
  <div class="block">
    <div class="block-header">
      <span><span class="icon">⏱</span>5-hour window</span>
      <span id="age5h"></span>
    </div>
    <div id="with-limit-5h">
      <div class="bar-track"><div class="bar-fill" id="bar5h"></div></div>
      <div class="bar-stats">
        <span class="bar-pct" id="pct5h"></span>
        <span class="bar-detail" id="detail5h"></span>
      </div>
    </div>
    <div id="no-limit-5h">
      <div class="big-tok" id="big5h"></div>
      <div class="big-sub">tokens used (no limit set)</div>
    </div>
  </div>

  <!-- Weekly block -->
  <div class="block">
    <div class="block-header">
      <span><span class="icon">📅</span>This week</span>
      <span id="age7d"></span>
    </div>
    <div id="with-limit-7d">
      <div class="bar-track"><div class="bar-fill" id="bar7d"></div></div>
      <div class="bar-stats">
        <span class="bar-pct" id="pct7d"></span>
        <span class="bar-detail" id="detail7d"></span>
      </div>
    </div>
    <div id="no-limit-7d">
      <div class="big-tok" id="big7d"></div>
      <div class="big-sub">tokens used (no limit set)</div>
    </div>
  </div>

  <!-- Calibrate notice (shown only when no limits) -->
  <div id="calibrate-notice" class="calibrate-notice">
    <span>Open claude.ai to see your %</span>
    <button class="btn-primary" onclick="setLimits()">⚙ Calibrate</button>
  </div>

  <!-- Sparkline 24h -->
  <div id="sparkline-block" style="display:none">
    <div class="divider"></div>
    <div class="block-header" style="margin-bottom:4px">
      <span><span class="icon">📊</span>Last 24h</span>
    </div>
    <div class="sparkline" id="sparkline"></div>
    <div class="spark-labels"><span>-24h</span><span>-12h</span><span>now</span></div>
  </div>

  <!-- Sparkline 7d -->
  <div id="sparkline7d-block" style="display:none">
    <div class="divider"></div>
    <div class="block-header" style="margin-bottom:4px">
      <span><span class="icon">📅</span>Last 7 days</span>
    </div>
    <div class="sparkline" id="sparkline7d"></div>
    <div class="spark-labels"><span>-7d</span><span>-4d</span><span>today</span></div>
  </div>

  <div class="divider"></div>

  <!-- Providers -->
  <div id="providers"></div>

  <!-- Model breakdown -->
  <div id="model-breakdown-block" style="display:none">
    <div class="divider"></div>
    <div class="block-header" style="margin-bottom:4px">
      <span><span class="icon">🤖</span>By model (7d)</span>
    </div>
    <div id="model-breakdown"></div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span id="updated"></span>
    <div class="btn-row">
      <button onclick="refresh()">↺ Refresh</button>
      <button onclick="setLimits()">⚙ Limits</button>
    </div>
  </div>

</div>
<script>
  const vscode = acquireVsCodeApi();

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return n.toString();
  }

  function barClass(pct) {
    if (pct >= 85) return 'bar-red';
    if (pct >= 60) return 'bar-yellow';
    return 'bar-green';
  }

  function setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
  function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  function renderWindow(key, tokens, limit) {
    if (limit > 0) {
      show('with-limit-' + key);
      hide('no-limit-' + key);
      const pct = Math.min(Math.round(tokens / limit * 100), 100);
      const bar = document.getElementById('bar' + key);
      bar.style.width = pct + '%';
      bar.className = 'bar-fill ' + barClass(pct);
      setEl('pct' + key, pct + '%');
      setEl('detail' + key, fmt(tokens) + ' / ' + fmt(limit));
    } else {
      hide('with-limit-' + key);
      show('no-limit-' + key);
      setEl('big' + key, fmt(tokens));
    }
  }

  window.addEventListener('message', e => {
    const d = e.data;
    if (d.type !== 'update') return;

    renderWindow('5h', d.tokens5h, d.limit5h);
    renderWindow('7d', d.tokens7d, d.limitWeekly);

    // Window reset countdown
    const age5hEl = document.getElementById('age5h');
    if (age5hEl) {
      if (d.windowResetAt) {
        const diffMs = d.windowResetAt - Date.now();
        if (diffMs > 0) {
          const h = Math.floor(diffMs / 3_600_000);
          const m = Math.floor((diffMs % 3_600_000) / 60_000);
          age5hEl.textContent = h > 0 ? 'resets in ' + h + 'h ' + m + 'm' : 'resets in ' + m + 'm';
          age5hEl.title = 'Resets at ' + new Date(d.windowResetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          age5hEl.textContent = 'window reset';
          age5hEl.title = '';
        }
      } else if (d.tokens7d > 0) {
        age5hEl.textContent = 'fresh window';
        age5hEl.title = 'No tokens used yet in current window';
      } else {
        age5hEl.textContent = '—';
        age5hEl.title = 'No usage history found';
      }
    }

    const noLimits = !d.limit5h && !d.limitWeekly;
    noLimits ? show('calibrate-notice') : hide('calibrate-notice');

    setEl('updated', d.lastRefreshed ? 'Updated ' + d.lastRefreshed : 'Not yet loaded');

    const ps = document.getElementById('providers');
    ps.innerHTML = d.providers.map(p =>
      '<div class="provider-row">' +
        '<div class="dot ' + (p.ok ? 'dot-ok' : 'dot-err') + '"></div>' +
        '<span class="provider-name">' + p.name + '</span>' +
        '<span class="provider-detail">' + p.detail + '</span>' +
      '</div>'
    ).join('');

    // Sparkline 24h
    if (d.hourlyLast24h && d.hourlyLast24h.length === 24) {
      const maxVal = Math.max(1, ...d.hourlyLast24h);
      const sparkEl = document.getElementById('sparkline');
      sparkEl.innerHTML = d.hourlyLast24h.map((v, i) => {
        const h = Math.max(1, Math.round((v / maxVal) * 100));
        const label = fmt(v) + ' tok (' + (23 - i) + 'h ago)';
        return '<div class="spark-bar" style="height:' + h + '%" title="' + label + '"></div>';
      }).join('');
      document.getElementById('sparkline-block').style.display = '';
    } else {
      document.getElementById('sparkline-block').style.display = 'none';
    }

    // Sparkline 7d
    if (d.dailyLast7d && d.dailyLast7d.length === 7) {
      const maxVal7d = Math.max(1, ...d.dailyLast7d);
      const spark7dEl = document.getElementById('sparkline7d');
      spark7dEl.innerHTML = d.dailyLast7d.map((v, i) => {
        const h = Math.max(1, Math.round((v / maxVal7d) * 100));
        const daysAgo = 6 - i;
        const label = fmt(v) + ' tok (' + (daysAgo === 0 ? 'today' : daysAgo + 'd ago') + ')';
        return '<div class="spark-bar" style="height:' + h + '%" title="' + label + '"></div>';
      }).join('');
      document.getElementById('sparkline7d-block').style.display = '';
    } else {
      document.getElementById('sparkline7d-block').style.display = 'none';
    }

    // Model breakdown — use DOM APIs to avoid innerHTML injection
    const mbBlock = document.getElementById('model-breakdown-block');
    const mbEl    = document.getElementById('model-breakdown');
    mbEl.textContent = '';
    if (d.modelBreakdown && d.modelBreakdown.length > 0) {
      for (const m of d.modelBreakdown) {
        const shortName = m.model.replace(/^claude-/, '').slice(0, 30);

        const row = document.createElement('div');
        row.className = 'model-row';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'model-name';
        nameSpan.title = m.model;          // safe: setAttribute-equivalent
        nameSpan.textContent = shortName;  // safe: textContent

        const track = document.createElement('div');
        track.className = 'model-bar-track';
        const fill = document.createElement('div');
        fill.className = 'model-bar-fill';
        fill.style.width = Math.min(100, Math.max(0, m.pct)) + '%'; // numeric, clamped
        track.appendChild(fill);

        const pctSpan = document.createElement('span');
        pctSpan.className = 'model-pct';
        pctSpan.textContent = m.pct + '%'; // safe: textContent

        row.appendChild(nameSpan);
        row.appendChild(track);
        row.appendChild(pctSpan);
        mbEl.appendChild(row);
      }
      mbBlock.style.display = '';
    } else {
      mbBlock.style.display = 'none';
    }
  });

  function refresh()   { vscode.postMessage({ type: 'refresh' }); }
  function setLimits() { vscode.postMessage({ type: 'setLimits' }); }

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

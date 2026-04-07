/**
 * Unit tests for P1 features.
 * No VS Code dependency — pure logic tests.
 */
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseFrontmatterDescription } from "../../ui/ClaudeCommandsWebviewProvider";

// ── Helpers ────────────────────────────────────────────────────────────────

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-p1-test-"));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── parseFrontmatterDescription ────────────────────────────────────────────

suite("parseFrontmatterDescription", () => {
  test("extracts description from valid frontmatter", () => {
    const content = `---\ndescription: My cool command\n---\n\nBody here.`;
    assert.strictEqual(parseFrontmatterDescription(content), "My cool command");
  });

  test("strips surrounding quotes from description", () => {
    const content = `---\ndescription: "Quoted description"\n---\n`;
    assert.strictEqual(
      parseFrontmatterDescription(content),
      "Quoted description",
    );
  });

  test("returns empty string when no frontmatter", () => {
    assert.strictEqual(parseFrontmatterDescription("# Just markdown"), "");
  });

  test("returns empty string when description key is missing", () => {
    const content = `---\ntitle: Something\n---\n`;
    assert.strictEqual(parseFrontmatterDescription(content), "");
  });
});

// ── Hourly bucket logic ────────────────────────────────────────────────────

// Mirrors the production formula in ClaudeLocalProvider.processLine (post-fix)
function computeBucketIndex(nowMs: number, ts: number): number | null {
  const start24h = nowMs - 24 * 3_600_000;
  if (ts < start24h || ts > nowMs) {
    return null;
  } // out of window or future
  const ageMs = nowMs - ts;
  const rawIndex = 23 - Math.floor(ageMs / 3_600_000);
  return Math.max(0, Math.min(23, rawIndex));
}

suite("ClaudeLocalProvider — hourly bucket logic", () => {
  test("bucket index 23 = most recent hour", () => {
    const nowMs = Date.now();
    assert.strictEqual(computeBucketIndex(nowMs, nowMs), 23);
  });

  test("bucket index 0 = ~23h ago", () => {
    const nowMs = Date.now();
    const ts = nowMs - 23.5 * 3_600_000;
    assert.strictEqual(computeBucketIndex(nowMs, ts), 0);
  });

  test("bucket index 12 = ~11-12h ago", () => {
    const nowMs = Date.now();
    const ts = nowMs - 11.5 * 3_600_000;
    assert.strictEqual(computeBucketIndex(nowMs, ts), 12);
  });

  test("clamps to 0 for entries older than 24h (returns null = skip)", () => {
    const nowMs = Date.now();
    const ts = nowMs - 30 * 3_600_000; // 30h ago
    assert.strictEqual(computeBucketIndex(nowMs, ts), null);
  });

  test("future timestamp (clock skew) returns null — entry skipped", () => {
    const nowMs = Date.now();
    const ts = nowMs + 5 * 60_000; // 5 minutes in the future
    assert.strictEqual(computeBucketIndex(nowMs, ts), null);
  });

  test("entry exactly at nowMs lands in bucket 23", () => {
    const nowMs = Date.now();
    assert.strictEqual(computeBucketIndex(nowMs, nowMs), 23);
  });

  test("rawIndex never exceeds 23 regardless of input", () => {
    const nowMs = Date.now();
    // Simulate a large negative ageMs via ts > nowMs (should be guarded by null)
    // and verify clamping for ts == nowMs - 0 (edge)
    for (let h = 0; h <= 23; h++) {
      const ts = nowMs - h * 3_600_000 - 1800_000; // middle of each hour
      const idx = computeBucketIndex(nowMs, ts);
      assert.ok(idx !== null && idx >= 0 && idx <= 23, `h=${h} idx=${idx}`);
    }
  });
});

// ── New command template ───────────────────────────────────────────────────

suite("New command creation", () => {
  let tmp: string;

  setup(() => {
    tmp = mkTmp();
  });
  teardown(() => {
    rmDir(tmp);
  });

  test("creates a .md file with valid frontmatter template", () => {
    const name = "test-cmd";
    const commandsDir = path.join(tmp, ".claude", "commands");
    fs.mkdirSync(commandsDir, { recursive: true });

    const template = [
      "---",
      `description: ${name} — describe what this command does`,
      "---",
      "",
      `# ${name}`,
      "",
      "Your command instructions here.",
      "Use $ARGUMENTS to refer to any arguments passed after the slash command.",
      "",
    ].join("\n");

    const filePath = path.join(commandsDir, `${name}.md`);
    writeFile(filePath, template);

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, "utf8");
    assert.ok(content.startsWith("---\n"));
    assert.ok(content.includes(`description: ${name}`));
    assert.strictEqual(
      parseFrontmatterDescription(content),
      `${name} — describe what this command does`,
    );
  });

  test("command name validation regex accepts valid names", () => {
    const validNames = ["my-command", "test123", "a", "my_cmd"];
    for (const name of validNames) {
      assert.ok(
        /^[a-z0-9][a-z0-9_-]*$/.test(name),
        `Expected "${name}" to be valid`,
      );
    }
  });

  test("command name validation regex rejects invalid names", () => {
    const invalidNames = ["My-Command", "-start", "has space", ""];
    for (const name of invalidNames) {
      assert.ok(
        !/^[a-z0-9][a-z0-9_-]*$/.test(name),
        `Expected "${name}" to be invalid`,
      );
    }
  });
});

// ── Queue preview truncation ───────────────────────────────────────────────

suite("Queue item preview", () => {
  test("preview truncates at 200 chars", () => {
    const longText = "a".repeat(300);
    const preview = longText.replace(/\n/g, " ").slice(0, 200);
    const previewTrunc = longText.length > 200 ? preview + "…" : preview;
    assert.strictEqual(previewTrunc.length, 201); // 200 chars + ellipsis
    assert.ok(previewTrunc.endsWith("…"));
  });

  test("preview does not truncate short text", () => {
    const shortText = "Hello world";
    const preview = shortText.replace(/\n/g, " ").slice(0, 200);
    const previewTrunc = shortText.length > 200 ? preview + "…" : preview;
    assert.strictEqual(previewTrunc, "Hello world");
  });

  test("preview normalises newlines to spaces", () => {
    const multiline = "line1\nline2\nline3";
    const preview = multiline.replace(/\n/g, " ").slice(0, 200);
    assert.strictEqual(preview, "line1 line2 line3");
  });
});

// ── Quota alert threshold ──────────────────────────────────────────────────

suite("Quota alert logic", () => {
  function shouldAlert(
    tokens5h: number,
    limit5h: number,
    threshold: number,
    lastPct: number,
  ): { alert: boolean; pct: number } {
    if (threshold <= 0 || limit5h <= 0 || tokens5h <= 0) {
      return { alert: false, pct: -1 };
    }
    const pct = Math.round((tokens5h / limit5h) * 100);
    return { alert: pct >= threshold && pct !== lastPct, pct };
  }

  test("fires alert when above threshold", () => {
    const result = shouldAlert(850, 1000, 80, -1);
    assert.ok(result.alert);
    assert.strictEqual(result.pct, 85);
  });

  test("does not fire when below threshold", () => {
    const result = shouldAlert(700, 1000, 80, -1);
    assert.ok(!result.alert);
  });

  test("does not fire same pct twice", () => {
    const result = shouldAlert(850, 1000, 80, 85);
    assert.ok(!result.alert);
  });

  test("disabled when threshold is 0", () => {
    const result = shouldAlert(950, 1000, 0, -1);
    assert.ok(!result.alert);
  });

  test("disabled when no limit set", () => {
    const result = shouldAlert(950, 0, 80, -1);
    assert.ok(!result.alert);
  });
});

// ── Daily bucket logic (7-day sparkline) ──────────────────────────────────

// Mirrors the production formula in ClaudeLocalProvider.fetchUsage() for dailyBuckets.
function computeDailyBucketIndex(nowMs: number, ts: number): number | null {
  const start7d = nowMs - 7 * 86_400_000;
  if (ts < start7d || ts > nowMs) {
    return null;
  }
  const ageDays = Math.floor((nowMs - ts) / 86_400_000);
  return Math.max(0, Math.min(6, 6 - ageDays));
}

suite("ClaudeLocalProvider — daily bucket logic (7d sparkline)", () => {
  test("entry right now lands in bucket 6 (today)", () => {
    const nowMs = Date.now();
    assert.strictEqual(computeDailyBucketIndex(nowMs, nowMs), 6);
  });

  test("entry 1h ago lands in bucket 6 (today)", () => {
    const nowMs = Date.now();
    assert.strictEqual(computeDailyBucketIndex(nowMs, nowMs - 3_600_000), 6);
  });

  test("entry exactly 1 day ago lands in bucket 5", () => {
    const nowMs = Date.now();
    const ts = nowMs - 86_400_000; // 24h ago
    assert.strictEqual(computeDailyBucketIndex(nowMs, ts), 5);
  });

  test("entry exactly 6 days ago lands in bucket 0 (oldest)", () => {
    const nowMs = Date.now();
    const ts = nowMs - 6 * 86_400_000; // 6d ago
    assert.strictEqual(computeDailyBucketIndex(nowMs, ts), 0);
  });

  test("entry 7+ days ago is out of window (returns null)", () => {
    const nowMs = Date.now();
    const ts = nowMs - 8 * 86_400_000; // 8d ago
    assert.strictEqual(computeDailyBucketIndex(nowMs, ts), null);
  });

  test("future timestamp returns null (clock skew)", () => {
    const nowMs = Date.now();
    const ts = nowMs + 60_000; // 1 min in the future
    assert.strictEqual(computeDailyBucketIndex(nowMs, ts), null);
  });

  test("all 7 mid-day entries map to distinct buckets 0–6", () => {
    const nowMs = new Date("2026-04-07T12:00:00Z").getTime();
    const buckets = new Set<number>();
    for (let d = 0; d <= 6; d++) {
      const ts = nowMs - d * 86_400_000;
      const idx = computeDailyBucketIndex(nowMs, ts);
      assert.ok(idx !== null, `day=${d} should be in window`);
      buckets.add(idx!);
    }
    assert.strictEqual(
      buckets.size,
      7,
      "each day should map to a unique bucket",
    );
  });
});

// ── Sparkline 7d rendering logic ──────────────────────────────────────────

// Mirrors the rendering guard in UsageWebviewProvider buildHtml() JS section.
function shouldShowSparkline7d(daily: number[]): boolean {
  if (daily.length !== 7) {
    return false;
  }
  const sum = daily.reduce((s, v) => s + v, 0);
  return sum > 0;
}

// Mirrors the bar-height formula: 0-value bars render at height 0.
function barHeight7d(v: number, maxVal: number): number {
  return v > 0 ? Math.max(2, Math.round((v / maxVal) * 100)) : 0;
}

suite("Sparkline 7d — rendering logic", () => {
  test("all-zero array → block hidden", () => {
    assert.ok(!shouldShowSparkline7d([0, 0, 0, 0, 0, 0, 0]));
  });

  test("at least one non-zero value → block visible", () => {
    assert.ok(shouldShowSparkline7d([0, 0, 0, 0, 0, 0, 100]));
  });

  test("wrong length (< 7) → block hidden", () => {
    assert.ok(!shouldShowSparkline7d([100, 200, 300]));
  });

  test("zero value renders bar at height 0 (no phantom bar)", () => {
    assert.strictEqual(barHeight7d(0, 1000), 0);
  });

  test("non-zero value renders bar with at least 2% height", () => {
    const h = barHeight7d(1, 10_000_000); // tiny relative value
    assert.ok(h >= 2, `Expected h>=2, got ${h}`);
  });

  test("max value renders bar at 100%", () => {
    assert.strictEqual(barHeight7d(1000, 1000), 100);
  });

  test("value proportional to max", () => {
    const h = barHeight7d(500, 1000);
    assert.strictEqual(h, 50);
  });
});

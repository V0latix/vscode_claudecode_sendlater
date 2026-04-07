/**
 * Unit tests for ClaudeSettingsService.
 * No VS Code dependency — pure Node.js (fs + os).
 */
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  readSettings,
  writeSettings,
  ClaudeSettings,
} from "../../settings/ClaudeSettingsService";

// ── Helpers ────────────────────────────────────────────────────────────────

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-settings-test-"));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function settingsPath(dir: string): string {
  return path.join(dir, "settings.json");
}

function writeRaw(p: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

// ── readSettings ───────────────────────────────────────────────────────────

suite("ClaudeSettingsService — readSettings()", () => {
  let tmp: string;
  setup(() => {
    tmp = mkTmp();
  });
  teardown(() => {
    rmDir(tmp);
  });

  test("missing file → ok with empty settings", () => {
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.deepStrictEqual(result.settings, {});
  });

  test("reads includeCoAuthoredBy = true", () => {
    writeRaw(settingsPath(tmp), { includeCoAuthoredBy: true });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.strictEqual(result.settings.includeCoAuthoredBy, true);
  });

  test("reads includeCoAuthoredBy = false", () => {
    writeRaw(settingsPath(tmp), { includeCoAuthoredBy: false });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.strictEqual(result.settings.includeCoAuthoredBy, false);
  });

  test("reads theme = dark", () => {
    writeRaw(settingsPath(tmp), { theme: "dark" });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.strictEqual(result.settings.theme, "dark");
  });

  test("ignores unknown theme value", () => {
    writeRaw(settingsPath(tmp), { theme: "matrix" });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.strictEqual(result.settings.theme, undefined);
  });

  test("reads permissions.allow and .deny", () => {
    writeRaw(settingsPath(tmp), {
      permissions: { allow: ["Read", "Bash(git *)"], deny: ["Write"] },
    });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.deepStrictEqual(result.settings.permissions?.allow, [
      "Read",
      "Bash(git *)",
    ]);
    assert.deepStrictEqual(result.settings.permissions?.deny, ["Write"]);
  });

  test("permissions missing allow/deny → empty arrays", () => {
    writeRaw(settingsPath(tmp), { permissions: {} });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.deepStrictEqual(result.settings.permissions?.allow, []);
    assert.deepStrictEqual(result.settings.permissions?.deny, []);
  });

  test("unknown top-level keys are silently ignored", () => {
    writeRaw(settingsPath(tmp), {
      enabledPlugins: { "some-plugin": true },
      voiceEnabled: true,
      includeCoAuthoredBy: true,
    });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.strictEqual(result.settings.includeCoAuthoredBy, true);
    // unknown keys are not surfaced
    assert.strictEqual(
      (result.settings as Record<string, unknown>).enabledPlugins,
      undefined,
    );
  });

  test("invalid JSON → error result", () => {
    const p = settingsPath(tmp);
    fs.writeFileSync(p, "{ not: valid json }", "utf8");
    const result = readSettings(p);
    assert.ok(!result.ok);
    assert.ok(result.error.length > 0);
  });

  test("non-array permissions.allow items are filtered", () => {
    writeRaw(settingsPath(tmp), {
      permissions: { allow: ["Read", 42, null, "Write"], deny: [] },
    });
    const result = readSettings(settingsPath(tmp));
    assert.ok(result.ok);
    assert.deepStrictEqual(result.settings.permissions?.allow, [
      "Read",
      "Write",
    ]);
  });
});

// ── writeSettings ──────────────────────────────────────────────────────────

suite("ClaudeSettingsService — writeSettings()", () => {
  let tmp: string;
  setup(() => {
    tmp = mkTmp();
  });
  teardown(() => {
    rmDir(tmp);
  });

  test("creates file if it does not exist", () => {
    const p = settingsPath(tmp);
    const result = writeSettings({ includeCoAuthoredBy: true }, p);
    assert.ok(result.ok);
    assert.ok(fs.existsSync(p));
  });

  test("written file is valid JSON", () => {
    const p = settingsPath(tmp);
    writeSettings({ theme: "dark" }, p);
    const raw = fs.readFileSync(p, "utf8");
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  test("written file is readable by readSettings()", () => {
    const p = settingsPath(tmp);
    const patch: ClaudeSettings = {
      includeCoAuthoredBy: false,
      theme: "light",
      permissions: { allow: ["Read"], deny: ["Bash(rm *)"] },
    };
    writeSettings(patch, p);
    const result = readSettings(p);
    assert.ok(result.ok);
    assert.strictEqual(result.settings.includeCoAuthoredBy, false);
    assert.strictEqual(result.settings.theme, "light");
    assert.deepStrictEqual(result.settings.permissions?.allow, ["Read"]);
    assert.deepStrictEqual(result.settings.permissions?.deny, ["Bash(rm *)"]);
  });

  test("merge: preserves unknown keys in existing file", () => {
    const p = settingsPath(tmp);
    // Pre-existing file with plugin settings (like the real ~/.claude/settings.json)
    writeRaw(p, {
      enabledPlugins: { "my-plugin": true },
      voiceEnabled: true,
    });
    writeSettings({ theme: "dark" }, p);
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.strictEqual(raw.enabledPlugins?.["my-plugin"], true);
    assert.strictEqual(raw.voiceEnabled, true);
    assert.strictEqual(raw.theme, "dark");
  });

  test("merge: overwrites only the patched fields", () => {
    const p = settingsPath(tmp);
    writeRaw(p, { includeCoAuthoredBy: true, theme: "light" });
    writeSettings({ theme: "dark" }, p);
    const result = readSettings(p);
    assert.ok(result.ok);
    assert.strictEqual(result.settings.theme, "dark");
    // includeCoAuthoredBy was not in the patch → preserved
    assert.strictEqual(result.settings.includeCoAuthoredBy, true);
  });

  test("merge: permissions object is merged, not replaced", () => {
    const p = settingsPath(tmp);
    writeRaw(p, {
      permissions: {
        allow: ["Read"],
        deny: [],
        extraKey: "preserved", // unknown sub-key
      },
    });
    writeSettings({ permissions: { allow: ["Read", "Write"], deny: [] } }, p);
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    // extraKey is preserved by the spread
    assert.strictEqual(raw.permissions.extraKey, "preserved");
    assert.deepStrictEqual(raw.permissions.allow, ["Read", "Write"]);
  });

  test("write then read round-trips all three fields", () => {
    const p = settingsPath(tmp);
    const patch: ClaudeSettings = {
      includeCoAuthoredBy: true,
      theme: "system",
      permissions: {
        allow: ["Bash(git log *)", "Read"],
        deny: ["Bash(rm *)", "Write"],
      },
    };
    writeSettings(patch, p);
    const result = readSettings(p);
    assert.ok(result.ok);
    assert.strictEqual(result.settings.includeCoAuthoredBy, true);
    assert.strictEqual(result.settings.theme, "system");
    assert.deepStrictEqual(result.settings.permissions?.allow, [
      "Bash(git log *)",
      "Read",
    ]);
    assert.deepStrictEqual(result.settings.permissions?.deny, [
      "Bash(rm *)",
      "Write",
    ]);
  });

  // ── [high] Parse error → no overwrite ──────────────────────────────────

  test("invalid JSON in existing file → error, file untouched", () => {
    const p = settingsPath(tmp);
    const original = "{ not: valid json }";
    fs.writeFileSync(p, original, "utf8");
    const result = writeSettings({ theme: "dark" }, p);
    assert.ok(!result.ok, "expected write to fail");
    assert.ok(result.error.includes("invalid JSON"));
    // Original file must be intact
    assert.strictEqual(fs.readFileSync(p, "utf8"), original);
  });

  test("valid JSON → writes successfully despite earlier corruption being fixed", () => {
    // After manually fixing the file, writes should work again
    const p = settingsPath(tmp);
    writeRaw(p, { voiceEnabled: true });
    const result = writeSettings({ theme: "light" }, p);
    assert.ok(result.ok);
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.strictEqual(raw.theme, "light");
    assert.strictEqual(raw.voiceEnabled, true); // unknown key preserved
  });

  // ── [high] Atomic write — no orphaned .tmp on success ──────────────────

  test("no .tmp file left behind after successful write", () => {
    const p = settingsPath(tmp);
    writeSettings({ theme: "dark" }, p);
    assert.ok(!fs.existsSync(p + ".tmp"), ".tmp should be cleaned up");
  });

  // ── [medium] Theme null → removes the key ──────────────────────────────

  test("theme: null removes the theme key from the file", () => {
    const p = settingsPath(tmp);
    writeRaw(p, { theme: "dark", voiceEnabled: true });
    const result = writeSettings({ theme: null }, p);
    assert.ok(result.ok);
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.ok(!("theme" in raw), "theme key should be absent");
    assert.strictEqual(raw.voiceEnabled, true); // other keys preserved
  });

  test("set then unset theme round-trips correctly", () => {
    const p = settingsPath(tmp);
    // Set
    writeSettings({ theme: "dark" }, p);
    const afterSet = readSettings(p);
    assert.ok(afterSet.ok);
    assert.strictEqual(afterSet.settings.theme, "dark");
    // Unset (null = remove key)
    writeSettings({ theme: null }, p);
    const afterUnset = readSettings(p);
    assert.ok(afterUnset.ok);
    assert.strictEqual(
      afterUnset.settings.theme,
      undefined,
      "theme should be absent after null patch",
    );
  });

  test("theme: undefined leaves existing theme unchanged", () => {
    const p = settingsPath(tmp);
    writeRaw(p, { theme: "light" });
    // Patch without touching theme
    writeSettings({ includeCoAuthoredBy: true }, p);
    const result = readSettings(p);
    assert.ok(result.ok);
    assert.strictEqual(result.settings.theme, "light");
  });
});

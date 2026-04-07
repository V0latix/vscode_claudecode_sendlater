/**
 * ClaudeSettingsService
 *
 * Reads and writes the Claude Code CLI user-level settings file:
 *   ~/.claude/settings.json
 *
 * Design constraints:
 *   - Merge-safe: only touches the fields this extension knows about.
 *     Unknown keys (e.g. enabledPlugins, voiceEnabled) are preserved verbatim.
 *   - Never throws to the caller: all errors are returned as strings.
 *   - Safe on invalid JSON: writeSettings() refuses to overwrite a file it
 *     cannot parse — caller gets an actionable error, original file untouched.
 *   - Atomic write: content is written to a sibling .tmp file, then renamed
 *     (POSIX rename is atomic when src and dst are on the same filesystem).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface ClaudePermissions {
  allow: string[];
  deny: string[];
}

export interface ClaudeSettings {
  /** Whether to add "Co-authored-by: Claude" footer to git commits. */
  includeCoAuthoredBy?: boolean;
  /** Tool permission rules (allow-list and deny-list). */
  permissions?: ClaudePermissions;
  /**
   * UI theme preference.
   * Use `null` as an explicit "remove the key from settings.json" signal.
   */
  theme?: "light" | "dark" | "system" | null;
}

export type ReadResult =
  | { ok: true; settings: ClaudeSettings; filePath: string }
  | { ok: false; error: string; filePath: string };

export type WriteResult = { ok: true } | { ok: false; error: string };

export const SETTINGS_PATH = path.join(
  os.homedir(),
  ".claude",
  "settings.json",
);

/**
 * Read and parse the Claude settings file.
 * Returns a partial ClaudeSettings with only the fields we know about.
 * Missing file → returns empty settings (not an error).
 */
export function readSettings(filePath = SETTINGS_PATH): ReadResult {
  if (!fs.existsSync(filePath)) {
    return { ok: true, settings: {}, filePath };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `Cannot read ${filePath}: ${err}`,
      filePath,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: `${filePath} contains invalid JSON`,
      filePath,
    };
  }

  const settings: ClaudeSettings = {};

  if (typeof parsed.includeCoAuthoredBy === "boolean") {
    settings.includeCoAuthoredBy = parsed.includeCoAuthoredBy;
  }

  if (
    parsed.theme === "light" ||
    parsed.theme === "dark" ||
    parsed.theme === "system"
  ) {
    settings.theme = parsed.theme;
  }

  const perms = parsed.permissions;
  if (perms && typeof perms === "object" && !Array.isArray(perms)) {
    const p = perms as Record<string, unknown>;
    settings.permissions = {
      allow: Array.isArray(p.allow)
        ? ((p.allow as unknown[]).filter(
            (x) => typeof x === "string",
          ) as string[])
        : [],
      deny: Array.isArray(p.deny)
        ? ((p.deny as unknown[]).filter(
            (x) => typeof x === "string",
          ) as string[])
        : [],
    };
  }

  return { ok: true, settings, filePath };
}

/**
 * Merge the given ClaudeSettings patch into the existing settings file.
 * Unknown keys in the file are preserved.
 * Creates the file (and ~/.claude directory) if they do not exist.
 *
 * Safety guarantees:
 *   - If the existing file contains invalid JSON, returns an error and leaves
 *     the file untouched (no silent data loss).
 *   - Uses an atomic write (temp file → rename) to prevent partial writes.
 */
export function writeSettings(
  patch: ClaudeSettings,
  filePath = SETTINGS_PATH,
): WriteResult {
  // Load existing raw object to preserve unknown fields.
  // If the file exists but cannot be parsed, ABORT — do not overwrite.
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      return {
        ok: false,
        error: `Cannot read ${filePath}: ${err}`,
      };
    }
    try {
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        error:
          `${filePath} contains invalid JSON — refusing to overwrite. ` +
          `Fix the file manually or use "Open raw settings.json".`,
      };
    }
  }

  // Merge only known fields.
  // A value of `null` means "remove this key".
  if (patch.includeCoAuthoredBy !== undefined) {
    existing.includeCoAuthoredBy = patch.includeCoAuthoredBy;
  }
  if (patch.theme !== undefined) {
    if (patch.theme === null) {
      delete existing.theme;
    } else {
      existing.theme = patch.theme;
    }
  }
  if (patch.permissions !== undefined) {
    existing.permissions = {
      ...((existing.permissions as Record<string, unknown>) ?? {}),
      allow: patch.permissions.allow,
      deny: patch.permissions.deny,
    };
  }

  // Ensure directory exists.
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `Cannot create directory ${dir}: ${err}` };
  }

  // Atomic write: write to a sibling .tmp, then rename.
  // POSIX rename() is atomic when src and dst are on the same filesystem.
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2) + "\n", "utf8");
  } catch (err) {
    return { ok: false, error: `Cannot write ${tmpPath}: ${err}` };
  }

  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up orphaned temp file before surfacing the error.
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      error: `Cannot rename ${tmpPath} → ${filePath}: ${err}`,
    };
  }

  return { ok: true };
}

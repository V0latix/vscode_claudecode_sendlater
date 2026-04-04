/**
 * detectWindowStart — pure function for Claude rate-limit window detection.
 *
 * Extracted from ClaudeLocalProvider so it can be unit-tested directly.
 */

export const FIVE_HOURS_MS = 5 * 3_600_000;

export interface WindowEntry {
  ts: number;
}

/**
 * Determine the start timestamp (ms) of the current rate-limit window.
 * Pure function — no side effects.
 *
 * Algorithm:
 *   1. If `hintResetMs` is in the future, use hintResetMs - 5h (injected from
 *      a parsed rate-limit message — more accurate than heuristic).
 *   2. Otherwise scan sortedEntries: a gap ≥ 5h between consecutive entries
 *      marks a window reset; the entry after the last such gap is the anchor.
 *   3. If the detected anchor's window has already expired (anchor + 5h ≤ now),
 *      return null — no active window.
 *
 * @param sortedEntries  Entries sorted ascending by ts.
 * @param nowMs          Current time in epoch ms.
 * @param hintResetMs    Optional: epoch ms of the known window reset time.
 * @returns              Window start in epoch ms, or null if no active window.
 */
export function detectWindowStart(
  sortedEntries: ReadonlyArray<WindowEntry>,
  nowMs: number,
  hintResetMs?: number,
): number | null {
  // Priority 1: injected hint from a rate-limit message
  if (hintResetMs !== undefined && hintResetMs > nowMs) {
    return hintResetMs - FIVE_HOURS_MS;
  }

  // Priority 2: gap detection from JSONL entries
  if (sortedEntries.length === 0) {
    return null;
  }

  let windowStartTs = sortedEntries[0].ts;
  for (let i = 0; i < sortedEntries.length - 1; i++) {
    const gap = sortedEntries[i + 1].ts - sortedEntries[i].ts;
    if (gap >= FIVE_HOURS_MS) {
      windowStartTs = sortedEntries[i + 1].ts;
    }
  }

  if (windowStartTs + FIVE_HOURS_MS <= nowMs) {
    return null;
  }

  return windowStartTs;
}

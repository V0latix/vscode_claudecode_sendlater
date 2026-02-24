/**
 * Time utility helpers — pure functions, no VS Code dependency.
 */

/** Pad a number to 2 digits. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Format a Date as "YYYYMMDD_HHMM" (used for filenames).
 */
export function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `${y}${mo}${d}_${h}${mi}`;
}

/**
 * Format a Date as "YYYY-MM-DD HH:mm" for human-readable display.
 */
export function formatDisplayTime(date: Date): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

/**
 * Format a Date as "YYYY-MM-DD" for API date parameters.
 */
export function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${mo}-${d}`;
}

/**
 * Return the Date that is `hours` hours from now.
 */
export function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}

/**
 * Return the start of the 5-hour sliding window (now - 5h).
 */
export function getWindowStart5h(now = new Date()): Date {
  return new Date(now.getTime() - 5 * 3_600_000);
}

/**
 * Return the start of the 7-day sliding window (now - 7d).
 */
export function getWindowStart7d(now = new Date()): Date {
  return new Date(now.getTime() - 7 * 24 * 3_600_000);
}

/**
 * Returns true if `notBefore` is in the past (or exactly now).
 */
export function isOverdue(notBefore: Date, now = new Date()): boolean {
  return notBefore.getTime() <= now.getTime();
}

/**
 * Returns a list of unique "YYYY-MM-DD" strings covering the range [from, to].
 * Used to build the list of dates to query from the usage APIs.
 */
export function datesInRange(from: Date, to: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    dates.push(formatDateParam(new Date(cursor)));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// ── Rate-limit message parser ────────────────────────────────────────────────

export interface RateLimitInfo {
  /** Delay in hours (with a small buffer already added). */
  delayHours: number;
  /** Computed absolute reset time, if we could determine it. */
  resetAt: Date | undefined;
  /** Portion of the input that matched. */
  rawMatch: string;
  /** How confident we are in the parse. */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Try to extract a rate-limit reset delay from a raw error string.
 *
 * Handles patterns from:
 *   - Claude Code:  "Your limit will reset at 2:30 PM"
 *                   "Usage limit reached. Resets in 4h 30m."
 *   - GitHub Copilot / OpenAI:
 *                   "Rate limit exceeded. Retry after 45 minutes."
 *                   "Too many requests. Try again in 2 hours 15 minutes."
 *   - Generic:      "available again in 1h 20m"
 *                   "try again after 30 seconds"
 *
 * Returns undefined if no pattern matches.
 */
export function parseRateLimitMessage(text: string): RateLimitInfo | undefined {
  // ── 1. Absolute time: "resets at HH:MM [AM/PM]" ────────────────────────
  const absReset = text.match(
    /(?:reset(?:s)?|available|try\s+again|retry)\s+at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i
  );
  if (absReset) {
    const info = parseAbsoluteTime(absReset[1], absReset[2], absReset[4], text);
    if (info) { return info; }
  }

  // ── 2. "at HH:MM [AM/PM]" (standalone) ─────────────────────────────────
  const atTime = text.match(/\bat\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (atTime) {
    const info = parseAbsoluteTime(atTime[1], atTime[2], atTime[4], text);
    if (info) { return { ...info, confidence: 'medium' }; }
  }

  // ── 3. Combined relative: "Xh Ym" or "X hours Y minutes" ────────────────
  const combined = text.match(
    /(\d+)\s*h(?:ours?)?\s+(\d+)\s*m(?:in(?:utes?)?)?/i
  );
  if (combined) {
    const h = parseInt(combined[1], 10);
    const m = parseInt(combined[2], 10);
    const total = h + m / 60;
    const delayHours = addBuffer(total);
    const resetAt = new Date(Date.now() + delayHours * 3_600_000);
    return { delayHours, resetAt, rawMatch: combined[0], confidence: 'high' };
  }

  // ── 4. Hours only ───────────────────────────────────────────────────────
  const hoursOnly = text.match(
    /(?:in|after|for)\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?/i
  );
  if (hoursOnly) {
    const total = parseFloat(hoursOnly[1]);
    const delayHours = addBuffer(total);
    const resetAt = new Date(Date.now() + delayHours * 3_600_000);
    return { delayHours, resetAt, rawMatch: hoursOnly[0], confidence: 'high' };
  }

  // Bare "X hours" without prep word (e.g. "rate limited for 5 hours")
  const bareHours = text.match(/(\d+(?:\.\d+)?)\s*hours?/i);
  if (bareHours) {
    const total = parseFloat(bareHours[1]);
    const delayHours = addBuffer(total);
    const resetAt = new Date(Date.now() + delayHours * 3_600_000);
    return { delayHours, resetAt, rawMatch: bareHours[0], confidence: 'medium' };
  }

  // ── 5. Minutes only ─────────────────────────────────────────────────────
  const minutesOnly = text.match(
    /(?:in|after|for)\s+(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?/i
  );
  if (minutesOnly) {
    const total = parseFloat(minutesOnly[1]) / 60;
    const delayHours = addBuffer(total);
    const resetAt = new Date(Date.now() + delayHours * 3_600_000);
    return { delayHours, resetAt, rawMatch: minutesOnly[0], confidence: 'high' };
  }

  // ── 6. Seconds only (short limits) ──────────────────────────────────────
  const secondsOnly = text.match(
    /(?:in|after|for)\s+(\d+)\s*s(?:ec(?:onds?)?)?/i
  );
  if (secondsOnly) {
    const total = parseInt(secondsOnly[1], 10) / 3600;
    const delayHours = addBuffer(total);
    const resetAt = new Date(Date.now() + delayHours * 3_600_000);
    return { delayHours, resetAt, rawMatch: secondsOnly[0], confidence: 'medium' };
  }

  return undefined;
}

function parseAbsoluteTime(
  hourStr: string,
  minuteStr: string,
  ampm: string | undefined,
  rawText: string,
): RateLimitInfo | undefined {
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (isNaN(hour) || isNaN(minute)) { return undefined; }

  if (ampm) {
    if (ampm.toLowerCase() === 'pm' && hour !== 12) { hour += 12; }
    if (ampm.toLowerCase() === 'am' && hour === 12) { hour = 0; }
  }

  const now = new Date();
  const resetAt = new Date(now);
  resetAt.setHours(hour, minute, 0, 0);

  // If the time is in the past (today), assume it's tomorrow
  if (resetAt.getTime() <= now.getTime()) {
    resetAt.setDate(resetAt.getDate() + 1);
  }

  const rawHours = (resetAt.getTime() - now.getTime()) / 3_600_000;
  const delayHours = addBuffer(rawHours);

  return {
    delayHours,
    resetAt,
    rawMatch: rawText.slice(0, 80),
    confidence: 'high',
  };
}

/** Add a 5-minute safety buffer and round to 1 decimal. */
function addBuffer(hours: number): number {
  return Math.round((hours + 5 / 60) * 10) / 10;
}

/**
 * Legacy shim — returns just the hours number.
 * Kept for backward compat with existing queue commands.
 */
export function parseRateLimitDelay(text: string): number | undefined {
  return parseRateLimitMessage(text)?.delayHours;
}

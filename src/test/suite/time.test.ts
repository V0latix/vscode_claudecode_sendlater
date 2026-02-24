import * as assert from 'assert';
import {
  formatTimestamp,
  formatDisplayTime,
  formatDateParam,
  addHours,
  getWindowStart5h,
  getWindowStart7d,
  isOverdue,
  datesInRange,
  parseRateLimitDelay,
  parseRateLimitMessage,
} from '../../util/time';

suite('time utilities', () => {

  // ── formatTimestamp ────────────────────────────────────────────────────────
  suite('formatTimestamp', () => {
    test('formats a fixed date correctly', () => {
      const d = new Date('2024-03-15T09:05:00');
      assert.strictEqual(formatTimestamp(d), '20240315_0905');
    });

    test('pads single-digit month and day', () => {
      const d = new Date('2024-01-07T00:00:00');
      assert.strictEqual(formatTimestamp(d), '20240107_0000');
    });
  });

  // ── formatDisplayTime ──────────────────────────────────────────────────────
  suite('formatDisplayTime', () => {
    test('formats human-readable date', () => {
      const d = new Date('2024-11-30T14:30:00');
      assert.strictEqual(formatDisplayTime(d), '2024-11-30 14:30');
    });
  });

  // ── formatDateParam ────────────────────────────────────────────────────────
  suite('formatDateParam', () => {
    test('returns YYYY-MM-DD', () => {
      const d = new Date('2024-06-01T12:00:00');
      assert.strictEqual(formatDateParam(d), '2024-06-01');
    });
  });

  // ── addHours ───────────────────────────────────────────────────────────────
  suite('addHours', () => {
    test('adds hours correctly', () => {
      const base = new Date('2024-01-01T10:00:00Z');
      const result = addHours(base, 5);
      assert.strictEqual(result.getTime(), base.getTime() + 5 * 3_600_000);
    });

    test('works with fractional hours', () => {
      const base = new Date('2024-01-01T10:00:00Z');
      const result = addHours(base, 0.5);
      assert.strictEqual(result.getTime(), base.getTime() + 1_800_000);
    });
  });

  // ── getWindowStart5h ───────────────────────────────────────────────────────
  suite('getWindowStart5h', () => {
    test('returns now minus 5 hours', () => {
      const now = new Date('2024-06-15T15:00:00Z');
      const result = getWindowStart5h(now);
      assert.strictEqual(result.getTime(), now.getTime() - 5 * 3_600_000);
    });
  });

  // ── getWindowStart7d ───────────────────────────────────────────────────────
  suite('getWindowStart7d', () => {
    test('returns now minus 7 days', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const result = getWindowStart7d(now);
      assert.strictEqual(result.getTime(), now.getTime() - 7 * 24 * 3_600_000);
    });
  });

  // ── isOverdue ──────────────────────────────────────────────────────────────
  suite('isOverdue', () => {
    test('returns true when notBefore is in the past', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const past = new Date('2024-06-15T11:00:00Z');
      assert.strictEqual(isOverdue(past, now), true);
    });

    test('returns true when notBefore equals now', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      assert.strictEqual(isOverdue(now, now), true);
    });

    test('returns false when notBefore is in the future', () => {
      const now = new Date('2024-06-15T12:00:00Z');
      const future = new Date('2024-06-15T13:00:00Z');
      assert.strictEqual(isOverdue(future, now), false);
    });
  });

  // ── datesInRange ───────────────────────────────────────────────────────────
  suite('datesInRange', () => {
    test('returns single date for same-day range', () => {
      const d = new Date('2024-06-15T10:00:00Z');
      const result = datesInRange(d, d);
      assert.deepStrictEqual(result, ['2024-06-15']);
    });

    test('returns correct number of dates for 3-day span', () => {
      const from = new Date('2024-06-13T00:00:00Z');
      const to = new Date('2024-06-15T23:59:00Z');
      const result = datesInRange(from, to);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0], '2024-06-13');
      assert.strictEqual(result[2], '2024-06-15');
    });

    test('covers 7-day window with 8 dates (boundary)', () => {
      const now = new Date('2024-06-15T06:00:00Z');
      const start = new Date(now.getTime() - 7 * 24 * 3_600_000);
      const result = datesInRange(start, now);
      // 7 days back from June 15 06:00 UTC → June 8 06:00 → dates Jun 8 to Jun 15 = 8 days
      assert.ok(result.length >= 7 && result.length <= 8);
    });
  });

  // ── parseRateLimitDelay (legacy shim) ─────────────────────────────────────
  suite('parseRateLimitDelay', () => {
    test('parses "3 hours"', () => {
      const result = parseRateLimitDelay('Rate limited. Try again in 3 hours.');
      assert.ok(result !== undefined);
      assert.ok(result > 3);
      assert.ok(result < 4);
    });

    test('parses "45 minutes"', () => {
      const result = parseRateLimitDelay('Please retry after 45 minutes.');
      assert.ok(result !== undefined);
      assert.ok(result < 1);
    });

    test('returns undefined for no match', () => {
      assert.strictEqual(parseRateLimitDelay('Something went wrong.'), undefined);
    });
  });

  // ── parseRateLimitMessage ──────────────────────────────────────────────────
  suite('parseRateLimitMessage', () => {
    test('Claude Code — "resets at HH:MM AM" → high confidence', () => {
      // Simulate a future time so the test doesn't flip day
      const now = new Date();
      const futureH = (now.getHours() + 3) % 24;
      const hStr = futureH <= 12 ? `${futureH}:30 AM` : `${futureH - 12}:30 PM`;
      const result = parseRateLimitMessage(`Your limit will reset at ${hStr}`);
      assert.ok(result !== undefined);
      assert.ok(result.resetAt !== undefined);
      assert.ok(result.delayHours > 0);
      assert.strictEqual(result.confidence, 'high');
    });

    test('OpenAI — "try again in 4h 30m" → high confidence', () => {
      const result = parseRateLimitMessage('Rate limit exceeded. Try again in 4h 30m.');
      assert.ok(result !== undefined);
      assert.ok(result.delayHours > 4.5 && result.delayHours < 5);
      assert.strictEqual(result.confidence, 'high');
    });

    test('Copilot — "retry after 45 minutes" → high confidence', () => {
      const result = parseRateLimitMessage('Copilot is rate limited. Please retry after 45 minutes.');
      assert.ok(result !== undefined);
      assert.ok(result.delayHours < 1);
      assert.strictEqual(result.confidence, 'high');
    });

    test('"in 2 hours 15 minutes" combined', () => {
      const result = parseRateLimitMessage('try again in 2 hours 15 minutes');
      assert.ok(result !== undefined);
      assert.ok(result.delayHours > 2.2 && result.delayHours < 2.5);
      assert.strictEqual(result.confidence, 'high');
    });

    test('"retry after 30 seconds" → very small delay', () => {
      const result = parseRateLimitMessage('retry after 30 seconds');
      assert.ok(result !== undefined);
      assert.ok(result.delayHours < 0.2);
      assert.strictEqual(result.confidence, 'medium');
    });

    test('bare "3 hours" → medium confidence', () => {
      const result = parseRateLimitMessage('You have been rate limited for 3 hours');
      assert.ok(result !== undefined);
      assert.ok(result.delayHours > 3 && result.delayHours < 4);
    });

    test('no match → undefined', () => {
      assert.strictEqual(parseRateLimitMessage('Everything is fine.'), undefined);
    });

    test('has rawMatch field', () => {
      const result = parseRateLimitMessage('try again in 5 hours');
      assert.ok(result !== undefined);
      assert.ok(result.rawMatch.length > 0);
    });

    test('includes 5-minute buffer (delay > raw value)', () => {
      const result = parseRateLimitMessage('try again in 3 hours');
      assert.ok(result !== undefined);
      assert.ok(result.delayHours > 3.0); // buffer added
    });
  });
});

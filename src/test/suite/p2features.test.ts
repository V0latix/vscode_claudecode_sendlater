/**
 * Unit tests for P2 features.
 * No VS Code dependency — pure logic tests.
 */
import * as assert from "assert";
import {
  QueueStore,
  QueueItem,
  DeliveryLogEntry,
} from "../../queue/QueueStore";
import { detectWindowStart, FIVE_HOURS_MS } from "../../util/windowDetection";

// ── Mock vscode.Memento ────────────────────────────────────────────────────
class MockMemento {
  private data = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return (this.data.has(key) ? this.data.get(key) : defaultValue) as T;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  keys(): readonly string[] {
    return Array.from(this.data.keys());
  }
  setKeysForSync(_keys: readonly string[]): void {
    /* no-op */
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(): QueueStore {
  return new QueueStore(
    new MockMemento() as unknown as import("vscode").Memento,
  );
}

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const now = new Date();
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    notBefore: new Date(now.getTime() + 3_600_000).toISOString(),
    promptText: "Hello, AI!",
    workspaceFolder: "/tmp/ws",
    processed: false,
    ...overrides,
  };
}

function makeLogEntry(
  overrides: Partial<DeliveryLogEntry> = {},
): DeliveryLogEntry {
  return {
    itemId: "item-1",
    timestamp: new Date().toISOString(),
    status: "delivered",
    promptPreview: "Hello, AI!",
    ...overrides,
  };
}

// ── Config ID validation ───────────────────────────────────────────────────

suite("Config ID format validation", () => {
  const orgIdPattern = /^(org-[a-zA-Z0-9_-]+)?$/;
  const projectIdPattern = /^(proj-[a-zA-Z0-9_-]+)?$/;

  test("openai.orgId: empty string is valid", () => {
    assert.ok(orgIdPattern.test(""));
  });

  test("openai.orgId: 'org-abc123' is valid", () => {
    assert.ok(orgIdPattern.test("org-abc123"));
  });

  test("openai.orgId: 'org-My_Org-2' is valid", () => {
    assert.ok(orgIdPattern.test("org-My_Org-2"));
  });

  test("openai.orgId: 'invalid' (no prefix) is rejected", () => {
    assert.ok(!orgIdPattern.test("invalid"));
  });

  test("openai.orgId: 'sk-org-abc' (wrong prefix) is rejected", () => {
    assert.ok(!orgIdPattern.test("sk-org-abc"));
  });

  test("openai.projectId: empty string is valid", () => {
    assert.ok(projectIdPattern.test(""));
  });

  test("openai.projectId: 'proj-abc123' is valid", () => {
    assert.ok(projectIdPattern.test("proj-abc123"));
  });

  test("openai.projectId: 'project-abc' (wrong prefix) is rejected", () => {
    assert.ok(!projectIdPattern.test("project-abc"));
  });

  test("openai.projectId: 'proj-' (prefix only, no suffix) is rejected", () => {
    assert.ok(!projectIdPattern.test("proj-"));
  });
});

// ── Delivery log ───────────────────────────────────────────────────────────

suite("QueueStore — delivery log", () => {
  let store: QueueStore;

  setup(() => {
    store = makeStore();
  });

  test("starts empty", () => {
    assert.deepStrictEqual(store.getDeliveryLog(), []);
  });

  test("addDeliveryLogEntry() prepends entry (newest first)", async () => {
    const e1 = makeLogEntry({ itemId: "a", promptPreview: "first" });
    const e2 = makeLogEntry({ itemId: "b", promptPreview: "second" });
    await store.addDeliveryLogEntry(e1);
    await store.addDeliveryLogEntry(e2);
    const log = store.getDeliveryLog();
    assert.strictEqual(log[0].itemId, "b"); // newest first
    assert.strictEqual(log[1].itemId, "a");
  });

  test("addDeliveryLogEntry() stores status and error", async () => {
    const entry: DeliveryLogEntry = {
      itemId: "x",
      timestamp: "2026-04-04T10:00:00.000Z",
      status: "failed",
      error: "Terminal not found",
      promptPreview: "my prompt",
    };
    await store.addDeliveryLogEntry(entry);
    const log = store.getDeliveryLog();
    assert.strictEqual(log[0].status, "failed");
    assert.strictEqual(log[0].error, "Terminal not found");
    assert.strictEqual(log[0].promptPreview, "my prompt");
  });

  test("caps at 20 entries", async () => {
    for (let i = 0; i < 25; i++) {
      await store.addDeliveryLogEntry(makeLogEntry({ itemId: `item-${i}` }));
    }
    const log = store.getDeliveryLog();
    assert.strictEqual(log.length, 20);
    // Newest entry is item-24 (last added, prepended = index 0)
    assert.strictEqual(log[0].itemId, "item-24");
    // Oldest kept is item-5 (25 added, capped at 20 → items 5–24)
    assert.strictEqual(log[19].itemId, "item-5");
  });

  test("clearDeliveryLog() empties the log", async () => {
    await store.addDeliveryLogEntry(makeLogEntry());
    await store.clearDeliveryLog();
    assert.deepStrictEqual(store.getDeliveryLog(), []);
  });

  test("delivered and failed entries coexist", async () => {
    await store.addDeliveryLogEntry(makeLogEntry({ status: "delivered" }));
    await store.addDeliveryLogEntry(
      makeLogEntry({ status: "failed", error: "oops" }),
    );
    const log = store.getDeliveryLog();
    assert.strictEqual(log[0].status, "failed");
    assert.strictEqual(log[1].status, "delivered");
  });
});

// ── QueueItem.deliveryAttempts ────────────────────────────────────────────

suite("QueueStore.update() — deliveryAttempts", () => {
  let store: QueueStore;

  setup(() => {
    store = makeStore();
  });

  test("deliveryAttempts defaults to undefined", async () => {
    const item = makeItem({ id: "r1" });
    await store.add(item);
    const found = store.getAll().find((i) => i.id === "r1")!;
    assert.strictEqual(found.deliveryAttempts, undefined);
  });

  test("update() can set deliveryAttempts", async () => {
    const item = makeItem({ id: "r2" });
    await store.add(item);
    await store.update("r2", { deliveryAttempts: 1 });
    const found = store.getAll().find((i) => i.id === "r2")!;
    assert.strictEqual(found.deliveryAttempts, 1);
  });

  test("update() can increment deliveryAttempts", async () => {
    const item = makeItem({ id: "r3" });
    await store.add(item);
    await store.update("r3", { deliveryAttempts: 1 });
    await store.update("r3", { deliveryAttempts: 2 });
    const found = store.getAll().find((i) => i.id === "r3")!;
    assert.strictEqual(found.deliveryAttempts, 2);
  });

  test("update() deliveryAttempts does not affect sibling items", async () => {
    const a = makeItem({ id: "r4" });
    const b = makeItem({ id: "r5" });
    await store.add(a);
    await store.add(b);
    await store.update("r4", { deliveryAttempts: 2 });
    const sibling = store.getAll().find((i) => i.id === "r5")!;
    assert.strictEqual(sibling.deliveryAttempts, undefined);
  });
});

// ── Retry backoff calculation ──────────────────────────────────────────────

suite("Retry exponential backoff calculation", () => {
  /**
   * Mirrors the formula in QueueProcessor.process():
   *   delayMs = 60_000 * Math.pow(2, attempt - 1)
   */
  function retryDelayMs(attempt: number): number {
    return 60_000 * Math.pow(2, attempt - 1);
  }

  test("attempt 1 → 60 seconds", () => {
    assert.strictEqual(retryDelayMs(1), 60_000);
  });

  test("attempt 2 → 120 seconds", () => {
    assert.strictEqual(retryDelayMs(2), 120_000);
  });

  test("attempt 3 → 240 seconds", () => {
    assert.strictEqual(retryDelayMs(3), 240_000);
  });

  test("delays are strictly increasing", () => {
    for (let i = 1; i < 5; i++) {
      assert.ok(retryDelayMs(i + 1) > retryDelayMs(i));
    }
  });

  test("maxRetries=3: attempt 2 is below max, attempt 3 is not", () => {
    const maxRetries = 3;
    assert.ok(2 < maxRetries, "attempt 2 should still retry");
    assert.ok(!(3 < maxRetries), "attempt 3 is the last — no more retry");
  });
});

// ── Window detection algorithm ────────────────────────────────────────────
//
// Tests the real detectWindowStart() exported from util/windowDetection.ts.

suite("detectWindowStart — window detection", () => {
  function e(ts: number): { ts: number } {
    return { ts };
  }

  test("no entries → null", () => {
    assert.strictEqual(detectWindowStart([], Date.now()), null);
  });

  test("single recent entry → window starts at that entry", () => {
    const now = 14 * 3_600_000 * 1000;
    const entry = e(now - 1 * 3_600_000); // 1h ago
    assert.strictEqual(detectWindowStart([entry], now), entry.ts);
  });

  test("entries without gap → window starts at oldest entry", () => {
    const now = new Date("2026-04-04T14:00:00Z").getTime();
    const entries = [
      e(new Date("2026-04-04T10:00:00Z").getTime()),
      e(new Date("2026-04-04T11:00:00Z").getTime()),
      e(new Date("2026-04-04T12:00:00Z").getTime()),
    ];
    assert.strictEqual(detectWindowStart(entries, now), entries[0].ts);
  });

  test("gap ≥ 5h → window resets at the entry after the gap", () => {
    const now = new Date("2026-04-04T14:00:00Z").getTime();
    const entries = [
      e(new Date("2026-04-04T06:00:00Z").getTime()),
      e(new Date("2026-04-04T07:00:00Z").getTime()),
      e(new Date("2026-04-04T13:00:00Z").getTime()), // gap = 6h → new window
      e(new Date("2026-04-04T13:30:00Z").getTime()),
    ];
    assert.strictEqual(
      detectWindowStart(entries, now),
      new Date("2026-04-04T13:00:00Z").getTime(),
    );
  });

  test("exactly 5h gap → boundary treated as expired → null", () => {
    const now = new Date("2026-04-04T18:00:00Z").getTime();
    const t1 = new Date("2026-04-04T08:00:00Z").getTime();
    const t2 = new Date("2026-04-04T13:00:00Z").getTime(); // gap = 5h exactly
    // t2 + 5h = 18:00 ≤ now(18:00) → expired
    assert.strictEqual(detectWindowStart([e(t1), e(t2)], now), null);
  });

  test("window expired (anchor + 5h ≤ now) → null", () => {
    const now = new Date("2026-04-04T20:00:00Z").getTime();
    const entries = [e(new Date("2026-04-04T10:00:00Z").getTime())];
    assert.strictEqual(detectWindowStart(entries, now), null);
  });

  test("multiple resets: most recent window start is returned", () => {
    const now = new Date("2026-04-04T22:00:00Z").getTime();
    const entries = [
      e(new Date("2026-04-04T06:00:00Z").getTime()),
      e(new Date("2026-04-04T12:00:00Z").getTime()), // gap 6h
      e(new Date("2026-04-04T19:00:00Z").getTime()), // gap 7h → window 3
      e(new Date("2026-04-04T21:00:00Z").getTime()),
    ];
    assert.strictEqual(
      detectWindowStart(entries, now),
      new Date("2026-04-04T19:00:00Z").getTime(),
    );
  });

  test("hint in future overrides gap detection", () => {
    const now = new Date("2026-04-04T14:00:00Z").getTime();
    const hintResetAt = new Date("2026-04-04T17:30:00Z").getTime();
    // entries alone would give window start = 10:00
    const entries = [e(new Date("2026-04-04T10:00:00Z").getTime())];
    assert.strictEqual(
      detectWindowStart(entries, now, hintResetAt),
      hintResetAt - FIVE_HOURS_MS, // 12:30
    );
  });

  test("expired hint is ignored, falls through to gap detection", () => {
    const now = new Date("2026-04-04T20:00:00Z").getTime();
    const expiredHint = new Date("2026-04-04T15:00:00Z").getTime(); // < now
    const entries = [e(new Date("2026-04-04T18:00:00Z").getTime())]; // window active
    // hint is expired → gap detection applies; entry at 18:00 + 5h = 23:00 > now → active
    assert.strictEqual(
      detectWindowStart(entries, now, expiredHint),
      new Date("2026-04-04T18:00:00Z").getTime(),
    );
  });
});

// ── Invalid key detection ─────────────────────────────────────────────────

suite("Invalid API key detection (error string parsing)", () => {
  /**
   * Mirrors the logic in OpenAIUsageProvider and AnthropicUsageProvider:
   *   isInvalidKey = errStr.includes('401') || errStr.includes('403')
   */
  function detectInvalidKey(errStr: string): boolean {
    return errStr.includes("401") || errStr.includes("403");
  }

  test("HTTP 401 error is detected as invalid key", () => {
    assert.ok(detectInvalidKey("HTTP 401: Invalid or insufficient API key."));
  });

  test("HTTP 403 error is detected as invalid key", () => {
    assert.ok(
      detectInvalidKey(
        "HTTP 403: Forbidden. Ensure you are using an admin API key.",
      ),
    );
  });

  test("HTTP 404 error is NOT an invalid key", () => {
    assert.ok(!detectInvalidKey("HTTP 404: Usage endpoint not found."));
  });

  test("HTTP 429 (rate limit) is NOT an invalid key", () => {
    assert.ok(!detectInvalidKey("HTTP 429: Rate limit exceeded."));
  });

  test("network timeout is NOT an invalid key", () => {
    assert.ok(!detectInvalidKey("Request timeout"));
  });

  test("generic API error is NOT an invalid key", () => {
    assert.ok(!detectInvalidKey("API error: something went wrong"));
  });
});

/**
 * Unit tests for QueueStore logic (no VS Code dependency — uses a mock Memento).
 * Tests for due-item detection use the isOverdue helper from time.ts.
 */
import * as assert from "assert";
import { QueueStore, QueueItem } from "../../queue/QueueStore";
import { isOverdue, addMinutes } from "../../util/time";

// ── Mock vscode.Memento ────────────────────────────────────────────────────
class MockMemento {
  private data = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return (this.data.has(key) ? this.data.get(key) : defaultValue) as T;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  // Not used by QueueStore but required by the Memento interface
  keys(): readonly string[] {
    return Array.from(this.data.keys());
  }
  setKeysForSync(_keys: readonly string[]): void {
    /* no-op */
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const now = new Date();
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    notBefore: new Date(now.getTime() + 3_600_000).toISOString(), // +1h default
    promptText: "Hello, AI!",
    workspaceFolder: "/tmp/ws",
    processed: false,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

suite("QueueStore", () => {
  let store: QueueStore;

  setup(() => {
    store = new QueueStore(
      new MockMemento() as unknown as import("vscode").Memento,
    );
  });

  test("starts empty", () => {
    assert.deepStrictEqual(store.getAll(), []);
    assert.deepStrictEqual(store.getPending(), []);
  });

  test("add() persists an item", async () => {
    const item = makeItem();
    await store.add(item);
    const all = store.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, item.id);
  });

  test("getPending() excludes processed items", async () => {
    const item1 = makeItem({ id: "a" });
    const item2 = makeItem({ id: "b" });
    await store.add(item1);
    await store.add(item2);
    await store.markProcessed("a");
    const pending = store.getPending();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].id, "b");
  });

  test("markProcessed() sets processed=true", async () => {
    const item = makeItem();
    await store.add(item);
    await store.markProcessed(item.id);
    const found = store.getAll().find((i) => i.id === item.id);
    assert.ok(found);
    assert.strictEqual(found.processed, true);
  });

  test("remove() deletes item entirely", async () => {
    const item = makeItem();
    await store.add(item);
    await store.remove(item.id);
    assert.strictEqual(store.getAll().length, 0);
  });

  test("purgeProcessed() keeps only pending items", async () => {
    const a = makeItem({ id: "a" });
    const b = makeItem({ id: "b" });
    await store.add(a);
    await store.add(b);
    await store.markProcessed("a");
    await store.purgeProcessed();
    const all = store.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, "b");
  });

  test("clear() removes all items", async () => {
    await store.add(makeItem());
    await store.add(makeItem());
    await store.clear();
    assert.strictEqual(store.getAll().length, 0);
  });

  test("multiple adds are preserved", async () => {
    for (let i = 0; i < 5; i++) {
      await store.add(makeItem({ id: `item-${i}` }));
    }
    assert.strictEqual(store.getAll().length, 5);
  });
});

suite("due-item detection (isOverdue + QueueStore)", () => {
  let store: QueueStore;

  setup(() => {
    store = new QueueStore(
      new MockMemento() as unknown as import("vscode").Memento,
    );
  });

  test("item with past notBefore is due", async () => {
    const past = new Date(Date.now() - 3_600_000); // 1h ago
    await store.add(makeItem({ notBefore: past.toISOString() }));
    const pending = store.getPending();
    const due = pending.filter((i) => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 1);
  });

  test("item with future notBefore is NOT due", async () => {
    const future = new Date(Date.now() + 3_600_000); // 1h from now
    await store.add(makeItem({ notBefore: future.toISOString() }));
    const pending = store.getPending();
    const due = pending.filter((i) => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 0);
  });

  test("mixed items: only past ones are due", async () => {
    const past = new Date(Date.now() - 60_000); // 1 min ago
    const future = new Date(Date.now() + 60_000); // 1 min from now
    await store.add(makeItem({ id: "past", notBefore: past.toISOString() }));
    await store.add(
      makeItem({ id: "future", notBefore: future.toISOString() }),
    );
    const pending = store.getPending();
    const due = pending.filter((i) => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 1);
    assert.strictEqual(due[0].id, "past");
  });

  test("processed item is not in pending even if past notBefore", async () => {
    const past = new Date(Date.now() - 3_600_000);
    await store.add(makeItem({ id: "x", notBefore: past.toISOString() }));
    await store.markProcessed("x");
    const pending = store.getPending();
    const due = pending.filter((i) => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 0);
  });
});

// ── Edit in-place (QueueStore.update) ─────────────────────────────────────────

suite("QueueStore.update() — edit in-place", () => {
  let store: QueueStore;

  setup(() => {
    store = new QueueStore(
      new MockMemento() as unknown as import("vscode").Memento,
    );
  });

  test("update() changes promptText", async () => {
    const item = makeItem({ id: "a", promptText: "original" });
    await store.add(item);
    await store.update("a", { promptText: "updated text" });
    const found = store.getAll().find((i) => i.id === "a");
    assert.strictEqual(found?.promptText, "updated text");
  });

  test("update() changes notBefore", async () => {
    const item = makeItem({ id: "b" });
    await store.add(item);
    const newTime = new Date(Date.now() + 7_200_000).toISOString(); // +2h
    await store.update("b", { notBefore: newTime });
    const found = store.getAll().find((i) => i.id === "b");
    assert.strictEqual(found?.notBefore, newTime);
  });

  test("update() changes both promptText and notBefore simultaneously", async () => {
    const item = makeItem({ id: "c", promptText: "old" });
    await store.add(item);
    const newTime = new Date(Date.now() + 3_600_000).toISOString();
    await store.update("c", { promptText: "new", notBefore: newTime });
    const found = store.getAll().find((i) => i.id === "c");
    assert.strictEqual(found?.promptText, "new");
    assert.strictEqual(found?.notBefore, newTime);
  });

  test("update() with unknown id leaves store unchanged", async () => {
    const item = makeItem({ id: "d", promptText: "untouched" });
    await store.add(item);
    await store.update("nonexistent", { promptText: "ghost" });
    const found = store.getAll().find((i) => i.id === "d");
    assert.strictEqual(found?.promptText, "untouched");
  });

  test("update() does not affect sibling items", async () => {
    const a = makeItem({ id: "e1", promptText: "first" });
    const b = makeItem({ id: "e2", promptText: "second" });
    await store.add(a);
    await store.add(b);
    await store.update("e1", { promptText: "changed" });
    const sibling = store.getAll().find((i) => i.id === "e2");
    assert.strictEqual(sibling?.promptText, "second");
  });

  test("update() preserves processed flag and other fields", async () => {
    const item = makeItem({ id: "f", workspaceFolder: "/myproject" });
    await store.add(item);
    await store.markProcessed("f");
    await store.update("f", { promptText: "edited after delivery" });
    const found = store.getAll().find((i) => i.id === "f");
    assert.strictEqual(found?.processed, true);
    assert.strictEqual(found?.workspaceFolder, "/myproject");
    assert.strictEqual(found?.promptText, "edited after delivery");
  });
});

// ── Snooze logic ──────────────────────────────────────────────────────────────
// Mirrors the handler in QueueWebviewProvider:
//   base = max(now, notBefore)
//   newNotBefore = addMinutes(base, minutes)

suite("snooze logic", () => {
  let store: QueueStore;

  setup(() => {
    store = new QueueStore(
      new MockMemento() as unknown as import("vscode").Memento,
    );
  });

  /** Simulates the snooze handler exactly as written in QueueWebviewProvider. */
  async function snooze(id: string, minutes: number, now: Date): Promise<void> {
    const item = store.getAll().find((i) => i.id === id);
    if (!item) {
      return;
    }
    const base = new Date(
      Math.max(now.getTime(), new Date(item.notBefore).getTime()),
    );
    await store.update(id, {
      notBefore: addMinutes(base, minutes).toISOString(),
    });
  }

  test("+15m from a future notBefore uses notBefore as base", async () => {
    const now = new Date("2026-04-03T10:00:00Z");
    const future = new Date("2026-04-03T11:00:00Z"); // 60 min from now
    const item = makeItem({ id: "s1", notBefore: future.toISOString() });
    await store.add(item);
    await snooze("s1", 15, now);
    const found = store.getAll().find((i) => i.id === "s1")!;
    const expected = new Date("2026-04-03T11:15:00Z");
    assert.strictEqual(found.notBefore, expected.toISOString());
  });

  test("+15m from an overdue notBefore uses now as base", async () => {
    const now = new Date("2026-04-03T12:00:00Z");
    const past = new Date("2026-04-03T10:00:00Z"); // 2h ago
    const item = makeItem({ id: "s2", notBefore: past.toISOString() });
    await store.add(item);
    await snooze("s2", 15, now);
    const found = store.getAll().find((i) => i.id === "s2")!;
    const expected = addMinutes(now, 15);
    assert.strictEqual(found.notBefore, expected.toISOString());
  });

  test("+60m from a future notBefore moves it 1 hour forward", async () => {
    const now = new Date("2026-04-03T10:00:00Z");
    const future = new Date("2026-04-03T22:00:00Z");
    const item = makeItem({ id: "s3", notBefore: future.toISOString() });
    await store.add(item);
    await snooze("s3", 60, now);
    const found = store.getAll().find((i) => i.id === "s3")!;
    const expected = new Date("2026-04-03T23:00:00Z");
    assert.strictEqual(found.notBefore, expected.toISOString());
  });

  test("snooze on exactly-now notBefore uses now as base", async () => {
    const now = new Date("2026-04-03T12:00:00Z");
    const item = makeItem({ id: "s4", notBefore: now.toISOString() });
    await store.add(item);
    await snooze("s4", 15, now);
    const found = store.getAll().find((i) => i.id === "s4")!;
    const expected = addMinutes(now, 15);
    assert.strictEqual(found.notBefore, expected.toISOString());
  });

  test("two consecutive snoozes are cumulative", async () => {
    const now = new Date("2026-04-03T10:00:00Z");
    const future = new Date("2026-04-03T11:00:00Z");
    const item = makeItem({ id: "s5", notBefore: future.toISOString() });
    await store.add(item);
    await snooze("s5", 15, now);
    // After first snooze: 11:15. now is still 10:00, so base = 11:15.
    await snooze("s5", 15, now);
    const found = store.getAll().find((i) => i.id === "s5")!;
    const expected = new Date("2026-04-03T11:30:00Z");
    assert.strictEqual(found.notBefore, expected.toISOString());
  });

  test("snooze with unknown id is a no-op", async () => {
    const now = new Date("2026-04-03T10:00:00Z");
    const item = makeItem({ id: "s6" });
    await store.add(item);
    const before = item.notBefore;
    await snooze("nonexistent", 15, now);
    const found = store.getAll().find((i) => i.id === "s6")!;
    assert.strictEqual(found.notBefore, before);
  });
});

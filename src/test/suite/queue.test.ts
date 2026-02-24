/**
 * Unit tests for QueueStore logic (no VS Code dependency — uses a mock Memento).
 * Tests for due-item detection use the isOverdue helper from time.ts.
 */
import * as assert from 'assert';
import { QueueStore, QueueItem } from '../../queue/QueueStore';
import { isOverdue } from '../../util/time';

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
  setKeysForSync(_keys: readonly string[]): void { /* no-op */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const now = new Date();
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    notBefore: new Date(now.getTime() + 3_600_000).toISOString(), // +1h default
    promptText: 'Hello, AI!',
    workspaceFolder: '/tmp/ws',
    processed: false,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

suite('QueueStore', () => {
  let store: QueueStore;

  setup(() => {
    store = new QueueStore(new MockMemento() as unknown as import('vscode').Memento);
  });

  test('starts empty', () => {
    assert.deepStrictEqual(store.getAll(), []);
    assert.deepStrictEqual(store.getPending(), []);
  });

  test('add() persists an item', async () => {
    const item = makeItem();
    await store.add(item);
    const all = store.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, item.id);
  });

  test('getPending() excludes processed items', async () => {
    const item1 = makeItem({ id: 'a' });
    const item2 = makeItem({ id: 'b' });
    await store.add(item1);
    await store.add(item2);
    await store.markProcessed('a');
    const pending = store.getPending();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].id, 'b');
  });

  test('markProcessed() sets processed=true', async () => {
    const item = makeItem();
    await store.add(item);
    await store.markProcessed(item.id);
    const found = store.getAll().find(i => i.id === item.id);
    assert.ok(found);
    assert.strictEqual(found.processed, true);
  });

  test('remove() deletes item entirely', async () => {
    const item = makeItem();
    await store.add(item);
    await store.remove(item.id);
    assert.strictEqual(store.getAll().length, 0);
  });

  test('purgeProcessed() keeps only pending items', async () => {
    const a = makeItem({ id: 'a' });
    const b = makeItem({ id: 'b' });
    await store.add(a);
    await store.add(b);
    await store.markProcessed('a');
    await store.purgeProcessed();
    const all = store.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, 'b');
  });

  test('clear() removes all items', async () => {
    await store.add(makeItem());
    await store.add(makeItem());
    await store.clear();
    assert.strictEqual(store.getAll().length, 0);
  });

  test('multiple adds are preserved', async () => {
    for (let i = 0; i < 5; i++) {
      await store.add(makeItem({ id: `item-${i}` }));
    }
    assert.strictEqual(store.getAll().length, 5);
  });
});

suite('due-item detection (isOverdue + QueueStore)', () => {
  let store: QueueStore;

  setup(() => {
    store = new QueueStore(new MockMemento() as unknown as import('vscode').Memento);
  });

  test('item with past notBefore is due', async () => {
    const past = new Date(Date.now() - 3_600_000); // 1h ago
    await store.add(makeItem({ notBefore: past.toISOString() }));
    const pending = store.getPending();
    const due = pending.filter(i => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 1);
  });

  test('item with future notBefore is NOT due', async () => {
    const future = new Date(Date.now() + 3_600_000); // 1h from now
    await store.add(makeItem({ notBefore: future.toISOString() }));
    const pending = store.getPending();
    const due = pending.filter(i => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 0);
  });

  test('mixed items: only past ones are due', async () => {
    const past = new Date(Date.now() - 60_000);   // 1 min ago
    const future = new Date(Date.now() + 60_000); // 1 min from now
    await store.add(makeItem({ id: 'past', notBefore: past.toISOString() }));
    await store.add(makeItem({ id: 'future', notBefore: future.toISOString() }));
    const pending = store.getPending();
    const due = pending.filter(i => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 1);
    assert.strictEqual(due[0].id, 'past');
  });

  test('processed item is not in pending even if past notBefore', async () => {
    const past = new Date(Date.now() - 3_600_000);
    await store.add(makeItem({ id: 'x', notBefore: past.toISOString() }));
    await store.markProcessed('x');
    const pending = store.getPending();
    const due = pending.filter(i => isOverdue(new Date(i.notBefore)));
    assert.strictEqual(due.length, 0);
  });
});

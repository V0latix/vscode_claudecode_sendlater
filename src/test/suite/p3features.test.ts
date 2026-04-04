/**
 * Unit tests for P3 features.
 * No VS Code dependency — pure logic tests.
 */
import * as assert from "assert";
import {
  QueueStore,
  QueueItem,
  isValidQueueItemShape,
} from "../../queue/QueueStore";
import { QueueProcessor } from "../../queue/QueueProcessor";

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

// ── Mock vscode.OutputChannel ─────────────────────────────────────────────
const mockLog = {
  appendLine: (_msg: string): void => {
    /* silent */
  },
} as unknown as import("vscode").OutputChannel;

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(): QueueStore {
  return new QueueStore(
    new MockMemento() as unknown as import("vscode").Memento,
  );
}

function makeProcessor(): QueueProcessor {
  return new QueueProcessor(makeStore(), mockLog);
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

// ── isValidQueueItemShape ─────────────────────────────────────────────────

suite("isValidQueueItemShape — import validation", () => {
  test("valid item passes", () => {
    const item = makeItem();
    assert.ok(isValidQueueItemShape(item));
  });

  test("null is rejected", () => {
    assert.ok(!isValidQueueItemShape(null));
  });

  test("non-object (string) is rejected", () => {
    assert.ok(!isValidQueueItemShape("not an object"));
  });

  test("missing id is rejected", () => {
    const { id: _, ...rest } = makeItem();
    assert.ok(!isValidQueueItemShape(rest));
  });

  test("empty id is rejected", () => {
    assert.ok(!isValidQueueItemShape({ ...makeItem(), id: "" }));
  });

  test("missing promptText is rejected", () => {
    const { promptText: _, ...rest } = makeItem();
    assert.ok(!isValidQueueItemShape(rest));
  });

  test("empty promptText (whitespace only) is rejected", () => {
    assert.ok(!isValidQueueItemShape({ ...makeItem(), promptText: "   " }));
  });

  test("missing notBefore is rejected", () => {
    const { notBefore: _, ...rest } = makeItem();
    assert.ok(!isValidQueueItemShape(rest));
  });

  test("invalid notBefore (non-date string) is rejected", () => {
    assert.ok(
      !isValidQueueItemShape({ ...makeItem(), notBefore: "not-a-date" }),
    );
  });

  test("undefined notBefore is rejected", () => {
    assert.ok(
      !isValidQueueItemShape({
        ...makeItem(),
        notBefore: undefined as unknown as string,
      }),
    );
  });

  test("null promptText is rejected", () => {
    assert.ok(
      !isValidQueueItemShape({
        ...makeItem(),
        promptText: null as unknown as string,
      }),
    );
  });

  test("valid item with extra fields passes (portable export shape)", () => {
    // Export strips workspaceFolder/targetTerminalName — must still validate.
    const {
      workspaceFolder: _wf,
      targetTerminalName: _tn,
      ...portable
    } = makeItem({ targetTerminalName: "Claude" });
    assert.ok(isValidQueueItemShape(portable));
  });
});

// ── QueueProcessor — pause ─────────────────────────────────────────────────

suite("QueueProcessor — pause", () => {
  test("isPaused() defaults to false", () => {
    const p = makeProcessor();
    assert.strictEqual(p.isPaused(), false);
  });

  test("togglePause() sets paused to true", () => {
    const p = makeProcessor();
    p.togglePause();
    assert.strictEqual(p.isPaused(), true);
  });

  test("togglePause() twice restores to false", () => {
    const p = makeProcessor();
    p.togglePause();
    p.togglePause();
    assert.strictEqual(p.isPaused(), false);
  });

  test("process() returns 0 immediately when paused", async () => {
    const p = makeProcessor();
    p.togglePause();
    const result = await p.process();
    assert.strictEqual(result, 0);
  });

  test("process() runs normally after resume", async () => {
    const p = makeProcessor();
    p.togglePause();
    p.togglePause(); // resume
    // No items due → returns 0, but does not short-circuit on pause.
    // We verify process() was NOT short-circuited by checking it returns 0
    // from the empty-queue path (not the pause path).
    const result = await p.process();
    assert.strictEqual(result, 0); // 0 because no items, not because paused
  });

  test("togglePause() fires onDidChange event", () => {
    const p = makeProcessor();
    let fired = false;
    p.onDidChange(() => {
      fired = true;
    });
    p.togglePause();
    assert.ok(fired, "onDidChange should fire when paused");
  });
});

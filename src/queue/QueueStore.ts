import * as vscode from "vscode";

export interface QueueItem {
  /** Unique identifier (8-char hex). */
  id: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 — do not deliver before this time. */
  notBefore: string;
  /** The full prompt text. */
  promptText: string;
  /** Absolute path of the workspace folder, or '' if none. */
  workspaceFolder: string;
  /** Already delivered / processed. */
  processed: boolean;
  /** Name of the terminal that was active when the item was queued (delivery hint). */
  targetTerminalName?: string;
  /** Number of failed delivery attempts so far (used for retry logic). */
  deliveryAttempts?: number;
}

export interface DeliveryLogEntry {
  /** ID of the queue item that was delivered (or attempted). */
  itemId: string;
  /** ISO 8601 timestamp of the delivery attempt. */
  timestamp: string;
  status: "delivered" | "failed";
  /** Error message if status is 'failed'. */
  error?: string;
  /** First 80 characters of the prompt text. */
  promptPreview: string;
}

const STORAGE_KEY = "promptQueue.items";
const DELIVERY_LOG_KEY = "promptQueue.deliveryLog";
const DELIVERY_LOG_MAX = 20;

/**
 * Persistent queue store backed by vscode.Memento (globalState).
 * Survives restarts. Thread-safe within a single extension host.
 */
export class QueueStore {
  private readonly state: vscode.Memento;

  constructor(globalState: vscode.Memento) {
    this.state = globalState;
  }

  /** Return all items (including processed ones). */
  getAll(): QueueItem[] {
    return this.state.get<QueueItem[]>(STORAGE_KEY, []);
  }

  /** Return only pending (not yet processed) items. */
  getPending(): QueueItem[] {
    return this.getAll().filter((i) => !i.processed);
  }

  /** Add a new item to the queue. */
  async add(item: QueueItem): Promise<void> {
    const items = this.getAll();
    items.push(item);
    await this.state.update(STORAGE_KEY, items);
  }

  /** Mark an item as processed by id. */
  async markProcessed(id: string): Promise<void> {
    const items = this.getAll().map((i) =>
      i.id === id ? { ...i, processed: true } : i,
    );
    await this.state.update(STORAGE_KEY, items);
  }

  /** Remove an item entirely (e.g. user-initiated delete). */
  async remove(id: string): Promise<void> {
    const items = this.getAll().filter((i) => i.id !== id);
    await this.state.update(STORAGE_KEY, items);
  }

  /** Purge all processed items (housekeeping). */
  async purgeProcessed(): Promise<void> {
    const items = this.getAll().filter((i) => !i.processed);
    await this.state.update(STORAGE_KEY, items);
  }

  /** Update mutable fields of an existing item. */
  async update(
    id: string,
    changes: Partial<
      Pick<QueueItem, "promptText" | "notBefore" | "deliveryAttempts">
    >,
  ): Promise<void> {
    const items = this.getAll().map((i) =>
      i.id === id ? { ...i, ...changes } : i,
    );
    await this.state.update(STORAGE_KEY, items);
  }

  /** Clear everything (debug / test). */
  async clear(): Promise<void> {
    await this.state.update(STORAGE_KEY, []);
  }

  // ── Delivery log ─────────────────────────────────────────────────────────

  /** Return delivery log entries (newest first, max 20). */
  getDeliveryLog(): DeliveryLogEntry[] {
    return this.state.get<DeliveryLogEntry[]>(DELIVERY_LOG_KEY, []);
  }

  /** Prepend a new delivery log entry, keeping at most DELIVERY_LOG_MAX entries. */
  async addDeliveryLogEntry(entry: DeliveryLogEntry): Promise<void> {
    const log = this.getDeliveryLog();
    log.unshift(entry);
    if (log.length > DELIVERY_LOG_MAX) {
      log.length = DELIVERY_LOG_MAX;
    }
    await this.state.update(DELIVERY_LOG_KEY, log);
  }

  /** Clear the delivery log (debug / test). */
  async clearDeliveryLog(): Promise<void> {
    await this.state.update(DELIVERY_LOG_KEY, []);
  }
}

/**
 * Type-guard for untrusted data coming from an imported JSON file.
 * Returns true only if the object has the minimum fields required for a
 * safe queue item: a non-empty id, a non-empty promptText, and a valid
 * ISO notBefore date.
 */
export function isValidQueueItemShape(raw: unknown): raw is QueueItem {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const item = raw as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.promptText === "string" &&
    (item.promptText as string).trim().length > 0 &&
    typeof item.notBefore === "string" &&
    !isNaN(new Date(item.notBefore as string).getTime())
  );
}

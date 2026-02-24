import * as vscode from 'vscode';

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
}

const STORAGE_KEY = 'promptQueue.items';

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
    return this.getAll().filter(i => !i.processed);
  }

  /** Add a new item to the queue. */
  async add(item: QueueItem): Promise<void> {
    const items = this.getAll();
    items.push(item);
    await this.state.update(STORAGE_KEY, items);
  }

  /** Mark an item as processed by id. */
  async markProcessed(id: string): Promise<void> {
    const items = this.getAll().map(i =>
      i.id === id ? { ...i, processed: true } : i
    );
    await this.state.update(STORAGE_KEY, items);
  }

  /** Remove an item entirely (e.g. user-initiated delete). */
  async remove(id: string): Promise<void> {
    const items = this.getAll().filter(i => i.id !== id);
    await this.state.update(STORAGE_KEY, items);
  }

  /** Purge all processed items (housekeeping). */
  async purgeProcessed(): Promise<void> {
    const items = this.getAll().filter(i => !i.processed);
    await this.state.update(STORAGE_KEY, items);
  }

  /** Clear everything (debug / test). */
  async clear(): Promise<void> {
    await this.state.update(STORAGE_KEY, []);
  }
}

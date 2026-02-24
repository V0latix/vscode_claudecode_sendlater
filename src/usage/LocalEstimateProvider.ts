/**
 * Local Best-Effort Usage Provider
 *
 * When no API keys are configured, this provider estimates token usage
 * from queued prompts in the store, using the heuristic: tokens ≈ chars / 4.
 *
 * It does NOT call any external API.
 * It is always available and always returns status 'ok'.
 */
import { IUsageProvider, TokenUsage, ProviderStatus } from './IUsageProvider';
import { QueueStore } from '../queue/QueueStore';
import { getWindowStart5h, getWindowStart7d } from '../util/time';

/** Rough token estimate: 1 token ≈ 4 chars (English). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class LocalEstimateProvider implements IUsageProvider {
  readonly name = 'Local Estimate';
  private readonly store: QueueStore;

  constructor(store: QueueStore) {
    this.store = store;
  }

  async isConfigured(): Promise<boolean> {
    return true; // Always available
  }

  getStatus(): ProviderStatus {
    return 'ok';
  }

  async fetchUsage(): Promise<TokenUsage> {
    const now = new Date();
    const start5h = getWindowStart5h(now);
    const start7d = getWindowStart7d(now);

    const pending = this.store.getPending();

    let tokens5h = 0;
    let tokens7d = 0;

    for (const item of pending) {
      const createdAt = new Date(item.createdAt).getTime();
      const tokens = estimateTokens(item.promptText);

      if (createdAt >= start7d.getTime()) {
        tokens7d += tokens;
      }
      if (createdAt >= start5h.getTime()) {
        tokens5h += tokens;
      }
    }

    return {
      tokensLast5h: tokens5h,
      tokensLast7d: tokens7d,
      lastUpdated: new Date(),
      error: pending.length === 0
        ? 'No API keys configured. Configure OpenAI or Anthropic keys for accurate usage data.'
        : undefined,
    };
  }
}

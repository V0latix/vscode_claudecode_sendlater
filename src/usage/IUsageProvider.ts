/**
 * Shared interface and types for all usage data providers.
 */

export interface ModelBreakdown {
  model: string;
  tokens: number;
}

export interface TokenUsage {
  /** Tokens used in the last 5 hours. */
  tokensLast5h: number;
  /** Tokens used in the last 7 days. */
  tokensLast7d: number;
  /** When this data was last fetched. */
  lastUpdated: Date;
  /** Per-model breakdown (optional). */
  breakdown?: ModelBreakdown[];
  /** Human-readable error message, if any. */
  error?: string;
  /** True if the API has a known data lag (e.g. a few minutes behind). */
  dataDelay?: boolean;
  /**
   * Token counts per hour for the last 24 hours.
   * Array of 24 values, index 0 = oldest hour (23-24h ago), index 23 = current hour (0-1h ago).
   */
  hourlyLast24h?: number[];
  /** Session (last 5h / per-session) quota from claude.ai. */
  sessionUsage?: {
    used: number;
    limit: number;
    percent: number;
    resetAt: Date | null;
  };
  /** Weekly quota from claude.ai. */
  weeklyUsage?: {
    used: number;
    limit: number;
    percent: number;
    resetAt: Date | null;
  };
  /** Opus-specific quota from claude.ai. */
  opusUsage?: { used: number; limit: number; percent: number };
}

export type ProviderStatus = "ok" | "no-key" | "error" | "unconfigured";

export interface IUsageProvider {
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** Whether the provider has the credentials it needs to fetch data. */
  isConfigured(): Promise<boolean>;
  /** Fetch and return usage data. Should never throw — return error in result. */
  fetchUsage(): Promise<TokenUsage>;
  /** Current status (cached, updated by fetchUsage). */
  getStatus(): ProviderStatus;
}

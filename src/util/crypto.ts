import * as nodeCrypto from 'crypto';

/**
 * Generate a short random hex ID (8 chars).
 * Uses Node's built-in crypto — no external dependency.
 */
export function generateShortId(): string {
  return nodeCrypto.randomBytes(4).toString('hex');
}

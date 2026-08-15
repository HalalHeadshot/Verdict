/**
 * In-memory store for per-install API tokens.
 *
 * Replaces reliance on a single shared static API_KEY: each extension
 * install registers once (POST /api/v1/auth/register) and gets its own
 * token. A leaked or abused token can be revoked individually without
 * invalidating access for every other install, which a single shared key
 * cannot do.
 *
 * Same in-memory Map pattern as cache.service.ts — in production/multi-
 * instance this should move to a shared store (Redis) for the same reasons
 * documented there.
 */
import { v4 as uuidv4 } from "uuid";

interface TokenRecord {
  createdAt: number;
  lastUsedAt: number | null;
  revoked: boolean;
}

const tokens = new Map<string, TokenRecord>();

export const tokenService = {
  /** Issue a new unique token and record it as active. */
  issue(): string {
    const token = uuidv4();
    tokens.set(token, { createdAt: Date.now(), lastUsedAt: null, revoked: false });
    return token;
  },

  /** True if the token was issued by this service and has not been revoked. */
  isValid(token: string): boolean {
    const record = tokens.get(token);
    if (!record || record.revoked) return false;
    record.lastUsedAt = Date.now();
    return true;
  },

  /** Revoke a single token without affecting any other issued token. */
  revoke(token: string): boolean {
    const record = tokens.get(token);
    if (!record) return false;
    record.revoked = true;
    return true;
  },

  /** Count of currently-issued (including revoked) tokens — for health/monitoring. */
  size(): number {
    return tokens.size;
  },
};

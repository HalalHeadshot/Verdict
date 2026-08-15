/**
 * Per-install API tokens. Replaces reliance on a single shared static
 * API_KEY: each extension install registers once (POST /api/v1/auth/register)
 * and gets its own token. A leaked or abused token can be revoked
 * individually without invalidating access for every other install, which
 * a single shared key cannot do.
 *
 * Redis-backed when REDIS_URL is configured (shared across backend
 * instances — a token issued by one instance is recognized by all of
 * them), in-memory otherwise — see lib/kv-store.ts. No TTL: tokens
 * represent persistent install identity, not disposable cache data.
 */
import { v4 as uuidv4 } from "uuid";
import { createKVStore } from "../lib/kv-store.js";

interface TokenRecord {
  createdAt: number;
  lastUsedAt: number | null;
  revoked: boolean;
}

const store = createKVStore("api-token");

export const tokenService = {
  /** Issue a new unique token and record it as active. */
  async issue(): Promise<string> {
    const token = uuidv4();
    await store.set<TokenRecord>(token, { createdAt: Date.now(), lastUsedAt: null, revoked: false });
    return token;
  },

  /** True if the token was issued by this service and has not been revoked. */
  async isValid(token: string): Promise<boolean> {
    const record = await store.get<TokenRecord>(token);
    if (!record || record.revoked) return false;
    await store.set<TokenRecord>(token, { ...record, lastUsedAt: Date.now() });
    return true;
  },

  /** Revoke a single token without affecting any other issued token. */
  async revoke(token: string): Promise<boolean> {
    const record = await store.get<TokenRecord>(token);
    if (!record) return false;
    await store.set<TokenRecord>(token, { ...record, revoked: true });
    return true;
  },

  /** Count of currently-issued tokens — for health/monitoring. */
  async size(): Promise<number> {
    return store.size();
  },
};

/**
 * Claim result cache. Key: normalized claim text → Value: FactCheckResult[].
 *
 * Redis-backed when REDIS_URL is configured (shared across backend
 * instances), in-memory otherwise — see lib/kv-store.ts.
 */
import type { FactCheckResult } from "@verdict/shared-types";
import { createKVStore } from "../lib/kv-store.js";

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const store = createKVStore("claim-cache");

/**
 * Normalizes claim text into a cache key.
 * Normalizes whitespace and lowercases for better cache hit rates.
 */
function makeKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export const cache = {
  async get(text: string): Promise<FactCheckResult[] | null> {
    return store.get<FactCheckResult[]>(makeKey(text));
  },

  async set(text: string, results: FactCheckResult[]): Promise<void> {
    await store.set(makeKey(text), results, TTL_SECONDS);
  },

  /** Return cache size for health/monitoring endpoints */
  async size(): Promise<number> {
    return store.size();
  },
};

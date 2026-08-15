/**
 * Tavily evidence cache, keyed per normalized claim text — separate from
 * cache.service.ts (which caches full FactCheckResult[] keyed on the
 * entire submitted request text). This one exists so the SAME claim,
 * appearing in different requests, reuses one Tavily search instead of
 * paying for a fresh one every time — the free tier is credit-limited.
 *
 * Redis-backed when REDIS_URL is configured (shared across backend
 * instances), in-memory otherwise — see lib/kv-store.ts.
 *
 * Only successful search outcomes are cached (including a genuinely empty
 * result set) — missing-key and transient network/timeout failures are
 * deliberately NOT cached, since those aren't "no evidence exists," they're
 * "couldn't check right now," and shouldn't be locked in for the TTL.
 */
import type { EvidenceSnippet } from "./retrieval.service.js";
import { createKVStore } from "../lib/kv-store.js";

const TTL_SECONDS = 24 * 60 * 60; // 1 day — evidence for a factual claim rarely changes hour to hour

const store = createKVStore("evidence-cache");

function makeKey(claim: string): string {
  return claim.toLowerCase().replace(/\s+/g, " ").trim();
}

export const evidenceCache = {
  async get(claim: string): Promise<EvidenceSnippet[] | null> {
    return store.get<EvidenceSnippet[]>(makeKey(claim));
  },

  async set(claim: string, evidence: EvidenceSnippet[]): Promise<void> {
    await store.set(makeKey(claim), evidence, TTL_SECONDS);
  },

  async size(): Promise<number> {
    return store.size();
  },
};

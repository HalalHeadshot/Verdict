/**
 * In-memory cache for Tavily search evidence, keyed per normalized claim text.
 *
 * Separate from cache.service.ts (which caches full FactCheckResult[] keyed
 * on the entire submitted request text). This one exists so that the SAME
 * claim, appearing in different requests, reuses one Tavily search instead
 * of paying for a fresh one every time — the free tier is credit-limited,
 * so redundant searches for identical claims are pure waste.
 *
 * Only successful search outcomes are cached (including a genuinely empty
 * result set) — missing-key and transient network/timeout failures are
 * deliberately NOT cached, since those aren't "no evidence exists," they're
 * "couldn't check right now," and shouldn't be locked in for the TTL.
 */
import type { EvidenceSnippet } from "./retrieval.service.js";

const TTL_MS = 24 * 60 * 60 * 1000; // 1 day — evidence for a factual claim rarely changes hour to hour

interface CacheEntry {
  evidence: EvidenceSnippet[];
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

function makeKey(claim: string): string {
  return claim.toLowerCase().replace(/\s+/g, " ").trim();
}

export const evidenceCache = {
  get(claim: string): EvidenceSnippet[] | null {
    const key = makeKey(claim);
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.evidence;
  },

  set(claim: string, evidence: EvidenceSnippet[]): void {
    const key = makeKey(claim);
    store.set(key, { evidence, expiresAt: Date.now() + TTL_MS });
  },

  size(): number {
    return store.size;
  },

  prune(): void {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.expiresAt) store.delete(key);
    }
  },
};

setInterval(() => evidenceCache.prune(), 60 * 60 * 1000);

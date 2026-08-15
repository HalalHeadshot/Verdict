import dotenv from "dotenv";
dotenv.config();
import { evidenceCache } from "./retrieval-cache.service.js";

const TAVILY_TIMEOUT_MS = 8000;

export interface EvidenceSnippet {
  title: string;
  url: string;
  content: string;
}

interface TavilySearchResponse {
  results?: Array<{ title: string; url: string; content: string }>;
}

/**
 * Retrieves live web search evidence for a claim via Tavily.
 *
 * Always resolves — never throws. Missing API key, network failure, timeout,
 * or a non-2xx response all resolve to an empty array so the verification
 * pipeline can fall back to unaided model reasoning instead of failing the
 * whole request over a search provider outage.
 */
export async function retrieveEvidence(claim: string): Promise<EvidenceSnippet[]> {
  const cached = evidenceCache.get(claim);
  if (cached) return cached;

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: claim,
        search_depth: "basic",
        max_results: 4,
        include_answer: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`⚠️ Tavily search failed (${res.status}) for claim: "${claim.slice(0, 60)}..."`);
      return [];
    }

    const data = (await res.json()) as TavilySearchResponse;
    const evidence = (data.results ?? [])
      .filter((r) => r.title && r.url && r.content)
      .map((r) => ({ title: r.title, url: r.url, content: r.content.slice(0, 600) }));

    // Only cache a genuinely completed search (even if it found nothing) —
    // never cache the missing-key or error/timeout paths above, since those
    // are transient states, not "this claim has no evidence."
    evidenceCache.set(claim, evidence);
    return evidence;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ Tavily search error for claim: "${claim.slice(0, 60)}...": ${reason}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

import { Router, Request, Response } from "express";
import type { VerifyClaimsRequest, VerifyClaimsResponse } from "@verdict/shared-types";
import { extractFactCheckableClaims } from "../services/extraction.service.js";
import { verifyClaims } from "../services/verification.service.js";
import { cache } from "../services/cache.service.js";

const router = Router();

/**
 * POST /api/v1/claims/verify
 *
 * Accepts raw text, extracts fact-checkable claims,
 * verifies them with AI, and returns structured verdicts.
 */
router.post("/verify", async (req: Request, res: Response) => {
  const { text, sourceUrl, context } = req.body as VerifyClaimsRequest;

  if (!text || typeof text !== "string" || text.trim().length < 10) {
    res.status(400).json({ error: "Request body must include a 'text' field (min 10 chars)." });
    return;
  }

  // --- MOCK MODE ---
  if (process.env.MOCK_MODE === "true") {
    const mockResponse: VerifyClaimsResponse = {
      results: [
        {
          id: "mock-1234",
          claim: text.length > 50 ? text.substring(0, 50) + "..." : text,
          verdict: "False",
          reasoning: "This is a mocked reasoning to simulate an AI response.",
          fact: "This is the real factual information (Mocked).",
          source: "Mocked Source Organization",
          sourceUrl: "https://example.com",
          sourceConfidence: 0.95,
          factDeviationScore: 1.0,
          factDeviationReasoning: "The claim is completely false (Mock).",
          timestamp: new Date().toISOString(),
          fromCache: false,
          groundedInSearch: false
        }
      ],
      filteredCount: 0,
    };
    // slight delay to simulate network/AI
    setTimeout(() => res.json(mockResponse), 1500);
    return;
  }
  // -----------------

  // Check L2 in-memory cache
  const cached = cache.get(text);
  if (cached) {
    const response: VerifyClaimsResponse = {
      results: cached.map((r) => ({ ...r, fromCache: true })),
      filteredCount: 0,
    };
    res.json(response);
    return;
  }

  // Stage 1: Extract claims — the same call also flags prompt-injection
  // attempts, at no extra Groq cost (see extraction.service.ts).
  const extraction = await extractFactCheckableClaims(text);

  if (extraction.injectionDetected) {
    console.warn(`⚠️ Blocked request — prompt injection detected: ${extraction.injectionReason ?? "no reason given"}`);
    // Cache the empty outcome so repeated identical injection attempts don't
    // keep re-spending Groq tokens on the same text.
    cache.set(text, []);
    const response: VerifyClaimsResponse = { results: [], filteredCount: 0 };
    res.json(response);
    return;
  }

  const claims = extraction.claims;

  if (!claims.length) {
    // Same reasoning: repeated identical non-factual text (opinions, filler)
    // shouldn't re-run extraction every time either.
    cache.set(text, []);
    const response: VerifyClaimsResponse = { results: [], filteredCount: 0 };
    res.json(response);
    return;
  }

  // Stage 2: Verify claims
  const results = await verifyClaims(claims);

  // Cache results for future identical requests
  cache.set(text, results);

  const response: VerifyClaimsResponse = {
    results,
    filteredCount: 0,
  };

  res.json(response);
});

/**
 * GET /api/v1/claims/health
 * Returns server health and cache stats.
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    cacheSize: cache.size(),
    timestamp: new Date().toISOString(),
  });
});

export default router;

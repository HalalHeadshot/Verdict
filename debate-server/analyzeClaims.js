// analyzeClaims.js
import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";
import extractFactCheckableClaims from "./semantic-filter.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Safely parses Gemini output.
 * - If valid JSON → return it
 * - If plain text (e.g. starts with INACCURATE) → wrap it
 */
function safeParseGeminiResponse(text, claims) {
  try {
    return JSON.parse(text);
  } catch (err) {
    return [
      {
        claim: claims.map(c => c.claim).join(" | "),
        verdict: text.trim().startsWith("INACCURATE") ? "False" : "Uncertain",
        fact: "Could not verify.",
        deviation: "Analysis failed.",
        source: "N/A",
        sourceUrl: null,
        confidence: 0
      }
    ];
  }
}

async function analyzeClaims(transcript) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not found");
  }

  // 🔹 PART 1 — CLAIM EXTRACTION (UNCHANGED)
  const claims = await extractFactCheckableClaims(transcript);

  if (!claims || claims.length === 0) {
    return [];
  }

  // 🔒 YOUR PROMPT — 100% UNCHANGED
  const prompt = `
You are a neutral debate analyst.

You will receive a JSON array of extracted factual claims from a political transcript.
Each element has this structure:
   - "claim": "exact claim text",
   - "reason": "why this needs fact-checking",
   - "confidence": "high|medium|low"
Your tasks:
1. Read and understand all claims.
2. Write a clear, well-structured analytical summary (2–4 short paragraphs) that:
   - Groups related claims together by topic.
   - Explains what each group of claims suggests about the speaker's main points.
   - Avoids adding new facts that are not implied by the claims.
3. Keep a neutral, descriptive tone (no opinions, no fact-checking).
4. Do NOT repeat the JSON or list claims one by one; synthesize them into smooth prose.

Input format:
- You will receive ONLY a JSON array (no extra text around it).

Output format:
- Mention a link to the source you referred to determine whether given source is accurate or inaccurate.
- On the first line in capital letters mention "INACCURATE" whenever received statement is factually false.
- Return ONLY the final written analysis as plain text (no JSON, no bullets, no markdown).

Claims:
${JSON.stringify(claims, null, 2)}

Return ONLY valid JSON in this structure:
[
  {
    "claim": "The exact claim text from statements",
    "verdict": "True | False | Misleading | Uncertain",
    "fact": "The actual statistic/fact from reliable sources",
    "deviation": "Brief explanation of how the claim differs from reality (e.g. Claimed 20%, actual is 5%)",
    "source": "Name of the source (e.g. World Bank, BLS)",
    "sourceUrl": "A valid URL to the source (if available)",
    "confidence": 0.95
  }
]
`;

  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash-lite"
  });

  const res = await model.generateContent(prompt);
  const rawText = res.response.text();

  // 🧼 Clean markdown if Gemini adds it
  const cleanedText = rawText.replace(/```json\n?|```/g, "").trim();

  // 🛡️ SAFE PARSE (NO CRASH EVER)
  return safeParseGeminiResponse(cleanedText, claims);
}

export default analyzeClaims;

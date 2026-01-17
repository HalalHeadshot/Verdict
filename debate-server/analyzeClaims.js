// analyzeClaims.js
import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";
import extractFactCheckableClaims from "./semantic-filter.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * ALWAYS returns an ARRAY
 * Handles JSON array, JSON object, or plain-text fallback
 */
function safeParseGeminiResponse(text, claims) {
  try {
    const parsed = JSON.parse(text);

    const normalize = (item) => ({
      claim: item.claim || item.Claim || claims.map(c => c.claim).join(" | "),
      verdict: item.verdict || item.Verdict || "Uncertain",

      // 🔹 Topic deviation
      topicDeviationScore:
        typeof item.topicDeviationScore === "number"
          ? Math.min(Math.max(item.topicDeviationScore, 0), 1)
          : 0.5,

      topicDeviationReasoning:
        item.topicDeviationReasoning || "No topic deviation reasoning provided.",

      // 🔹 Fact deviation (NEW)
      factDeviationScore:
        typeof item.factDeviationScore === "number"
          ? Math.min(Math.max(item.factDeviationScore, 0), 1)
          : 0.5,

      factDeviationReasoning:
        item.factDeviationReasoning || "No factual deviation reasoning provided.",

      // 🔹 Evidence
      fact: item.fact || "Not specified.",
      source: item.source || "Not specified.",
      sourceUrl: item.sourceUrl || null,

      sourceConfidence:
        typeof item.sourceConfidence === "number"
          ? Math.min(Math.max(item.sourceConfidence, 0), 1)
          : 0
    });

    if (Array.isArray(parsed)) {
      return parsed.map(normalize);
    }

    return [normalize(parsed)];

  } catch {
    // 🔹 Plain-text fallback
    return [
      {
        claim: claims.map(c => c.claim).join(" | "),
        verdict: text.toUpperCase().includes("INACCURATE") ? "False" : "Uncertain",

        topicDeviationScore: 0.5,
        topicDeviationReasoning:
          "Topic relevance could not be determined from unstructured AI output.",

        factDeviationScore: 0.5,
        factDeviationReasoning:
          "Factual deviation could not be determined from unstructured AI output.",

        fact: "Could not verify.",
        source: "N/A",
        sourceUrl: null,
        sourceConfidence: 0
      }
    ];
  }
}

async function analyzeClaims(transcript, currentTopic = "") {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not found");
  }

  // 🔹 PART 1 — CLAIM EXTRACTION
  const claims = await extractFactCheckableClaims(transcript);

  if (!claims || claims.length === 0) {
    return [];
  }

  // 🔥 UPDATED PROMPT (topic + fact deviation)
  const prompt = `
You are a real-time debate fact-checking and moderation assistant.

You will receive:
- The CURRENT DEBATE TOPIC
- A list of fact-checkable claims extracted from a debater's statement

Your tasks:
1. Evaluate the factual accuracy of each claim.
2. Measure how far each claim deviates from established facts.
3. Measure how far each claim deviates from the debate topic.
4. Provide reliable citations whenever possible.
5. Remain strictly neutral and evidence-based.

Scoring definitions:
- topicDeviationScore (0 to 1):
  0 = fully on-topic
  1 = completely off-topic

- factDeviationScore (0 to 1):
  0 = factually accurate
  1 = factually false
  Values between indicate misleading or partially incorrect claims.

CURRENT TOPIC:
"${currentTopic || "No topic provided"}"

CLAIMS:
${JSON.stringify(claims, null, 2)}

Return ONLY valid JSON in this structure:
[
  {
    "claim": "Exact claim text",
    "verdict": "True | False | Misleading | Uncertain",

    "topicDeviationScore": 0.0,
    "topicDeviationReasoning": "Short explanation",

    "factDeviationScore": 0.0,
    "factDeviationReasoning": "Short explanation",

    "fact": "Correct factual information",
    "source": "Source name (e.g. WHO, World Bank)",
    "sourceUrl": "https://...",
    "sourceConfidence": 0.95
  }
]
`;

  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const res = await model.generateContent(prompt);
  const rawText = res.response.text();

  // 🔍 LOG RAW GEMINI RESPONSE
  console.log("🧠 GEMINI RAW RESPONSE START");
  console.log(rawText);
  console.log("🧠 GEMINI RAW RESPONSE END");
  console.log("────────────────────────");

  const cleanedText = rawText.replace(/```json\n?|```/g, "").trim();

  return safeParseGeminiResponse(cleanedText, claims);
}

export default analyzeClaims;

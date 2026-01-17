import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function extractFactCheckableClaims(transcript) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not found");
  }

  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  const prompt = `
You are a fact-checking assistant.

Extract ONLY objectively fact-checkable claims.
Ignore opinions, comparisons, and subjective statements.

Transcript:
"${transcript}"

Return ONLY valid JSON:
[
  {
    "claim": "exact claim text",
    "reason": "why this needs fact-checking",
    "confidence": "high|medium|low"
  }
]
`;

  const client = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    model: "gemini-2.5-flash-lite"
  });

  const res = await model.generateContent(prompt);
  const text = res.response.text();

  const cleaned = text.replace(/```json\n?|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return Array.isArray(parsed) ? parsed : [];
}

export default extractFactCheckableClaims;

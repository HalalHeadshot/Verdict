// ─────────────────────────────────────────────
// Verdict — Shared Type Definitions
// Used by both apps/api and apps/extension
// ─────────────────────────────────────────────

/** The possible verdicts for a fact-checked claim */
export type VerdictLabel = "True" | "False" | "Misleading" | "Uncertain" | "Unverifiable";

/** A single extracted claim from a transcript or page text */
export interface ExtractedClaim {
  claim: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

/** The full fact-check result returned from the API */
export interface FactCheckResult {
  /** Unique identifier for this fact-check result */
  id: string;
  /** The original claim text */
  claim: string;
  /** The AI's verdict */
  verdict: VerdictLabel;
  /** Human-readable explanation of the verdict */
  reasoning: string;
  /** The factually correct information */
  fact: string;
  /** Name of the source (e.g., "World Health Organization") */
  source: string;
  /** URL to the source, if available */
  sourceUrl: string | null;
  /** 0–1: how confident the model is in the source */
  sourceConfidence: number;
  /** 0–1: how far the claim deviates from established facts (0=accurate, 1=false) */
  factDeviationScore: number;
  /** Short textual explanation of the factual deviation score */
  factDeviationReasoning: string;
  /** ISO timestamp when this result was generated */
  timestamp: string;
  /** Whether this result was served from cache */
  fromCache?: boolean;
  /** Whether the verdict was grounded in live web search evidence (RAG), vs. the model's unaided training knowledge */
  groundedInSearch?: boolean;
}

/** Request body for POST /api/v1/claims/verify */
export interface VerifyClaimsRequest {
  /** The raw text to extract claims from and verify */
  text: string;
  /** The URL of the page where the text originated */
  sourceUrl?: string;
  /** Optional hint about the context (e.g., "youtube", "article", "pdf") */
  context?: "youtube" | "article" | "pdf" | "social" | "selection" | "general";
}

/** Response body for POST /api/v1/claims/verify */
export interface VerifyClaimsResponse {
  results: FactCheckResult[];
  /** How many claims were detected but filtered as non-fact-checkable */
  filteredCount: number;
}

/** Claim history item stored in chrome.storage.local */
export interface StoredClaimResult extends FactCheckResult {
  /** URL of the page where the claim was detected */
  pageUrl: string;
  /** Page title at time of check */
  pageTitle?: string;
}

/** Extension settings stored in chrome.storage.sync */
export interface ExtensionSettings {
  /** Whether the extension is globally enabled */
  enabled: boolean;
  /** Whether to auto-detect and check claims without user trigger */
  autoDetect: boolean;
  /** Minimum confidence level to surface a notification */
  minConfidence: "high" | "medium" | "low";
  /** Color theme preference */
  theme: "dark" | "light" | "system";
  /** Whether to show the floating overlay */
  showOverlay: boolean;
  /** Whether YouTube subtitle scanning is enabled */
  youtubeEnabled: boolean;
  /** API endpoint for the Verdict backend */
  apiUrl: string;
}

/** Default extension settings */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  autoDetect: true,
  minConfidence: "medium",
  theme: "system",
  showOverlay: true,
  youtubeEnabled: true,
  apiUrl: "http://localhost:3001",
};

/** Message types for chrome.runtime.sendMessage communication */
export type MessageType =
  | "VERDICT_CHECK_TEXT"        // Content → Background: send text for checking
  | "VERDICT_RESULT"            // Background → Content: send result to display
  | "VERDICT_SETTINGS_GET"      // Any → Background: get current settings
  | "VERDICT_SETTINGS_SET"      // Any → Background: update settings
  | "VERDICT_SETTINGS_RESPONSE" // Background → Any: return settings
  | "VERDICT_HISTORY_GET"       // Any → Background: get claim history
  | "VERDICT_HISTORY_RESPONSE"  // Background → Any: return history
  | "VERDICT_CLEAR_HISTORY"     // Any → Background: clear history
  | "VERDICT_CONTENT_READY"     // Content → Background: content script ready
  | "VERDICT_SHOW_OVERLAY"      // Background → Content: show/hide overlay
  | "VERDICT_LOADING_START"     // Background → Content: show loading state
  | "VERDICT_LOADING_STOP"      // Background → Content: hide loading state
  | "VERDICT_ERROR";            // Background → Content: show error state

/** A typed extension message */
export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

/**
 * Centralized timeout constants for every outbound call to an external API
 * in the pipeline (Groq, Tavily), so each one fails fast and predictably
 * instead of hanging indefinitely and stalling a request.
 */
export const GROQ_TIMEOUT_MS = 8000;
export const TAVILY_TIMEOUT_MS = 8000;

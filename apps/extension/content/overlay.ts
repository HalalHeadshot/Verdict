/**
 * Verdict — Shadow DOM Overlay
 *
 * Renders the floating fact-check UI inside an isolated Shadow DOM
 * so the extension's styles never clash with the host page.
 *
 * Architecture:
 *   <verdict-overlay> (Custom Element host, appended to document.body)
 *     └── #shadow-root (closed)
 *         └── <div id="verdict-container"> (all UI lives here)
 */

import type { FactCheckResult } from "@verdict/shared-types";

let shadowRoot: ShadowRoot | null = null;
let container: HTMLElement | null = null;
const VERDICT_HOST_ID = "verdict-overlay-host";

// ─── Overlay CSS (injected into Shadow DOM — fully isolated) ──────────────────

const OVERLAY_CSS = `
  :host {
    all: initial;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    pointer-events: none;
  }

  #verdict-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 380px;
    pointer-events: all;
  }

  .verdict-card {
    background: rgba(0, 23, 31, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 16px;
    color: #fff;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: verdict-slide-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;
    transition: opacity 0.2s ease;
  }

  .verdict-card.verdict-fade-out {
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  }

  @keyframes verdict-slide-in {
    from { opacity: 0; transform: translateY(16px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)   scale(1);    }
  }

  .verdict-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 8px;
  }

  .verdict-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .verdict-label.true   { background: rgba(34,197,94,0.2);  color: #86efac; }
  .verdict-label.false  { background: rgba(239,68,68,0.2);  color: #fca5a5; }
  .verdict-label.misleading { background: rgba(234,179,8,0.2); color: #fde68a; }
  .verdict-label.uncertain  { background: rgba(148,163,184,0.15); color: #94a3b8; }
  .verdict-label.unverifiable { background: rgba(148,163,184,0.15); color: #94a3b8; }

  .verdict-close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    line-height: 1;
    font-size: 16px;
    transition: color 0.15s;
    flex-shrink: 0;
  }
  .verdict-close:hover { color: #fff; }

  .verdict-claim {
    font-size: 13px;
    color: rgba(255,255,255,0.7);
    margin-bottom: 8px;
    line-height: 1.5;
    font-style: italic;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .verdict-fact {
    font-size: 13px;
    color: #e2e8f0;
    line-height: 1.6;
    margin-bottom: 10px;
  }

  .verdict-deviation {
    margin-bottom: 8px;
  }

  .verdict-deviation-bar-wrap {
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 999px;
    overflow: hidden;
    margin-top: 4px;
  }

  .verdict-deviation-bar {
    height: 100%;
    border-radius: 999px;
    transition: width 0.6s ease;
  }

  .verdict-source {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-top: 8px;
    margin-top: 8px;
  }

  .verdict-source a {
    color: #60a5fa;
    text-decoration: none;
  }
  .verdict-source a:hover { text-decoration: underline; }

  .verdict-branding {
    font-size: 10px;
    color: rgba(255,255,255,0.25);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* Loading state */
  .verdict-loading {
    background: rgba(0, 23, 31, 0.9);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 14px 18px;
    color: rgba(255,255,255,0.7);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    animation: verdict-slide-in 0.2s ease;
  }

  .verdict-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.15);
    border-top-color: #60a5fa;
    border-radius: 50%;
    animation: verdict-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes verdict-spin {
    to { transform: rotate(360deg); }
  }

  /* Error state */
  .verdict-error {
    background: rgba(185, 28, 28, 0.9);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    padding: 14px 18px;
    color: #fca5a5;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 500;
    animation: verdict-slide-in 0.2s ease;
  }
`;

// ─── Public API ───────────────────────────────────────────────────────────────

/** Inject the Shadow DOM host into the page body */
export function createOverlay(): void {
  if (document.getElementById(VERDICT_HOST_ID)) return;

  const host = document.createElement("div");
  host.id = VERDICT_HOST_ID;

  shadowRoot = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = OVERLAY_CSS;
  shadowRoot.appendChild(style);

  container = document.createElement("div");
  container.id = "verdict-container";
  container.setAttribute("role", "log");
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-label", "Verdict fact-check results");
  shadowRoot.appendChild(container);

  document.body.appendChild(host);
}

/** Show a spinner while the check is running */
export function showLoadingState(): void {
  if (!container) return;
  removeLoadingCard();

  const card = document.createElement("div");
  card.className = "verdict-loading";
  card.id = "verdict-loading-card";

  const spinner = document.createElement("div");
  spinner.className = "verdict-spinner";
  spinner.setAttribute("role", "status");
  spinner.setAttribute("aria-label", "Fact-checking in progress");

  const text = document.createTextNode("Fact-checking with Verdict AI…");

  card.appendChild(spinner);
  card.appendChild(text);
  container.appendChild(card);
}

/** Remove the loading spinner */
export function hideLoadingState(): void {
  removeLoadingCard();
}

/** Show an error state */
export function showErrorState(message: string): void {
  if (!container) return;
  removeLoadingCard();
  removeErrorCard();

  const card = document.createElement("div");
  card.className = "verdict-error";
  card.id = "verdict-error-card";
  card.setAttribute("role", "alert");
  card.setAttribute("aria-live", "assertive");

  const icon = document.createElement("span");
  icon.textContent = "⚠️";
  
  const text = document.createTextNode(message);

  card.appendChild(icon);
  card.appendChild(text);
  container.prepend(card);

  setTimeout(() => {
    if (card.isConnected) {
      card.classList.add("verdict-fade-out");
      setTimeout(() => card.remove(), 300);
    }
  }, 5000);
}

/** Render a fact-check result card in the overlay */
export function showVerdictCard(result: FactCheckResult): void {
  if (!container) return;

  const card = document.createElement("div");
  card.className = "verdict-card";
  card.setAttribute("role", "article");
  card.setAttribute("aria-label", `Verdict: ${result.verdict}`);

  const deviationPct = Math.round(result.factDeviationScore * 100);
  const deviationColor = deviationPct < 30 ? "#4ade80" : deviationPct < 60 ? "#facc15" : "#f87171";
  const labelClass = result.verdict.toLowerCase().replace(/ /g, "-");

  card.innerHTML = `
    <div class="verdict-header">
      <span class="verdict-label ${labelClass}" role="status" aria-label="Verdict: ${result.verdict}">
        ${getVerdictEmoji(result.verdict)} ${result.verdict}
      </span>
      <button class="verdict-close" aria-label="Dismiss fact-check result">✕</button>
    </div>

    <div class="verdict-claim">"${escapeHtml(result.claim)}"</div>

    <div class="verdict-fact">${escapeHtml(result.fact)}</div>

    <div class="verdict-deviation">
      <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:4px;">
        Fact deviation: ${deviationPct}%
      </div>
      <div class="verdict-deviation-bar-wrap">
        <div class="verdict-deviation-bar"
          style="width:${deviationPct}%;background:${deviationColor};">
        </div>
      </div>
    </div>

    <div class="verdict-source">
      <div>
        ${result.source
          ? result.sourceUrl
            ? `<a href="${escapeHtml(result.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.source)}</a>`
            : escapeHtml(result.source)
          : "No source cited"}
        ${result.sourceConfidence > 0
          ? ` · ${Math.round(result.sourceConfidence * 100)}% confidence`
          : ""}
        ${result.groundedInSearch
          ? ` · <span title="Verified against live web search results">🔎 web-grounded</span>`
          : ` · <span title="Based on the AI model's own trained knowledge, not a live search">🧠 model knowledge</span>`}
      </div>
      <span class="verdict-branding">Verdict AI</span>
    </div>
  `;

  // Wire up dismiss button
  card.querySelector<HTMLButtonElement>(".verdict-close")?.addEventListener("click", () => {
    card.classList.add("verdict-fade-out");
    setTimeout(() => card.remove(), 300);
  });

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (!card.isConnected) return;
    card.classList.add("verdict-fade-out");
    setTimeout(() => card.remove(), 300);
  }, 30_000);

  container.prepend(card);

  // Keep max 3 cards visible at a time
  const cards = container.querySelectorAll(".verdict-card");
  if (cards.length > 3) {
    cards[cards.length - 1]?.remove();
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function removeLoadingCard(): void {
  container?.querySelector("#verdict-loading-card")?.remove();
}

function removeErrorCard(): void {
  container?.querySelector("#verdict-error-card")?.remove();
}

function getVerdictEmoji(verdict: string): string {
  switch (verdict) {
    case "True": return "✓";
    case "False": return "✗";
    case "Misleading": return "⚠";
    case "Uncertain": return "?";
    default: return "–";
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

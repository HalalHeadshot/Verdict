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
import DOMPurify from "dompurify";

let shadowRoot: ShadowRoot | null = null;
let container: HTMLElement | null = null;
const VERDICT_HOST_ID = "verdict-overlay-host";

// ─── Overlay CSS (injected into Shadow DOM — fully isolated) ──────────────────

const OVERLAY_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;700&display=swap');

:host {
  all: initial;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 2147483647;
  pointer-events: none;
}

#verdict-container {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 440px;
  pointer-events: all;
}

.verdict-card {
  background: #0F1E26;
  color: #E6E1D6;
  border: 1.5px solid #2A3C46;
  border-radius: 8px;
  box-shadow: 0 14px 42px rgba(0,0,0,0.6);
  overflow: hidden;
  animation: verdict-slide-in .28s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
}

.verdict-card.verdict-fade-out {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.25s, transform 0.25s;
}

@keyframes verdict-slide-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.verdict-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #2A3C46;
  padding-bottom: 12px;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-bullet {
  color: #7DDC83;
  font-size: 10px;
  vertical-align: middle;
}

.header-branding {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #E6E1D6;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-time {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 11px;
  color: #8897A1;
  letter-spacing: 0.05em;
}

.header-live-badge {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 700;
  color: #B99A5A;
  border: 1px solid #B99A5A;
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.08em;
}

.verdict-close {
  background: none;
  border: none;
  color: #8897A1;
  font-size: 14px;
  cursor: pointer;
  margin-left: 8px;
  padding: 0 4px;
  transition: color 0.15s;
  display: flex;
  align-items: center;
}

.verdict-close:hover {
  color: #E6E1D6;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  box-sizing: border-box;
}

.status-info {
  flex: 1;
  padding-right: 16px;
  box-sizing: border-box;
}

.section-label {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #B99A5A;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.status-value-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.status-bullet {
  font-size: 14px;
}

.status-value {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 1.1;
}

.status-desc {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #8897A1;
}

.confidence-dial {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.dial-svg {
  width: 100%;
  height: 100%;
}

.dial-track {
  fill: none;
  stroke: #2A3C46;
  stroke-width: 2.5;
  stroke-dasharray: 2.5 2.5;
}

.dial-progress-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.dial-progress {
  fill: none;
  stroke-width: 2.5;
  stroke-dasharray: 2.5 2.5;
}

.dial-inner {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
}

.dial-pct {
  font-family: 'Inter', sans-serif;
  font-size: 19px;
  font-weight: 700;
  color: #E6E1D6;
  line-height: 1.1;
}

.dial-label {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #8897A1;
  margin-top: 2px;
}

.divider {
  height: 1px;
  background: #2A3C46;
  width: 100%;
  border: none;
  margin: 0;
}

.divider-dotted {
  height: 1px;
  border-top: 1.5px dashed #2A3C46;
  width: 100%;
  margin: 0;
}

.claim-section {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.claim-content {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  box-sizing: border-box;
}

.quote-icon {
  font-family: Georgia, serif;
  font-size: 26px;
  color: #B99A5A;
  line-height: 1;
  margin-top: -6px;
  user-select: none;
}

.claim-text {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-style: italic;
  line-height: 1.6;
  color: #E6E1D6;
  margin: 0;
}

.analysis-section {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.analysis-text {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 1.6;
  color: #E6E1D6;
  margin: 0;
}

.deviation-section {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.deviation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.deviation-pct-label {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #8897A1;
  text-transform: uppercase;
}

.deviation-bar-grid {
  display: flex;
  gap: 2px;
  width: 100%;
  height: 14px;
  box-sizing: border-box;
}

.deviation-block {
  flex: 1;
  height: 100%;
  border-radius: 1px;
  background: #2A3C46;
}

.deviation-block.success {
  background: #7DDC83;
}

.deviation-block.warning {
  background: #F0C674;
}

.deviation-block.danger {
  background: #E56B6F;
}

.deviation-block.muted {
  background: #8897A1;
}

.source-section {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.source-grid {
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
}

.source-left-col {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  box-sizing: border-box;
}

.source-doc-icon {
  flex-shrink: 0;
}

.source-details {
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-sizing: border-box;
}

.source-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
}

.source-title {
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #E6E1D6;
}

.source-link-icon {
  color: #B99A5A;
  text-decoration: none;
  font-size: 12px;
  transition: color 0.15s;
  display: inline-flex;
  align-items: center;
}

.source-link-icon:hover {
  color: #E6E1D6;
}

.source-metadata {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: #8897A1;
}

.reliability-badge {
  font-weight: 600;
}

.reliability-badge.high {
  color: #7DDC83;
}

.reliability-badge.medium {
  color: #F0C674;
}

.reliability-badge.low {
  color: #E56B6F;
}

.source-vertical-divider {
  width: 1px;
  height: 38px;
  background: #2A3C46;
  margin: 0 16px;
  flex-shrink: 0;
}

.report-id-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 140px;
  box-sizing: border-box;
}

.report-id-label {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #B99A5A;
}

.report-id-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
}

.report-id-value {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 11px;
  color: #E6E1D6;
  letter-spacing: 0.05em;
}

.copy-btn {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #B99A5A;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.copy-btn:hover {
  color: #E6E1D6;
}

.verdict-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #8897A1;
  text-transform: uppercase;
  box-sizing: border-box;
}

.footer-version {
  color: #8897A1;
  letter-spacing: 0.05em;
}

.verdict-loading {
  background: #0F1E26;
  color: #E6E1D6;
  border: 1.5px solid #2A3C46;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  animation: verdict-slide-in 0.25s ease;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 12px;
  letter-spacing: 0.05em;
  box-shadow: 0 14px 42px rgba(0,0,0,0.6);
  box-sizing: border-box;
}

.verdict-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #2A3C46;
  border-top-color: #B99A5A;
  border-radius: 50%;
  animation: verdict-spin 0.8s linear infinite;
}

@keyframes verdict-spin {
  to {
    transform: rotate(360deg);
  }
}

.verdict-error {
  background: #2d1815;
  border: 1.5px solid #E56B6F;
  color: #E6E1D6;
  padding: 20px;
  border-radius: 8px;
  animation: verdict-slide-in 0.25s ease;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  line-height: 1.6;
  box-shadow: 0 14px 42px rgba(0,0,0,0.6);
  box-sizing: border-box;
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

  const details = getVerdictDetails(result.verdict);
  const confidence = Math.round(result.sourceConfidence * 100);
  const confidenceText = result.verdict === "Uncertain" || result.verdict === "Unverifiable" ? "--" : `${confidence}`;
  const deviationPct = Math.round(result.factDeviationScore * 100);
  
  // Dial Mask setup (always uses confidence, but hides for Uncertain)
  const dialConfidence = result.verdict === "Uncertain" || result.verdict === "Unverifiable" ? 0 : confidence;

  // Build deviation bar blocks (30 segments)
  const totalBlocks = 30;
  const activeBlocks = Math.round(totalBlocks * (1 - result.factDeviationScore));
  let blocksHtml = "";
  for (let i = 0; i < totalBlocks; i++) {
    let blockClass = "";
    if (i < activeBlocks) {
      if (result.verdict === "False") {
        blockClass = "danger";
      } else if (result.verdict === "Uncertain" || result.verdict === "Unverifiable") {
        blockClass = "muted";
      } else if (result.verdict === "Misleading") {
        blockClass = "warning";
      } else {
        // True (Verified)
        // Draw last warning blocks if there's deviation
        const warningStart = activeBlocks - Math.round(activeBlocks * result.factDeviationScore);
        if (i >= warningStart) {
          blockClass = "warning";
        } else {
          blockClass = "success";
        }
      }
    }
    blocksHtml += `<div class="deviation-block ${blockClass}"></div>`;
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const timeAgo = getTimeAgo(result.timestamp);
  const reliability = getReliabilityText(result.sourceConfidence);
  const reportId = formatReportId(result.id);

  card.innerHTML = `
    <div class="verdict-header">
      <div class="header-left">
        <span class="header-bullet" style="color: ${details.color}">●</span>
        <span class="header-branding">VERDICT // LIVE ANALYSIS</span>
      </div>
      <div class="header-right">
        <span class="header-time">${timeStr}</span>
        <span class="header-live-badge">LIVE</span>
        <button class="verdict-close" aria-label="Dismiss fact-check result">✕</button>
      </div>
    </div>

    <div class="status-row">
      <div class="status-info">
        <div class="section-label">STATUS</div>
        <div class="status-value-wrapper">
          <span class="status-bullet" style="color: ${details.color}">●</span>
          <span class="status-value" style="color: ${details.color}">${details.label}</span>
        </div>
        <div class="status-desc">${details.desc}</div>
      </div>
      <div class="confidence-dial">
        <svg class="dial-svg" viewBox="0 0 72 72">
          <circle class="dial-track" cx="36" cy="36" r="32" />
        </svg>
        <div class="dial-progress-wrapper" style="mask-image: conic-gradient(#fff 0% ${dialConfidence}%, transparent ${dialConfidence}% 100%); -webkit-mask-image: conic-gradient(#fff 0% ${dialConfidence}%, transparent ${dialConfidence}% 100%);">
          <svg class="dial-svg" viewBox="0 0 72 72">
            <circle class="dial-progress" cx="36" cy="36" r="32" stroke="${details.color}" />
          </svg>
        </div>
        <div class="dial-inner">
          <span class="dial-pct" style="${result.verdict === 'False' ? 'color: #E56B6F;' : ''}">${confidenceText}${confidenceText === '--' ? '' : '%'}</span>
          <span class="dial-label">CONFIDENCE</span>
        </div>
      </div>
    </div>

    <div class=”divider-dotted”></div>

    <div class=”claim-section”>
      <div class=”section-label”>CLAIM</div>
      <div class=”claim-content”>
        <span class=”quote-icon”>”</span>
        <p class=”claim-text”>${escapeHtml(result.claim)}</p>
      </div>
    </div>

    <div class="divider"></div>

    <div class="analysis-section">
      <div class="section-label">ANALYSIS</div>
      <p class="analysis-text">${escapeHtml(result.fact || result.reasoning)}</p>
    </div>

    <div class="divider"></div>

    <div class="deviation-section">
      <div class="deviation-header">
        <div class="section-label">FACT DEVIATION</div>
        <span class="deviation-pct-label">${deviationPct}% DEVIATION</span>
      </div>
      <div class="deviation-bar-grid">
        ${blocksHtml}
      </div>
    </div>

    <div class="divider"></div>

    <div class="source-section">
      <div class="source-grid">
        <div class="source-left-col">
          <svg class="source-doc-icon" viewBox="0 0 24 24" width="22" height="22">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="#8897A1" stroke-width="1.5" />
            <polyline points="14 2 14 8 20 8" fill="none" stroke="#8897A1" stroke-width="1.5" />
            <line x1="16" y1="13" x2="8" y2="13" stroke="#8897A1" stroke-width="1.5" />
            <line x1="16" y1="17" x2="8" y2="17" stroke="#8897A1" stroke-width="1.5" />
            <polyline points="10 9 9 9 8 9" fill="none" stroke="#8897A1" stroke-width="1.5" />
          </svg>
          <div class="source-details">
            <div class="section-label" style="margin-bottom: 2px;">SOURCE</div>
            <div class="source-name-row">
              <span class="source-title">${escapeHtml(result.source || "No source cited")}</span>
              ${
                result.sourceUrl
                  ? `<a class="source-link-icon" href="${escapeHtml(result.sourceUrl)}" target="_blank" rel="noopener noreferrer">
                       <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                         <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                         <polyline points="15 3 21 3 21 9" />
                         <line x1="10" y1="14" x2="21" y2="3" />
                       </svg>
                     </a>`
                  : ""
              }
            </div>
            <div class="source-metadata">
              Published ${timeAgo} • <span class="reliability-badge ${reliability.tier}">${reliability.text}</span>
              ${result.groundedInSearch
                ? ` • <span title="Verified against live web search results">🔎 web-grounded</span>`
                : ` • <span title="Based on the AI model's own trained knowledge, not a live search">🧠 model knowledge</span>`}
            </div>
          </div>
        </div>

        <div class="source-vertical-divider"></div>

        <div class="report-id-col">
          <div class="report-id-label">REPORT ID</div>
          <div class="report-id-value-row">
            <span class="report-id-value">${reportId}</span>
            <button class="copy-btn" title="Copy Report ID">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="divider-dotted"></div>

    <div class="verdict-footer">
      <span>VERDICT AI FACT-CHECK ENGINE</span>
      <span class="footer-version">v1.4.2</span>
    </div>
  `;

  // Wire up copy button
  const copyBtn = card.querySelector<HTMLButtonElement>(".copy-btn");
  copyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(reportId).then(() => {
      const originalSvg = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg class="check-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7DDC83" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      `;
      setTimeout(() => {
        if (copyBtn.isConnected) {
          copyBtn.innerHTML = originalSvg;
        }
      }, 1500);
    });
  });

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

function getVerdictDetails(verdict: string) {
  switch (verdict) {
    case "True":
      return {
        label: "VERIFIED",
        color: "#7DDC83",
        bg: "rgba(125, 220, 131, 0.1)",
        desc: "The claim is supported by reliable evidence.",
        bullet: "●"
      };
    case "False":
      return {
        label: "FALSE",
        color: "#E56B6F",
        bg: "rgba(229, 107, 111, 0.1)",
        desc: "The claim is contradicted by reliable evidence.",
        bullet: "●"
      };
    case "Misleading":
      return {
        label: "MISLEADING",
        color: "#F0C674",
        bg: "rgba(240, 198, 116, 0.1)",
        desc: "Partially accurate but contains important misleading details.",
        bullet: "●"
      };
    default:
      return {
        label: "UNCERTAIN",
        color: "#8897A1",
        bg: "rgba(136, 151, 161, 0.1)",
        desc: "Not enough reliable information is available to verify this claim.",
        bullet: "●"
      };
  }
}

function getTimeAgo(isoString: string): string {
  if (!isoString) return "unknown ago";
  const now = new Date();
  const past = new Date(isoString);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getReliabilityText(score: number): { text: string; tier: string } {
  if (score >= 0.8) return { text: "High Reliability", tier: "high" };
  if (score >= 0.5) return { text: "Medium Reliability", tier: "medium" };
  return { text: "Low Reliability", tier: "low" };
}

function formatReportId(id: string): string {
  if (!id) return "VRT-UNKNOWN";
  if (id.startsWith("VRT-")) return id;
  const clean = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (clean.length >= 12) {
    return `VRT-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  }
  return `VRT-${clean}`;
}

/**
 * Strips ALL HTML from AI-sourced text before it's interpolated into the
 * card's innerHTML template. DOMPurify actually parses the string and
 * removes dangerous constructs (script content, event-handler attributes,
 * etc.) rather than pattern-matching characters, which is a stronger
 * guarantee than manual entity-escaping — and it stays correct even if a
 * future field is added and someone forgets to escape it here, since
 * ALLOWED_TAGS: [] strips markup from any string passed through it.
 */
function escapeHtml(str: string): string {
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Gavel,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Trash2,
  Settings,
  Power,
  ExternalLink,
} from "lucide-react";
import type { StoredClaimResult, ExtensionSettings, FactCheckResult } from "@verdict/shared-types";
import { DEFAULT_SETTINGS } from "@verdict/shared-types";
import "./popup.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Helpers & Design Configurations ──────────────────────────────────────────

const VERDICT_DETAILS: Record<string, { label: string; color: string; desc: string }> = {
  True: {
    label: "VERIFIED",
    color: "#7DDC83",
    desc: "The claim is supported by reliable evidence.",
  },
  False: {
    label: "FALSE",
    color: "#E56B6F",
    desc: "The claim is contradicted by reliable evidence.",
  },
  Misleading: {
    label: "MISLEADING",
    color: "#F0C674",
    desc: "Partially accurate but contains important misleading details.",
  },
  Uncertain: {
    label: "UNCERTAIN",
    color: "#8897A1",
    desc: "Not enough reliable information is available to verify this claim.",
  },
  Unverifiable: {
    label: "UNCERTAIN",
    color: "#8897A1",
    desc: "Not enough reliable information is available to verify this claim.",
  },
};

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

function CopyReportId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button className="copy-btn-compact" onClick={copy} title="Copy Report ID">
      {copied ? (
        <svg className="check-icon-compact" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#7DDC83" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function ClaimCard({ claim }: { claim: StoredClaimResult }) {
  const details = VERDICT_DETAILS[claim.verdict] ?? VERDICT_DETAILS.Uncertain;
  const confidence = Math.round(claim.sourceConfidence * 100);
  const confidenceText = claim.verdict === "Uncertain" || claim.verdict === "Unverifiable" ? "--" : `${confidence}`;
  const deviationPct = Math.round(claim.factDeviationScore * 100);

  const dialConfidence = claim.verdict === "Uncertain" || claim.verdict === "Unverifiable" ? 0 : confidence;

  // Build deviation bar blocks (30 segments)
  const totalBlocks = 30;
  const activeBlocks = Math.round(totalBlocks * (1 - claim.factDeviationScore));
  const blocks = [];
  for (let i = 0; i < totalBlocks; i++) {
    let blockClass = "";
    if (i < activeBlocks) {
      if (claim.verdict === "False") {
        blockClass = "danger";
      } else if (claim.verdict === "Uncertain" || claim.verdict === "Unverifiable") {
        blockClass = "muted";
      } else if (claim.verdict === "Misleading") {
        blockClass = "warning";
      } else {
        // True (Verified)
        const warningStart = activeBlocks - Math.round(activeBlocks * claim.factDeviationScore);
        if (i >= warningStart) {
          blockClass = "warning";
        } else {
          blockClass = "success";
        }
      }
    }
    blocks.push(<div key={i} className={`deviation-block-compact ${blockClass}`} />);
  }

  const timeAgo = getTimeAgo(claim.timestamp);
  const reliability = getReliabilityText(claim.sourceConfidence);
  const reportId = formatReportId(claim.id);

  return (
    <div className="claim-card-verdict">
      <div className="verdict-header-compact">
        <div className="header-left-compact">
          <span className="header-bullet-compact" style={{ color: details.color }}>●</span>
          <span className="header-branding-compact">VERDICT // LIVE ANALYSIS</span>
        </div>
        <div className="header-right-compact">
          <span className="header-time-compact">
            {new Date(claim.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="header-live-badge-compact">LIVE</span>
        </div>
      </div>

      <div className="status-row-compact">
        <div className="status-info-compact">
          <div className="section-label-compact">STATUS</div>
          <div className="status-value-wrapper-compact">
            <span className="status-bullet-compact" style={{ color: details.color }}>●</span>
            <span className="status-value-compact" style={{ color: details.color }}>{details.label}</span>
          </div>
          <div className="status-desc-compact">{details.desc}</div>
        </div>
        <div className="confidence-dial-compact">
          <svg className="dial-svg-compact" viewBox="0 0 72 72">
            <circle className="dial-track-compact" cx="36" cy="36" r="32" />
          </svg>
          <div className="dial-progress-wrapper-compact" style={{
            maskImage: `conic-gradient(#fff 0% ${dialConfidence}%, transparent ${dialConfidence}% 100%)`,
            WebkitMaskImage: `conic-gradient(#fff 0% ${dialConfidence}%, transparent ${dialConfidence}% 100%)`
          }}>
            <svg className="dial-svg-compact" viewBox="0 0 72 72">
              <circle className="dial-progress-compact" cx="36" cy="36" r="32" stroke={details.color} />
            </svg>
          </div>
          <div className="dial-inner-compact">
            <span className="dial-pct-compact" style={claim.verdict === 'False' ? { color: '#E56B6F' } : undefined}>
              {confidenceText}{confidenceText === '--' ? '' : '%'}
            </span>
            <span className="dial-label-compact">CONFIDENCE</span>
          </div>
        </div>
      </div>

      <div className="divider-dotted-compact" />

      <div className="claim-section-compact">
        <div className="section-label-compact">CLAIM</div>
        <div className="claim-content-compact">
          <span className="quote-icon-compact">“</span>
          <p className="claim-text-compact">{claim.claim}</p>
        </div>
      </div>

      <div className="divider-compact" />

      <div className="analysis-section-compact">
        <div className="section-label-compact">ANALYSIS</div>
        <p className="analysis-text-compact">{claim.fact || claim.reasoning}</p>
      </div>

      <div className="divider-compact" />

      <div className="deviation-section-compact">
        <div className="deviation-header-compact">
          <div className="section-label-compact">FACT DEVIATION</div>
          <span className="deviation-pct-label-compact">{deviationPct}% DEVIATION</span>
        </div>
        <div className="deviation-bar-grid-compact">
          {blocks}
        </div>
      </div>

      <div className="divider-compact" />

      <div className="source-section-compact">
        <div className="source-grid-compact">
          <div className="source-left-col-compact">
            <svg className="source-doc-icon-compact" viewBox="0 0 24 24" width="18" height="18">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="#8897A1" strokeWidth="1.5" />
              <polyline points="14 2 14 8 20 8" fill="none" stroke="#8897A1" strokeWidth="1.5" />
              <line x1="16" y1="13" x2="8" y2="13" stroke="#8897A1" strokeWidth="1.5" />
              <line x1="16" y1="17" x2="8" y2="17" stroke="#8897A1" strokeWidth="1.5" />
              <polyline points="10 9 9 9 8 9" fill="none" stroke="#8897A1" strokeWidth="1.5" />
            </svg>
            <div className="source-details-compact">
              <div className="section-label-compact" style={{ marginBottom: 2 }}>SOURCE</div>
              <div className="source-name-row-compact">
                <span className="source-title-compact">{claim.source || "No source cited"}</span>
                {claim.sourceUrl && (
                  <a className="source-link-icon-compact" href={claim.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="source-metadata-compact">
                Published {timeAgo} • <span className={`reliability-badge-compact ${reliability.tier}`}>{reliability.text}</span>
              </div>
            </div>
          </div>

          <div className="source-vertical-divider-compact" />

          <div className="report-id-col-compact">
            <div className="report-id-label-compact">REPORT ID</div>
            <div className="report-id-value-row-compact">
              <span className="report-id-value-compact">{reportId}</span>
              <CopyReportId id={reportId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Popup Root Component ─────────────────────────────────────────────────────

function Popup() {
  const [history, setHistory] = useState<StoredClaimResult[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [historyRes, settingsRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "VERDICT_HISTORY_GET" }),
      chrome.runtime.sendMessage({ type: "VERDICT_SETTINGS_GET" }),
    ]);
    setHistory(historyRes?.payload ?? []);
    setSettings(settingsRes?.payload ?? DEFAULT_SETTINGS);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleEnabled = async () => {
    const next = !settings.enabled;
    await chrome.runtime.sendMessage({
      type: "VERDICT_SETTINGS_SET",
      payload: { enabled: next },
    });
    setSettings((s) => ({ ...s, enabled: next }));
  };

  const clearHistory = async () => {
    await chrome.runtime.sendMessage({ type: "VERDICT_CLEAR_HISTORY" });
    setHistory([]);
  };

  return (
    <div className="popup-root">
      {/* Header */}
      <header className="popup-header">
        <div className="popup-title">
          <div className="title-line">
            <span className="title-bullet" style={{ color: settings.enabled ? "#7DDC83" : "#8897A1" }}>●</span>
            VERDICT // DAILY BRIEF
          </div>
          <div className="subtitle">
            INTELLIGENCE REPORT
          </div>
        </div>
        <div className="popup-header-actions">
          <button
            id="toggle-enabled"
            className={`power-btn ${settings.enabled ? "active" : ""}`}
            onClick={toggleEnabled}
            aria-label={settings.enabled ? "Disable Verdict" : "Enable Verdict"}
            title={settings.enabled ? "Disable" : "Enable"}
          >
            <Power size={16} />
          </button>
          <button
            id="open-options"
            className="icon-btn"
            onClick={() => chrome.runtime.openOptionsPage()}
            aria-label="Open settings"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Status Banner */}
      {!settings.enabled && (
        <div className="status-banner disabled" role="alert">
          Verdict is disabled — click the power button to enable.
        </div>
      )}

      {/* History */}
      <main className="popup-body">
        <div className="section-header">
          <span>Recent Fact-Checks</span>
          {history.length > 0 && (
            <button id="clear-history" className="text-btn" onClick={clearHistory} aria-label="Clear all history">
              <Trash2 size={13} /> Clear
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="spinner" role="status" aria-label="Loading" />
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state" role="status">
            <Gavel size={32} style={{ opacity: 0.15, color: "#B99A5A" }} />
            <p>No fact-checks yet.</p>
            <p className="empty-sub">
              Highlight text on any page and right-click → <strong>Fact Check with Verdict</strong>
            </p>
          </div>
        ) : (
          <ul className="claim-list" role="list">
            {history.slice(0, 20).map((c) => (
              <li key={c.id} role="listitem">
                <ClaimCard claim={c} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Footer */}
      <footer className="popup-footer">
        <span>{history.length} check{history.length !== 1 ? "s" : ""} recorded</span>
        <span className="footer-version">v1.4.2</span>
      </footer>
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);

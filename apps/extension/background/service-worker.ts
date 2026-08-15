/**
 * Verdict — Background Service Worker (Manifest V3)
 *
 * IMPORTANT: Per MV3 rules, this SW is ephemeral (~30s inactivity timeout).
 * ALL state is stored in chrome.storage. NO global variables for state.
 * ALL listeners are registered synchronously at the top level.
 */

import type {
  ExtensionMessage,
  ExtensionSettings,
  StoredClaimResult,
  VerifyClaimsRequest,
  VerifyClaimsResponse,
} from "@verdict/shared-types";
import { DEFAULT_SETTINGS } from "@verdict/shared-types";

// ─── Installation ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // Set default settings on first install
  if (details.reason === "install") {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    await chrome.storage.local.set({ claimHistory: [] });
    // Open onboarding page on first install
    await chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html") });
  }

  // Register (or reuse) this install's own API token, so it's ready before
  // the first fact-check request rather than adding latency to it.
  const { settings } = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  await getApiKey(settings.apiUrl ?? DEFAULT_SETTINGS.apiUrl);

  setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
});

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "verdict-check-selection",
      title: 'Fact Check with Verdict: "%s"',
      contexts: ["selection"],
    });
  });
}

// ─── Context Menu Handler ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "verdict-check-selection") return;
  if (!info.selectionText || !tab?.id) return;

  const { settings } = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
  if (!settings.enabled) return;

  // Notify the content script that a check is starting
  await sendToContentScript(tab.id, { type: "VERDICT_LOADING_START", payload: null });

  const result = await runFactCheck(
    { text: info.selectionText, sourceUrl: tab.url, context: "selection" },
    settings
  );

  // Send results back to the tab's content script to display in the overlay
  if (result && result.results.length > 0) {
    for (const factResult of result.results) {
      await sendToContentScript(tab.id, { type: "VERDICT_RESULT", payload: factResult });
      await saveToHistory(factResult, tab.url ?? "", tab.title);
    }
  } else {
    await sendToContentScript(tab.id, { type: "VERDICT_LOADING_STOP", payload: null });
    if (!result) {
      await sendToContentScript(tab.id, { type: "VERDICT_ERROR", payload: "Failed to connect to Verdict API." });
    }
  }
});

// ─── Message Handler (from Content Scripts & Popup) ───────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "VERDICT_CHECK_TEXT": {
        const req = message.payload as VerifyClaimsRequest;
        const { settings } = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
        if (!settings.enabled) { sendResponse({ results: [] }); return; }

        const tabId = sender.tab?.id;
        if (tabId) await sendToContentScript(tabId, { type: "VERDICT_LOADING_START", payload: null });

        const result = await runFactCheck(req, settings);

        if (result?.results.length && tabId) {
          for (const factResult of result.results) {
            await sendToContentScript(tabId, { type: "VERDICT_RESULT", payload: factResult });
            await saveToHistory(factResult, sender.tab?.url ?? "", sender.tab?.title);
          }
        } else if (tabId) {
          await sendToContentScript(tabId, { type: "VERDICT_LOADING_STOP", payload: null });
          if (!result) {
            await sendToContentScript(tabId, { type: "VERDICT_ERROR", payload: "Failed to connect to Verdict API." });
          }
        }
        sendResponse({ ok: true });
        break;
      }

      case "VERDICT_SETTINGS_GET": {
        const { settings } = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
        sendResponse({ type: "VERDICT_SETTINGS_RESPONSE", payload: settings });
        break;
      }

      case "VERDICT_SETTINGS_SET": {
        const newSettings = message.payload as Partial<ExtensionSettings>;
        const { settings } = await chrome.storage.sync.get({ settings: DEFAULT_SETTINGS });
        const merged = { ...settings, ...newSettings };
        await chrome.storage.sync.set({ settings: merged });
        sendResponse({ ok: true });
        break;
      }

      case "VERDICT_HISTORY_GET": {
        const { claimHistory = [] } = await chrome.storage.local.get({ claimHistory: [] });
        sendResponse({ type: "VERDICT_HISTORY_RESPONSE", payload: claimHistory });
        break;
      }

      case "VERDICT_CLEAR_HISTORY": {
        await chrome.storage.local.set({ claimHistory: [] });
        await chrome.action.setBadgeText({ text: "" });
        sendResponse({ ok: true });
        break;
      }

      default:
        // Unknown message type — silently ignore
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();
  return true; // Keep message channel open for async response
});

// ─── Auth: Per-Install Token Registration ─────────────────────────────────────

/**
 * Returns this install's own API token, registering one via
 * POST /api/v1/auth/register if it doesn't have one yet (first run, or
 * storage was cleared). The token is cached in chrome.storage.local so
 * registration only happens once per install, not on every request.
 *
 * If registration is unreachable or fails for any reason, this falls back
 * to the build-time VITE_API_KEY — the same key the extension always used
 * before this change — so the core fact-checking pipeline keeps working
 * even if the auth endpoint is down.
 */
async function getApiKey(apiUrl: string): Promise<string> {
  const { registeredToken } = await chrome.storage.local.get({ registeredToken: null });
  if (registeredToken) return registeredToken;

  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/register`, { method: "POST" });
    if (res.ok) {
      const { token } = (await res.json()) as { token?: string };
      if (token) {
        await chrome.storage.local.set({ registeredToken: token });
        return token;
      }
    }
    console.warn(`[Verdict] Token registration returned ${res.status}, falling back to static key.`);
  } catch (err) {
    console.warn("[Verdict] Token registration unreachable, falling back to static key:", err);
  }

  return import.meta.env.VITE_API_KEY || "";
}

// ─── Core: Run Fact Check via Backend API ─────────────────────────────────────

async function runFactCheck(
  req: VerifyClaimsRequest,
  settings: ExtensionSettings
): Promise<VerifyClaimsResponse | null> {
  const apiUrl = settings.apiUrl ?? DEFAULT_SETTINGS.apiUrl;
  const apiKey = await getApiKey(apiUrl);

  return fetchWithRetry(`${apiUrl}/api/v1/claims/verify`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "X-Api-Key": apiKey
    },
    body: JSON.stringify(req),
  });
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delay = 1000): Promise<VerifyClaimsResponse | null> {
  try {
    const response = await fetch(url, options);

    if (response.ok) {
      return (await response.json()) as VerifyClaimsResponse;
    }

    if (response.status >= 500 && retries > 0) {
      console.warn(`[Verdict] API 5xx error, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }

    console.error(`[Verdict] API error: ${response.status} ${response.statusText}`);
    return null;
  } catch (err) {
    if (retries > 0) {
      console.warn(`[Verdict] Fetch failed, retrying in ${delay}ms...`, err);
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    console.error("[Verdict] Failed to reach API after retries:", err);
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendToContentScript(tabId: number, message: ExtensionMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script may not be ready yet — silently fail
  }
}

async function saveToHistory(
  result: import("@verdict/shared-types").FactCheckResult,
  pageUrl: string,
  pageTitle?: string
): Promise<void> {
  const { claimHistory = [] } = await chrome.storage.local.get({ claimHistory: [] });
  const stored: StoredClaimResult = { ...result, pageUrl, pageTitle };
  const updated = [stored, ...claimHistory].slice(0, 100); // Keep last 100 results
  await chrome.storage.local.set({ claimHistory: updated });

  // Update badge with count of today's checks
  const todayCount = updated.filter((r: StoredClaimResult) => {
    const d = new Date(r.timestamp);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  await chrome.action.setBadgeText({ text: todayCount > 0 ? String(todayCount) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#003459" });
}

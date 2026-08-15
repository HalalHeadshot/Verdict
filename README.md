# Verdict

Verdict is a real-time, AI-powered fact-checking Chrome Extension. Highlight a claim on any webpage (or let it watch YouTube captions automatically), and Verdict extracts the fact-checkable claims, grounds them in live web search results, and returns a clear verdict with sources, a confidence score, and a factual deviation score.

## Architecture

Verdict is structured as a **Turborepo** monorepo using **pnpm workspaces**.

```text
verdict-monorepo/
├── apps/
│   ├── api/                 # Node.js + Express backend powering the AI extraction and verification pipeline
│   └── extension/           # Manifest V3 Chrome Extension (React + Vite)
└── packages/
    └── shared-types/        # Shared TypeScript interfaces to keep the frontend and backend in sync
```

The backend also depends on two external services and one optional shared-state store:

- **Groq** — LLM inference for claim extraction and verification
- **Tavily** — live web search, used to ground verification in real evidence (RAG) instead of the model's unaided training knowledge
- **Redis** *(optional)* — shared cache, auth tokens, and rate-limit state across multiple backend instances. Falls back to in-memory, per-process storage automatically if not configured — fine for a single instance.

## Features

- **Context Menu Integration**: Highlight text on any page and click "Fact Check with Verdict"
- **YouTube Auto-Scan**: Watches live closed captions, buffers them into complete sentences, and automatically fact-checks claims as a video plays
- **Isolated UI Overlay**: Fact-check results appear in a floating card rendered inside an isolated Shadow DOM, so the extension's UI never clashes with the host page's CSS
- **RAG-Grounded Verification**: Before a claim is verified, the backend searches the live web (via Tavily) for relevant evidence and grounds the model's verdict in that evidence rather than its own training data alone. Each result reports whether it was `groundedInSearch` so you can tell a web-backed verdict from the model's unaided judgment.
- **Robust Security & Reliability**:
  - **Per-install token auth**: each extension install silently registers its own API token (`POST /api/v1/auth/register`) on first run instead of relying on one shared secret — a leaked or abused token can be revoked individually. Falls back to a static `API_KEY` if registration is ever unreachable.
  - **Semantic prompt-injection detection**: the extraction stage — the same Groq call that filters claims, at no extra cost — also judges whether the input text itself is attempting to manipulate the AI, and blocks it if so.
  - Zod-powered schema validation guards every AI response before it's trusted.
  - DOMPurify sanitizes all AI-sourced text before it's rendered in the overlay.
  - Automatic retry logic with exponential backoff handles transient network errors, and every external API call (Groq, Tavily) has an explicit timeout so a hang can't stall a request indefinitely.
  - Graceful offline state handling and YouTube SPA navigation support.
- **Smart AI Pipeline**:
  1. *Extraction Stage*: Groq (`llama-3.1-8b-instant`) filters out opinions and isolates fact-checkable claims, and flags prompt-injection attempts in the same call.
  2. *Retrieval Stage*: Tavily searches the live web for evidence relevant to each extracted claim.
  3. *Verification Stage*: Groq (`llama-3.3-70b-versatile`) fact-checks each claim grounded in that evidence, scoring factual deviation and citing real sources.

## Getting Started

There are two ways to run the backend: **Docker** (recommended — one command, no local Node/pnpm/Redis setup) or **manual** (faster iteration if you're actively developing the API).

### Prerequisites (either path)

- A [Groq API key](https://console.groq.com)
- A [Tavily API key](https://tavily.com) (free tier — used for RAG grounding; the pipeline still works without it, just ungrounded)
- Node.js v20+ and [pnpm](https://pnpm.io/installation) — **manual path only**
- [Docker](https://www.docker.com/) — **Docker path only**

### 1. Configure environment variables

```bash
cd apps/api
cp .env.example .env
```

Edit `apps/api/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
API_KEY=choose_a_static_fallback_key_here
```

`REDIS_URL` is already set to `redis://localhost:6379` in `.env.example` — leave it as-is for either path below (Docker publishes Redis on that port; if you unset it entirely, both paths still work, just without shared state across instances).

---

### Option A — Docker (recommended)

From the repo root:

```bash
docker compose up -d --build
```

This builds the API image and starts two containers — `api` (port 3001) and `redis` (port 6379, persisted via a named volume). Check they're both healthy:

```bash
docker compose ps
docker compose logs api
```

To stop them (data is preserved): `docker compose stop`. To stop and remove: `docker compose down` (add `-v` to also delete the Redis volume).

---

### Option B — Manual (local dev)

```bash
# from the repo root
pnpm install

cd apps/api
pnpm dev
```

The API starts at `http://localhost:3001`. If you want Redis locally too (optional — the app runs fine without it, just without shared state), run `docker compose up -d redis` separately and leave `REDIS_URL=redis://localhost:6379` in your `.env`.

---

### 2. Configure the Chrome Extension

The extension **auto-registers its own API token** on install — no manual key setup is required for it to work. Optionally, you can set a build-time fallback key (used only if registration is ever unreachable):

```bash
cd apps/extension
echo "VITE_API_KEY=your_static_fallback_key_here" > .env
```

### 3. Build the Chrome Extension

```bash
cd apps/extension
pnpm build
```

This outputs the compiled extension into `apps/extension/dist`.

### 4. Load into Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Toggle on **Developer mode** in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `apps/extension/dist` folder.
5. The Verdict extension will appear in your browser! Pin it to your toolbar to access the popup and settings.

---

*Note: For testing purposes without a Groq API key, you can set `MOCK_MODE=true` in `apps/api/.env` to receive instant, simulated fact-check responses.*

## Testing the backend pipeline directly

Two scripts exercise the real pipeline against live APIs, useful for verifying your `.env` setup independent of the extension:

```bash
cd apps/api
pnpm test:pipeline    # full extraction → retrieval → verification chain, plus degradation paths
pnpm test:injection   # semantic prompt-injection detection, 6 cases
```

## Testing in the Browser

Follow these steps to manually test the extension's core features.

### Testing YouTube Auto-Scanning
The extension is designed to read YouTube closed captions and automatically fact-check them in the background.

1. Go to [YouTube](https://www.youtube.com).
2. Find a video that contains factual claims (e.g., a news clip, a science documentary, or a political speech).
3. **CRITICAL:** You must turn on **Closed Captions (CC)** in the YouTube video player. The extension works by reading the caption text directly from the screen.
4. Let the video play. As people speak, the extension buffers the text.
5. When there is a natural pause (about 2 seconds) and at least 30 characters have been spoken, it sends the text to the AI backend. If a fact-checkable claim is found, a Verdict Card will slide into the bottom right corner of your screen showing the claim, the fact, source, and a deviation score.

### Testing the Manual Context Menu
You can also manually trigger fact-checks on any text on the page:

1. Highlight a sentence (e.g., a factual claim in a comment or article).
2. **Right-click** the highlighted text.
3. Click the context menu option: **Fact Check with Verdict: "[your text]"**.
4. A loading spinner will appear in the bottom right corner, followed by the Verdict Card with the AI's analysis.

### Verifying History
1. Click the Verdict extension icon (the gavel) in your Chrome toolbar.
2. The popup should open and display a list of "Recent Fact-Checks". Both the automatic YouTube checks and your manual right-click checks should appear here with their respective verdicts.

## Known Limitations

- No automated test suite (no Jest/Vitest) — the scripts above exercise the real pipeline manually against live APIs instead.
- Redis is optional and falls back to in-memory storage — fine for a single instance, but cache/rate-limit/auth-token state won't be shared if you scale to multiple backend instances without it.
- No formal accuracy benchmark for verdicts — RAG grounding demonstrably improves correctness on spot-checked cases, but there's no measured accuracy percentage against a known-answer eval set yet.

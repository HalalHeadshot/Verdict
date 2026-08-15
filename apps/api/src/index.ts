import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { RedisStore, type SendCommandFn } from "rate-limit-redis";
import dotenv from "dotenv";
import claimsRouter from "./routes/claims.route.js";
import authRouter from "./routes/auth.route.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { getRedisClient } from "./lib/kv-store.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json({ limit: "50kb" }));

// CORS: In production, restrict to your extension ID origin
app.use(
  cors({
    origin: process.env.NODE_ENV === "production"
      ? (origin, callback) => {
          // Allow Chrome Extension origins and localhost for development
          const allowed = /^chrome-extension:\/\//.test(origin ?? "") || !origin;
          callback(null, allowed);
        }
      : true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-Api-Key"],
  })
);

// Rate limiting: 20 requests per minute per IP.
// Backed by Redis when REDIS_URL is configured, so the limit is enforced
// consistently across instances instead of resetting per-process — without
// this, each instance counted independently and the effective limit
// multiplied by the number of instances running.
const redisClient = getRedisClient();
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000"),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "20"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please wait before submitting another claim.",
    retryAfter: 60,
  },
  store: redisClient
    ? new RedisStore({
        sendCommand: ((...args: string[]) =>
          redisClient.call(args[0], ...args.slice(1))) as SendCommandFn,
      })
    : undefined, // undefined = express-rate-limit's default in-memory store
});

app.use("/api/", limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Public — this is how a client obtains a token in the first place, so it
// intentionally sits before apiKeyAuth rather than behind it.
app.use("/api/v1/auth", authRouter);

// Protected — accepts the legacy static API_KEY or any valid per-install
// token issued via /api/v1/auth/register (see apiKeyAuth.ts).
app.use("/api/v1/claims", apiKeyAuth, claimsRouter);

// Root health check
app.get("/", (_req, res) => {
  res.json({ name: "Verdict API", version: "1.0.0", status: "running" });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Global error handler — preserves HTTP status from known Express errors (e.g. 413, 400)
app.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Body-parser throws with status 413 and type 'entity.too.large'
  if (err.status === 413 || err.type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large. Maximum allowed size is 50 KB." });
    return;
  }
  // Body-parser syntax errors (malformed JSON)
  if (err.status === 400 && err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON in request body." });
    return;
  }
  console.error("❌ Unhandled error:", err.message);
  res.status(err.status ?? 500).json({
    error: "An internal server error occurred.",
    ...(process.env.NODE_ENV !== "production" && { detail: err.message }),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Verdict API running at http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   Groq key:   ${process.env.GROQ_API_KEY ? "✓ loaded" : "✗ MISSING"}`);
  console.log(`   Tavily key: ${process.env.TAVILY_API_KEY ? "✓ loaded (RAG grounding enabled)" : "✗ MISSING (falling back to unaided model knowledge)"}`);
  console.log(`   Redis:      ${process.env.REDIS_URL ? "✓ configured (cache/tokens/rate-limit shared across instances)" : "✗ not configured (falling back to in-memory, per-instance)"}`);
});

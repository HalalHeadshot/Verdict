/**
 * Reusable auth middleware — accepts EITHER the legacy static API_KEY
 * (kept for backward compatibility / direct testing via curl) OR any
 * currently-valid per-install token issued by token.service.ts.
 *
 * Extracted out of index.ts so it can be applied selectively per-route
 * (e.g. NOT applied to /api/v1/auth/register, which is how a client gets
 * a token in the first place — it can't require one to call it).
 */
import type { Request, Response, NextFunction } from "express";
import { tokenService } from "../services/token.service.js";

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.header("X-Api-Key");
  const staticKey = process.env.API_KEY;

  if (!staticKey) {
    console.warn("⚠️ API_KEY is not set in environment variables.");
  }

  if (!apiKey) {
    res.status(401).json({ error: "Unauthorized. Invalid or missing X-Api-Key." });
    return;
  }

  const isStaticKey = !!staticKey && apiKey === staticKey;
  const isRegisteredToken = isStaticKey ? false : await tokenService.isValid(apiKey);

  if (!isStaticKey && !isRegisteredToken) {
    res.status(401).json({ error: "Unauthorized. Invalid or missing X-Api-Key." });
    return;
  }

  next();
}

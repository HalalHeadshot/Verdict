import { Router, Request, Response } from "express";
import { tokenService } from "../services/token.service.js";

const router = Router();

/**
 * POST /api/v1/auth/register
 *
 * Issues a unique, per-install API token. Deliberately NOT behind
 * apiKeyAuth — this endpoint is how a client obtains a credential in the
 * first place, so it can't require one. Still covered by the global
 * rate limiter (mounted on /api/) to prevent token-minting abuse.
 */
router.post("/register", async (_req: Request, res: Response) => {
  const token = await tokenService.issue();
  res.json({ token });
});

export default router;

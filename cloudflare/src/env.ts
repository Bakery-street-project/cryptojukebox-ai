/**
 * Environment bindings for cryptojukebox-edge.
 * Hand-written (no `wrangler types` yet — that runs at first deploy).
 * Non-string wrangler `vars` arrive JSON-encoded; parse defensively.
 */
import type { Network } from "x402/types";
import type { ProtectedRouteConfig } from "./auth";

export interface Env {
  /** HMAC secret for the paid-access cookie — `wrangler secret put JWT_SECRET`. */
  JWT_SECRET: string;
  /** Public receive address for settled payments. Never a key. */
  PAY_TO: string;
  /** x402 network id, e.g. "base-sepolia". */
  NETWORK: Network;
  PROTECTED_PATTERNS?: string;
  FACILITATOR_URL?: string;
  /** Bun origin URL; empty until configured — then the Worker only serves its own routes. */
  ORIGIN_URL?: string;
  /** Alternative to ORIGIN_URL when the origin becomes a Worker in this account. */
  ORIGIN_SERVICE?: Fetcher;
  JUKEBOX_DREAMS: D1Database;
  AUDIO: R2Bucket;
}

export function protectedPatterns(env: Env): ProtectedRouteConfig[] {
  const raw = env.PROTECTED_PATTERNS;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProtectedRouteConfig[];
  } catch {
    return [];
  }
}

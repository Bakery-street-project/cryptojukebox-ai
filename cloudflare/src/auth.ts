/**
 * Cookie-or-payment route middleware, adapted from Cloudflare's
 * x402-proxy-template (MIT License, Copyright (c) 2018 Cloudflare, Inc.).
 * Bot Management filtering (Enterprise-only) is intentionally not ported.
 */
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { paymentMiddleware } from "x402-hono";
import { verifyToken } from "./jwt";
import type { AppContext } from "./bindings";
import type { Network } from "x402/types";

export interface ProtectedRouteConfig {
  /** Route pattern to protect (exact or /* wildcard). */
  pattern: string;
  /** Price in USD, e.g. "$0.05". */
  price: string;
  /** Shown in the x402 payment requirements. */
  description: string;
}

type Ctx = Context<AppContext>;

/**
 * If a valid paid-access cookie exists, pass through; otherwise run the
 * x402 payment middleware (402 challenge → facilitator verify/settle).
 */
export function createProtectedRoute(config: ProtectedRouteConfig) {
  return async (c: Ctx, next: Next): Promise<Response | void> => {
    const token = getCookie(c, "auth_token");
    if (token && c.env.JWT_SECRET) {
      const payload = await verifyToken(token, c.env.JWT_SECRET);
      if (payload) {
        c.set("auth", payload);
        await next();
        return;
      }
    }
    if (!c.env.JWT_SECRET) {
      return c.json({ error: "Server misconfigured: JWT_SECRET not set." }, 500);
    }

    const routePath = c.req.path.length > 1 ? c.req.path.replace(/\/+$/, "") : c.req.path;
    const facilitator = c.env.FACILITATOR_URL
      ? { url: c.env.FACILITATOR_URL as `${string}://${string}` }
      : undefined;
    const paymentMw = paymentMiddleware(
      c.env.PAY_TO as `0x${string}`,
      {
        [routePath]: {
          price: config.price,
          network: c.env.NETWORK as Network,
          config: { description: config.description },
        },
      },
      facilitator,
    );
    return paymentMw(c as Context, next);
  };
}

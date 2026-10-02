/**
 * cryptojukebox-edge — x402 payment-gated reverse proxy in front of the Bun
 * origin, plus two routes the upstream template does not have:
 *   GET /dream/<seed>  → stored dream permalinks from D1
 *   GET /audio/<id>    → R2 object (falls through to origin while R2 is empty)
 * Paid decodes are recorded into D1 as they pass through, so the origin stays
 * stateless. Adapted from Cloudflare's x402-proxy-template (MIT License,
 * Copyright (c) 2018 Cloudflare, Inc.); bot-management is Enterprise-only and
 * was not ported.
 */
import { Hono } from "hono";
import { createProtectedRoute, type ProtectedRouteConfig } from "./auth";
import { generateToken } from "./jwt";
import { protectedPatterns, type Env } from "./env";
import type { AppContext } from "./bindings";

const app = new Hono<AppContext>();

const SEED_RE = /^[0-9a-f]{8,32}$/;
const AUDIO_ID_RE = /^[a-z0-9-]{1,64}$/i;

function pathMatchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === pattern;
}

/**
 * Reject paths whose resource identity changes when parsed as a URL, so the
 * authorization check and the origin resolve the same path (template guard).
 */
function hasNonCanonicalPath(url: string): boolean {
  const authorityStart = url.indexOf("://");
  const pathStart = url.indexOf("/", authorityStart + 3);
  if (pathStart === -1) return false;
  const queryStart = url.indexOf("?", pathStart);
  const rawPath = url.slice(pathStart, queryStart === -1 ? undefined : queryStart);
  try {
    return rawPath !== new URL(url).pathname || rawPath.includes("//");
  } catch {
    return true;
  }
}

async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
  if (env.ORIGIN_SERVICE) return env.ORIGIN_SERVICE.fetch(request);
  if (env.ORIGIN_URL) {
    const target = new URL(env.ORIGIN_URL);
    const proxied = new URL(request.url);
    proxied.protocol = target.protocol;
    proxied.hostname = target.hostname;
    proxied.port = target.port;
    return fetch(proxied, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    });
  }
  return new Response("edge not configured: ORIGIN_URL is empty", { status: 502 });
}

/** Record a paid decode's artifacts into D1 keyed by its dream seed. */
async function recordDream(env: Env, body: unknown): Promise<void> {
  const b = body as {
    title?: unknown;
    artifacts?: { engine?: unknown; dreamMeta?: { dreamSeed?: unknown; phosphene?: unknown } };
  } | null;
  const seed = b?.artifacts?.dreamMeta?.dreamSeed;
  if (typeof seed !== "string" || !SEED_RE.test(seed)) return;
  await env.JUKEBOX_DREAMS.prepare(
    "INSERT INTO dreams (seed, title, artifacts, created_at) VALUES (?1, ?2, ?3, ?4) " +
      "ON CONFLICT(seed) DO UPDATE SET title = excluded.title, artifacts = excluded.artifacts",
  )
    .bind(seed, typeof b?.title === "string" ? b.title : null, JSON.stringify(b?.artifacts ?? {}), Date.now())
    .run();
}

app.use("*", async (c, next) => {
  const path = c.req.path;

  // Edge-native reads (share links and audio) are free by design — they serve
  // already-generated material; only new decodes cost money.
  if (c.req.method === "GET" && /^\/dream\/[^/]+$/.test(path)) return next();
  if (c.req.method === "GET" && /^\/audio\/[^/]+$/.test(path)) return next();
  if (c.req.method === "GET" && path === "/__edge/health") return next();

  if (hasNonCanonicalPath(c.req.url)) return c.json({ error: "Non-canonical request path" }, 400);

  const config = protectedPatterns(c.env).find((p: ProtectedRouteConfig) => pathMatchesPattern(path, p.pattern));
  if (!config) return proxyToOrigin(c.req.raw, c.env);

  let jwtToken = "";
  const result = await createProtectedRoute(config)(c, async () => {
    if (!c.get("auth")) jwtToken = await generateToken(c.env.JWT_SECRET, 3600);
  });
  if (result) return result;
  if (c.res && c.res.status >= 400) return c.res;

  const originResponse = await proxyToOrigin(c.req.raw, c.env);

  if (originResponse.status === 200 && path === "/api/decode" && c.req.method === "POST") {
    const cloned = originResponse.clone();
    c.executionCtx.waitUntil(
      cloned
        .json()
        .then((body) => recordDream(c.env, body))
        .catch(() => undefined),
    );
  }

  if (jwtToken) {
    const headers = new Headers(originResponse.headers);
    headers.append("Set-Cookie", `auth_token=${jwtToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Path=/`);
    return new Response(originResponse.body, { status: originResponse.status, statusText: originResponse.statusText, headers });
  }
  return originResponse;
});

/** Permalink: seed → artifacts JSON, exactly as the paid decode returned it. */
app.get("/dream/:seed", async (c) => {
  const seed = c.req.param("seed");
  if (!SEED_RE.test(seed)) return c.json({ error: "bad seed" }, 400);
  const row = await c.env.JUKEBOX_DREAMS.prepare("SELECT title, artifacts, created_at FROM dreams WHERE seed = ?1")
    .bind(seed)
    .first<{ title: string | null; artifacts: string; created_at: number }>();
  if (!row) return c.json({ error: "no dream stored for this seed" }, 404);
  return new Response(row.artifacts, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" },
  });
});

/** Audio from R2; while the bucket is empty (retention not yet migrated), origin. */
app.get("/audio/:id", async (c) => {
  const id = c.req.param("id");
  if (!AUDIO_ID_RE.test(id)) return c.json({ error: "bad id" }, 400);
  let object = await c.env.AUDIO.get(id);
  if (!object) {
    const listed = await c.env.AUDIO.list({ prefix: `${id}.`, limit: 1 });
    const keyed = listed.objects[0];
    if (keyed) object = await c.env.AUDIO.get(keyed.key);
  }
  if (!object) return proxyToOrigin(c.req.raw, c.env);
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "audio/wav",
      "etag": object.etag,
      "cache-control": "public, max-age=86400",
    },
  });
});

app.get("/__edge/health", (c) =>
  c.json({
    status: "ok",
    edge: "cryptojukebox-edge",
    hasOrigin: Boolean(c.env.ORIGIN_URL || c.env.ORIGIN_SERVICE),
    patterns: protectedPatterns(c.env).map((p: ProtectedRouteConfig) => p.pattern),
    timestamp: Date.now(),
  }),
);

export default app;

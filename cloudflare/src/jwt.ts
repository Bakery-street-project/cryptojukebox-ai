/**
 * Stateless paid-access token (HMAC-SHA256, JWT-shaped), adapted from
 * Cloudflare's x402-proxy-template (MIT License, Copyright (c) 2018 Cloudflare, Inc.),
 * inside the cloudflare/templates repository.
 */

export interface TokenPayload {
  paid: boolean;
  iat: number;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + "==".slice(0, (4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function generateToken(secret: string, expiresInSeconds = 3600): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ paid: true, iat: now, exp: now + expiresInSeconds } satisfies TokenPayload)),
  );
  const data = `${header}.${payload}`;
  const signature = base64UrlEncode(
    new Uint8Array(await crypto.subtle.sign("HMAC", await importKey(secret), new TextEncoder().encode(data))),
  );
  return `${data}.${signature}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importKey(secret),
      base64UrlDecode(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as TokenPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

import { analyze } from "./features.ts";
import { classifyUrl, IngestError, ingestSpotify, ingestUpload, ingestYoutube } from "./ingest.ts";
import { generate } from "./generate.ts";
import { runLif } from "./snn.ts";
import { readPaymentsConfig } from "./payments/config.ts";
import { buildPaymentGate } from "./payments/server.ts";
import type { PaymentGate } from "./payments/types.ts";
import type { DecodeResponse } from "./types.ts";

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_DIR = new URL("../public/", import.meta.url).pathname;

let gatePromise: Promise<PaymentGate | null> | null = null;
async function getPaymentGate(): Promise<PaymentGate | null> {
  gatePromise ??= (async () => {
    const cfg = readPaymentsConfig(process.env);
    return cfg ? buildPaymentGate(cfg) : null;
  })();
  return gatePromise;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
};

async function handleDecode(req: Request): Promise<Response> {
  const ct = req.headers.get("content-type") ?? "";
  let source;
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) throw new IngestError("no audio file in request");
    if (file.size > 80 * 1024 * 1024) throw new IngestError("file exceeds 80MB limit");
    source = await ingestUpload(file.name, new Uint8Array(await file.arrayBuffer()));
  } else {
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!/^https?:\/\//.test(url)) throw new IngestError("provide a valid http(s) URL");
    const kind = classifyUrl(url);
    if (kind === "youtube") source = await ingestYoutube(url);
    else if (kind === "spotify") source = await ingestSpotify(url);
    else throw new IngestError("supported sources: YouTube, Spotify (preview with API credentials), or uploaded audio files");
  }

  const profile = analyze(source.samples, source.sampleRate, source.title);
  const spike = runLif(profile);
  const artifacts = await generate(profile, spike);

  const response: DecodeResponse = {
    id: source.id,
    title: source.title,
    sourceKind: source.kind,
    profile: { ...profile, frames: downsampleFrames(profile) },
    spike,
    artifacts,
  };
  return Response.json(response);
}

function downsampleFrames(profile: DecodeResponse["profile"]): DecodeResponse["profile"]["frames"] {
  const target = 1500;
  const stride = Math.max(1, Math.ceil(profile.frames.length / target));
  const out = [];
  for (let i = 0; i < profile.frames.length; i += stride) {
    const f = profile.frames[i]!;
    out.push({ t: Number(f.t.toFixed(2)), rms: f.rms, centroid: f.centroid, flux: f.flux, zcr: f.zcr });
  }
  return out;
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname === "/api/decode") {
    try {
      const gate = await getPaymentGate();
      if (gate) {
        const verdict = await gate.verifyAndSettle(req);
        if (!verdict.release) {
          return Response.json(verdict.body, { status: verdict.status, headers: verdict.headers });
        }
        const paid = await handleDecode(req);
        for (const [name, value] of Object.entries(verdict.settleHeaders)) paid.headers.set(name, value);
        return paid;
      }
      return await handleDecode(req);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status = e instanceof IngestError ? 400 : 500;
      return Response.json({ error: message }, { status });
    }
  }
  const audioMatch = url.pathname.match(/^\/audio\/([a-z0-9-]+)$/i);
  if (audioMatch) {
    const id = audioMatch[1]!;
    const { Glob } = await import("bun");
    const { CACHE_DIR } = await import("./ingest.ts");
    const file = [...new Glob(`${id}.*`).scanSync(CACHE_DIR)][0];
    if (!file) return new Response("not found", { status: 404 });
    const ext = file.slice(file.lastIndexOf("."));
    return new Response(Bun.file(CACHE_DIR + file), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream", "accept-ranges": "bytes" },
    });
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(Bun.file(`${PUBLIC_DIR}index.html`), { headers: { "content-type": MIME[".html"]! } });
  }
  const safe = url.pathname.replace(/[^A-Za-z0-9._/-]/g, "").replace(/^\/+|\.\./g, "");
  const asset = Bun.file(PUBLIC_DIR + safe);
  if (await asset.exists()) {
    const ext = safe.slice(safe.lastIndexOf("."));
    return new Response(asset, { headers: { "content-type": MIME[ext] ?? "text/plain; charset=utf-8" } });
  }
  return new Response("not found", { status: 404 });
}

if (import.meta.main) {
  const server = Bun.serve({ port: PORT, fetch: route });
  console.log(`cryptojukebox dreaming on http://localhost:${server.port}`);
}

export { route };

import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { Glob } from "bun";
import { fnv1a } from "./dsp.ts";

export const CACHE_DIR = new URL("../.cache/", import.meta.url).pathname;
const TARGET_RATE = 22050;

export class IngestError extends Error {}

export interface AudioSource {
  id: string;
  path: string;
  title: string;
  kind: "upload" | "youtube" | "spotify-preview";
  samples: Float32Array;
  sampleRate: number;
}

async function run(cmd: string[], label: string): Promise<Uint8Array> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  if (code !== 0) throw new IngestError(`${label} failed (exit ${code}): ${err.slice(-500)}`);
  return new Uint8Array(out);
}

export async function decodeToMono(path: string): Promise<Float32Array> {
  const raw = await run(
    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", String(TARGET_RATE), "pipe:1"],
    "ffmpeg decode",
  );
  const copy = raw.slice();
  if (copy.byteLength % 4 !== 0) throw new IngestError("truncated PCM stream");
  const samples = new Float32Array(copy.buffer);
  if (samples.length < TARGET_RATE / 2) throw new IngestError("audio too short to decode");
  return samples;
}

async function probeTitle(path: string): Promise<string> {
  try {
    const out = await run(
      ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
      "ffprobe",
    );
    const parsed = JSON.parse(new TextDecoder().decode(out)) as { format?: { tags?: { title?: string } } };
    return parsed.format?.tags?.title ?? "";
  } catch {
    return "";
  }
}

async function ensureCacheDir(): Promise<void> {
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
}

function newId(): string {
  return (crypto.randomUUID().match(/^[a-f0-9-]{8}/)?.[0] ?? "track") + "-" + fnv1a(String(Date.now())).toString(36);
}

export async function ingestUpload(name: string, bytes: Uint8Array): Promise<AudioSource> {
  await ensureCacheDir();
  const id = newId();
  const ext = (name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? ".audio").toLowerCase();
  const path = `${CACHE_DIR}${id}${ext}`;
  await Bun.write(path, bytes);
  const samples = await decodeToMono(path).catch(async (e) => {
    await rm(path, { force: true });
    throw e instanceof Error ? e : new IngestError(String(e));
  });
  return { id, path, title: name.replace(/\.[A-Za-z0-9]{1,5}$/, ""), kind: "upload", samples, sampleRate: TARGET_RATE };
}

export async function ingestYoutube(url: string): Promise<AudioSource> {
  await ensureCacheDir();
  const id = newId();
  const titleOut = await run(["yt-dlp", "--no-playlist", "--print", "title", url], "yt-dlp title");
  const title = new TextDecoder().decode(titleOut).trim().split("\n").pop() ?? url;
  await run(
    ["yt-dlp", "--no-playlist", "-f", "bestaudio/best", "-o", `${CACHE_DIR}${id}.%(ext)s`, url],
    "yt-dlp download",
  );
  const files = [...new Glob(`${id}.*`).scanSync(CACHE_DIR)];
  if (files.length === 0) throw new IngestError("yt-dlp produced no media file");
  const path = CACHE_DIR + files[0]!;
  const samples = await decodeToMono(path);
  return { id, path, title, kind: "youtube", samples, sampleRate: TARGET_RATE };
}

const SPOTIFY_TRACK = /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)|spotify:track:([A-Za-z0-9]+)/;

export async function ingestSpotify(url: string): Promise<AudioSource> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new IngestError(
      "Spotify streams are DRM-protected. Set SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET to use the 30s preview endpoint, or upload the audio file.",
    );
  }
  const m = url.match(SPOTIFY_TRACK);
  const trackId = m?.[1] ?? m?.[2];
  if (!trackId) throw new IngestError("not a Spotify track URL");

  const auth = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!auth.ok) throw new IngestError(`Spotify token request failed: ${auth.status}`);
  const { access_token } = (await auth.json()) as { access_token: string };

  const meta = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meta.ok) throw new IngestError(`Spotify metadata failed: ${meta.status}`);
  const track = (await meta.json()) as { name: string; artists: { name: string }[]; preview_url: string | null };
  if (!track.preview_url) {
    throw new IngestError("this track has no playable preview; upload the audio file instead.");
  }

  await ensureCacheDir();
  const id = newId();
  const path = `${CACHE_DIR}${id}.mp3`;
  const audio = await fetch(track.preview_url);
  if (!audio.ok) throw new IngestError("preview download failed");
  await Bun.write(path, new Uint8Array(await audio.arrayBuffer()));
  const samples = await decodeToMono(path);
  const artists = track.artists.map((a) => a.name).join(", ");
  return { id, path, title: `${track.name}${artists ? ` — ${artists}` : ""} (preview)`, kind: "spotify-preview", samples, sampleRate: TARGET_RATE };
}

export type SourceKind = "youtube" | "spotify" | "other";

export function classifyUrl(url: string): SourceKind {
  if (/youtube\.com|youtu\.be\//i.test(url)) return "youtube";
  if (/open\.spotify\.com|spotify:track/i.test(url)) return "spotify";
  return "other";
}

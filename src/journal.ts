import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { isDreamSeed } from "./dream/seed.ts";

/**
 * Dream journal — the origin's local persistence of decoded dreams, keyed by
 * dream seed. The table is deliberately identical to cloudflare/schema.sql so
 * the edge D1 recorder supersedes this store on deploy without a migration.
 */

export interface DreamSummary {
  seed: string;
  title: string;
  created_at: number;
}

export interface StoredDream extends DreamSummary {
  payload: unknown;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dreams (
  seed TEXT PRIMARY KEY,
  title TEXT,
  artifacts TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

let cached: { path: string; db: Database } | null = null;

function resolvePath(): string {
  const dir = process.env.JUKEBOX_DATA_DIR ?? new URL("../.data/", import.meta.url).pathname;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return `${dir}dreams.db`;
}

export function journal(): Database {
  const path = resolvePath();
  if (!cached || cached.path !== path) {
    cached = { path, db: new Database(path) };
    cached.db.exec("PRAGMA journal_mode = WAL;");
    cached.db.exec(SCHEMA);
  }
  return cached.db;
}

/** First seed wins: replaying an old dream must not overwrite the journal entry. */
export function recordDream(seed: string, title: string, payload: unknown): boolean {
  if (!isDreamSeed(seed)) return false;
  const artifacts = JSON.stringify(payload);
  const res = journal()
    .query("INSERT OR IGNORE INTO dreams (seed, title, artifacts, created_at) VALUES (?1, ?2, ?3, ?4)")
    .run(seed, title, artifacts, Date.now());
  return res.changes === 1;
}

export function getDream(seed: string): StoredDream | null {
  if (!isDreamSeed(seed)) return null;
  const row = journal()
    .query("SELECT seed, title, artifacts, created_at FROM dreams WHERE seed = ?1")
    .get(seed) as { seed: string; title: string | null; artifacts: string; created_at: number } | null;
  if (!row) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(row.artifacts);
  } catch {
    return null;
  }
  return { seed: row.seed, title: row.title ?? "", created_at: row.created_at, payload };
}

export function listDreams(limit = 50, offset = 0): DreamSummary[] {
  const cap = Math.max(1, Math.min(500, Math.floor(limit) || 50));
  const skip = Math.max(0, Math.floor(offset) || 0);
  return journal()
    .query("SELECT seed, title, created_at FROM dreams ORDER BY created_at DESC, seed DESC LIMIT ?1 OFFSET ?2")
    .all(cap, skip) as DreamSummary[];
}

/**
 * Whole stored payloads, newest-first, as NDJSON-ready lines (each is the
 * JSON.stringify output written by recordDream — no embedded raw newlines).
 * Backup path by design: the full journal, unpaged — the export is meant to
 * restore everything, not a window of it.
 */
export function dreamPayloadLines(): string[] {
  const rows = journal()
    .query("SELECT artifacts FROM dreams ORDER BY created_at DESC, seed DESC")
    .all() as { artifacts: string }[];
  return rows.map((r) => r.artifacts);
}

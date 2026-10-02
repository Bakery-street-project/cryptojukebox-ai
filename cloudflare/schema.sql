-- cryptojukebox-dreams: seed → dream, recorded by the edge as paid decodes
-- pass through it (src/index.ts), so the Bun origin stays fully stateless.
-- Apply with: wrangler d1 execute cryptojukebox-dreams --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS dreams (
  seed TEXT PRIMARY KEY,
  title TEXT,
  artifacts TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

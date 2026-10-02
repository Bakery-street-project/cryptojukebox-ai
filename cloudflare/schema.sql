-- cryptojukebox-dreams: seed → dream, recorded by the edge as paid decodes
-- pass through it (src/index.ts). The origin keeps its own local journal
-- (src/journal.ts, .data/dreams.db); D1 is the durable cloud copy that
-- supersedes it once the edge is live.
-- Apply with: wrangler d1 execute cryptojukebox-dreams --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS dreams (
  seed TEXT PRIMARY KEY,
  title TEXT,
  artifacts TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

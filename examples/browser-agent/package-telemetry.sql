-- Separate from browser chat usage and rate limits. Apply before publishing clients.
CREATE TABLE IF NOT EXISTS npm_usage (
  day TEXT NOT NULL,
  install_hash TEXT NOT NULL,
  product TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  event TEXT NOT NULL,
  tool TEXT NOT NULL,
  outcome TEXT NOT NULL,
  latency TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, install_hash, product, version, platform, event, tool, outcome, latency)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS npm_usage_day ON npm_usage(day);
CREATE TABLE IF NOT EXISTS npm_usage_batches (id TEXT PRIMARY KEY, day TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS npm_usage_batches_day ON npm_usage_batches(day);
CREATE TABLE IF NOT EXISTS npm_usage_rate_limits (
  day TEXT NOT NULL,
  install_hash TEXT NOT NULL,
  requests INTEGER NOT NULL,
  PRIMARY KEY(day, install_hash)
) WITHOUT ROWID;

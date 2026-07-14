CREATE TABLE IF NOT EXISTS rate_limits (
  client_key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  request_count INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_neurons REAL NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  degraded_requests INTEGER NOT NULL DEFAULT 0
) STRICT;

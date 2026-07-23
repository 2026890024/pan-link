-- pan-link D1 限流与封禁表
-- 替代不可用的 caches.default (Cache API 在 Pages Functions 中不可用于合成 URL)
-- 在 Cloudflare D1 控制台执行

-- 限流计数器表
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- IP 封禁表
CREATE TABLE IF NOT EXISTS banlist (
  ip TEXT PRIMARY KEY,
  strikes INTEGER NOT NULL DEFAULT 0,
  last_strike INTEGER NOT NULL DEFAULT 0,
  ban_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_banlist_cleanup ON banlist(ban_until);

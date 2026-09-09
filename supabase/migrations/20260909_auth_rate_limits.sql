-- Створення таблиці для розподіленого захисту від брутфорсу (Serverless Rate Limiting)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  ip TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Індекс для швидкої перевірки та очищення блокувань
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked_until ON auth_rate_limits (blocked_until);

-- Увімкнення RLS (Row Level Security)
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Доступ має лише сервісний ключ (service_role), публічний анонімний доступ заборонено
CREATE POLICY "Service role full access to auth_rate_limits"
  ON auth_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Міграція: Кешування комерційних курсів валют (Monobank / PrivatBank)
-- Запобігає помилкам 429 Too Many Requests у Serverless середовищі
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exchange_rates_cache (
  currency text PRIMARY KEY,
  rate numeric NOT NULL,
  source text NOT NULL DEFAULT 'monobank',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rates_cache ENABLE ROW LEVEL SECURITY;

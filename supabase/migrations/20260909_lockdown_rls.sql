-- ============================================================
-- Захист бази даних: Повне блокування прямого анонімного доступу
-- (Strict Row Level Security Lockdown)
-- ============================================================
-- В Supabase роль 'service_role' за замовчуванням має атрибут BYPASSRLS,
-- тому бекенд (Next.js) зберігає повний доступ без додаткових політик.
-- Увімкнення RLS для таблиці автоматично повністю закриває доступ
-- для публічного анонімного ключа (anon / public) за принципом Default-Deny.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'transactions',
    'budget_cycles',
    'recurring_templates',
    'budget_alerts',
    'merchant_rules',
    'webauthn_credentials',
    'auth_rate_limits'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Перевіряємо наявність таблиці в схемі public перед маніпуляціями
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Вмикаємо RLS (блокує anon / public)
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      RAISE NOTICE '✅ RLS успішно активовано для таблиці: %', tbl;
    ELSE
      RAISE NOTICE '⚠️ Таблиця % відсутня в базі, пропущено.', tbl;
    END IF;
  END LOOP;
END $$;

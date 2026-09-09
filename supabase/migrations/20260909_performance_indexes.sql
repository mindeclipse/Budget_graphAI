-- ============================================================
-- Оптимізація продуктивності: Надійні складені та GIN-індекси
-- (Supabase / PostgreSQL Defensive Performance Migration)
-- ============================================================

DO $$
BEGIN
  -- 1. Перевіряємо та створюємо розширення pg_trgm (якщо доступно)
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '⚠️ Розширення pg_trgm не вдалося увімкнути, текстовий GIN-індекс буде пропущено.';
    END;
  END;

  -- Встановлюємо search_path для коректного пошуку операторів
  SET search_path = public, extensions;

  -- 2. Складений індекс для фільтрації бюджету та темпу (transactions)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_transactions_budget_filter 
      ON public.transactions (type, exclude_from_budget, created_at DESC);
    RAISE NOTICE '✅ Створено індекс idx_transactions_budget_filter';

    CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc 
      ON public.transactions (created_at DESC);
    RAISE NOTICE '✅ Створено індекс idx_transactions_created_at_desc';

    CREATE INDEX IF NOT EXISTS idx_transactions_source_created 
      ON public.transactions (source, created_at DESC);
    RAISE NOTICE '✅ Створено індекс idx_transactions_source_created';

    -- Перевірка колонки tags перед створенням GIN-індексу
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'tags'
    ) THEN
      BEGIN
        CREATE INDEX IF NOT EXISTS idx_transactions_tags 
          ON public.transactions USING gin (tags);
        RAISE NOTICE '✅ Створено GIN-індекс idx_transactions_tags';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ GIN-індекс для tags пропущено через несумісний тип даних.';
      END;
    END IF;

    -- Перевірка можливості створення триграмного індексу для merchant_raw
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
      BEGIN
        CREATE INDEX IF NOT EXISTS idx_transactions_merchant_trgm 
          ON public.transactions USING gin (merchant_raw gin_trgm_ops);
        RAISE NOTICE '✅ Створено Trigram GIN-індекс idx_transactions_merchant_trgm';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Trigram індекс пропущено.';
      END;
    END IF;
  END IF;

  -- 3. Індекс активного циклу (budget_cycles)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_cycles'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_budget_cycles_active 
      ON public.budget_cycles (is_active, start_date DESC);
    RAISE NOTICE '✅ Створено індекс idx_budget_cycles_active';
  END IF;

  -- 4. Індекс дедуплікації сповіщень та дайджестів (budget_alerts)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_alerts'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_lookup 
      ON public.budget_alerts (alert_type, alert_date);
    RAISE NOTICE '✅ Створено індекс idx_budget_alerts_lookup';
  END IF;

  -- 5. Індекс регулярних витрат для крону (recurring_templates)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recurring_templates'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_recurring_active_day 
      ON public.recurring_templates (is_active, day_of_month);
    RAISE NOTICE '✅ Створено індекс idx_recurring_active_day';
  END IF;

  -- 6. Індекс правил автокатегоризації (merchant_rules)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_rules'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_merchant_rules_pattern 
      ON public.merchant_rules (lower(pattern));
    RAISE NOTICE '✅ Створено індекс idx_merchant_rules_pattern';
  END IF;

  RAISE NOTICE '🎉 Оптимізація індексів бази даних успішно завершена!';
END $$;

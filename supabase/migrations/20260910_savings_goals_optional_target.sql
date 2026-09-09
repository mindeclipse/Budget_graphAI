-- ============================================================
-- Міграція: Дозвіл безцільових скарбничок (опціональний target_amount)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'savings_goals'
  ) THEN
    ALTER TABLE public.savings_goals ALTER COLUMN target_amount DROP NOT NULL;
    RAISE NOTICE '✅ target_amount у таблиці savings_goals тепер є опціональним (NULL дозволено)';
  END IF;
END $$;

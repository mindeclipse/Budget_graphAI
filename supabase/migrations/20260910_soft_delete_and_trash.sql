-- ============================================================
-- Міграція: Кошик та м'яке видалення транзакцій (Soft Delete)
-- 10-денне утримання видалених операцій перед очищенням
-- ============================================================

DO $$
BEGIN
  -- 1. Додавання колонки deleted_at до таблиці transactions, якщо вона ще не існує
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'deleted_at'
    ) THEN
      ALTER TABLE public.transactions ADD COLUMN deleted_at timestamptz DEFAULT NULL;
      RAISE NOTICE '✅ Додано колонку deleted_at до таблиці transactions';
    END IF;

    -- 2. Створення індексу для швидкої фільтрації активних транзакцій та перегляду кошика
    CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at 
      ON public.transactions (deleted_at, created_at DESC);
    RAISE NOTICE '✅ Створено індекс idx_transactions_deleted_at';

    -- 3. Частковий індекс для кошика (лише видалені елементи)
    CREATE INDEX IF NOT EXISTS idx_transactions_trash_items 
      ON public.transactions (deleted_at) 
      WHERE deleted_at IS NOT NULL;
    RAISE NOTICE '✅ Створено індекс idx_transactions_trash_items';
  END IF;
END $$;

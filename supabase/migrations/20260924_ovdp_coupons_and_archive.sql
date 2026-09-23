-- ============================================================
-- ОВДП: Купонні виплати, розрахунок прибутковості та архів
-- ============================================================

DO $$
BEGIN
  -- 1. Додавання колонки coupons (JSONB масив купонів)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'investments' AND column_name = 'coupons'
  ) THEN
    ALTER TABLE public.investments ADD COLUMN coupons jsonb DEFAULT '[]'::jsonb;
    RAISE NOTICE '✅ Додано колонку coupons до investments';
  END IF;

  -- 2. Додавання колонки quantity (кількість облігацій, шт)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'investments' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE public.investments ADD COLUMN quantity numeric;
    RAISE NOTICE '✅ Додано колонку quantity до investments';
  END IF;

  -- 3. Додавання колонки coupon_amount (номінальна сума купона на 1 папір)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'investments' AND column_name = 'coupon_amount'
  ) THEN
    ALTER TABLE public.investments ADD COLUMN coupon_amount numeric;
    RAISE NOTICE '✅ Додано колонку coupon_amount до investments';
  END IF;

  -- 4. Додавання колонки is_archived (чи перенесено в архів)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'investments' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE public.investments ADD COLUMN is_archived boolean DEFAULT false;
    RAISE NOTICE '✅ Додано колонку is_archived до investments';
  END IF;
END $$;

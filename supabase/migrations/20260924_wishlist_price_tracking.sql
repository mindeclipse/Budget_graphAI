-- ============================================================
-- Оновлення Листа очікування: Трекер цін, Цільова вартість
-- та зв'язок зі Скарбничками
-- ============================================================

DO $$
BEGIN
  -- 1. Додавання полів для трекінгу цін та історії
  ALTER TABLE public.wishlist_items 
    ADD COLUMN IF NOT EXISTS initial_price numeric,
    ADD COLUMN IF NOT EXISTS target_price numeric,
    ADD COLUMN IF NOT EXISTS price_history jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS savings_goal_id bigint REFERENCES public.savings_goals(id) ON DELETE SET NULL;

  -- 2. Ініціалізація initial_price для існуючих записів
  UPDATE public.wishlist_items 
  SET initial_price = estimated_price 
  WHERE initial_price IS NULL;

  RAISE NOTICE '✅ Таблиця wishlist_items оновлена новими полями для трекінгу цін';
END $$;

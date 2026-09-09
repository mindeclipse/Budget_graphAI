-- ============================================================
-- Оптимізація продуктивності: Складені індекси (Composite Indexes)
-- та розширення pg_trgm для швидкого пошуку в BudgetGraph AI
-- ============================================================

-- 1. Увімкнення розширення для триграмного нечіткого пошуку (якщо підтримується)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Індекс для розрахунку бюджету, темпу спалювання (Burn Rate) та аналітики
-- Використовується в 100% запитів розрахунків лімітів, циклів, алертерів та AI-дайджестів
CREATE INDEX IF NOT EXISTS idx_transactions_budget_filter 
  ON public.transactions (type, exclude_from_budget, created_at DESC);

-- 3. Індекс для хронологічного сортування історії транзакцій
CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc 
  ON public.transactions (created_at DESC);

-- 4. Складений індекс для швидкої дедуплікації джерел (Monobank webhook, recurring cron)
CREATE INDEX IF NOT EXISTS idx_transactions_source_created 
  ON public.transactions (source, created_at DESC);

-- 5. GIN-індекс для миттєвої фільтрації за масивом тегів (tags text[])
CREATE INDEX IF NOT EXISTS idx_transactions_tags 
  ON public.transactions USING gin (tags);

-- 6. Триграмний GIN-індекс для миттєвого текстового пошуку за назвою торговця
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_trgm 
  ON public.transactions USING gin (merchant_raw gin_trgm_ops);

-- 7. Індекс для пошуку активного розрахункового циклу
CREATE INDEX IF NOT EXISTS idx_budget_cycles_active 
  ON public.budget_cycles (is_active, start_date DESC);

-- 8. Індекс для швидкої дедуплікації сповіщень та дайджестів у Telegram
CREATE INDEX IF NOT EXISTS idx_budget_alerts_lookup 
  ON public.budget_alerts (alert_type, alert_date);

-- 9. Індекс для швидкої вибірки активних регулярних платежів за днем місяця для Cron
CREATE INDEX IF NOT EXISTS idx_recurring_active_day 
  ON public.recurring_templates (is_active, day_of_month);

-- 10. Індекс для пошуку автоправил категоризації за патерном
CREATE INDEX IF NOT EXISTS idx_merchant_rules_pattern 
  ON public.merchant_rules (lower(pattern));

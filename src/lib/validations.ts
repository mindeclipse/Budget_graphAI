import { z } from "zod";

export const transactionCreateSchema = z.object({
  amount: z
    .number()
    .positive("Сума повинна бути більшою за нуль")
    .max(10_000_000, "Сума перевищує допустимий ліміт"),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]).default("UAH"),
  merchant_raw: z
    .string()
    .trim()
    .min(1, "Назва не може бути порожньою")
    .max(255),
  category_name: z.string().trim().min(1).max(100).default("Інше"),
  source: z.enum(["manual", "monobank", "recurring", "csv"]).default("manual"),
  type: z.enum(["expense", "income", "investment"]).default("expense"),
  created_at: z.string().datetime().optional(),
  parent_transaction_id: z.number().int().positive().optional().nullable(),
  original_amount: z.number().positive().optional().nullable(),
  original_currency: z.string().optional().nullable(),
});

export const transactionUpdateSchema = z.object({
  id: z.coerce.number().int().positive("ID повинен бути додатним числом"),
  category_name: z.string().trim().min(1).max(100).optional(),
  merchant_raw: z.string().trim().min(1).max(255).optional(),
  clean_title: z.string().trim().min(1).max(255).optional(),
  tags: z
    .array(z.string().trim().min(1).max(50))
    .max(30, "Максимум 30 тегів")
    .optional(),
  save_as_rule: z.boolean().optional(),
});

export const recurringTemplateSchema = z.object({
  title: z.string().trim().min(1, "Назва обов'язкова").max(150),
  amount: z
    .number()
    .positive("Сума має бути додатною")
    .max(10_000_000, "Сума перевищує допустимий ліміт"),
  currency: z.enum(["UAH", "USD"]).default("UAH"),
  category_name: z.string().trim().min(1).max(100).default("Інше"),
  day_of_month: z.number().int().min(1).max(31, "День має бути від 1 до 31"),
  is_active: z.boolean().default(true),
});

export const recurringUpdateSchema = recurringTemplateSchema.partial().extend({
  id: z.coerce.number().int().positive("ID повинен бути додатним числом"),
});

export const savingsGoalSchema = z.object({
  name: z.string().trim().min(1, "Назва обов'язкова").max(150),
  target_amount: z
    .number()
    .positive("Цільова сума має бути більшою за нуль")
    .max(100_000_000),
  current_amount: z.number().min(0).default(0),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]).default("UAH"),
  target_date: z.string().nullable().optional(),
});

export const savingsGoalUpdateSchema = savingsGoalSchema.partial().extend({
  id: z.coerce.number().int().positive("ID повинен бути додатним числом"),
});

export const investmentAssetSchema = z.object({
  asset_name: z.string().trim().min(1, "Назва активу обов'язкова").max(150),
  asset_type: z.enum(["bonds", "stocks", "crypto", "deposit", "other"]),
  invested_amount: z.number().min(0, "Вкладена сума не може бути від'ємною"),
  current_value: z.number().min(0, "Поточна вартість не може бути від'ємною"),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]).default("UAH"),
  yield_percent: z.number().nullable().optional(),
  maturity_date: z.string().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const investmentAssetUpdateSchema = investmentAssetSchema
  .partial()
  .extend({
    id: z.coerce.number().int().positive("ID повинен бути додатним числом"),
  });

export const categoryBudgetSchema = z.object({
  category_name: z.string().trim().min(1, "Категорія обов'язкова").max(100),
  monthly_limit: z
    .number()
    .positive("Ліміт має бути більшим за нуль")
    .max(10_000_000),
});

export const transactionSplitSchema = z.object({
  parent_transaction_id: z
    .number()
    .int()
    .positive("ID батьківської транзакції обов'язковий"),
  items: z
    .array(
      z.object({
        amount: z.number().positive("Сума частини має бути більшою за нуль"),
        category_name: z
          .string()
          .trim()
          .min(1, "Категорія обов'язкова")
          .max(100),
        merchant_raw: z.string().trim().min(1).max(255).optional(),
      })
    )
    .min(2, "Для спліту необхідно щонайменше 2 частини"),
});

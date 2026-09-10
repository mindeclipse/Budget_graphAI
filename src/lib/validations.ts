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
  source: z
    .enum([
      "manual",
      "monobank",
      "recurring",
      "csv",
      "inzhur_statement",
      "bank_receipt_pdf",
    ])
    .default("manual"),
  type: z.enum(["expense", "income", "investment"]).default("expense"),
  created_at: z.string().datetime().optional(),
  parent_transaction_id: z.number().int().positive().optional().nullable(),
  original_amount: z.number().positive().optional().nullable(),
  original_currency: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
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
  metadata: z.record(z.string(), z.any()).optional().nullable(),
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
  target_amount: z.preprocess(
    (val) => (val === "" || val === undefined ? null : val),
    z
      .number()
      .positive("Цільова сума має бути більшою за нуль")
      .max(100_000_000)
      .nullable()
      .optional()
  ),
  current_amount: z.preprocess(
    (val) => (val === "" || val === undefined ? 0 : val),
    z.coerce.number().min(0, "Сума не може бути від'ємною").default(0)
  ),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]).default("UAH"),
  target_date: z.string().nullable().optional(),
});

export const savingsGoalUpdateSchema = savingsGoalSchema.partial().extend({
  id: z.coerce.number().int().positive("ID повинен бути додатним числом"),
});

export const investmentAssetSchema = z.object({
  asset_name: z.string().trim().min(1, "Назва активу обов'язкова").max(150),
  asset_type: z.enum(["bonds", "stocks", "crypto", "deposit", "reit", "other"]),
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

export const wishlistItemSchema = z.object({
  title: z.string().trim().min(1, "Назва бажання обов'язкова").max(200),
  estimated_price: z
    .number()
    .positive("Орієнтовна сума має бути більшою за нуль")
    .max(100_000_000),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]).default("UAH"),
  category_name: z.string().trim().min(1).max(100).default("Інше"),
  url: z
    .string()
    .trim()
    .max(2000, "Посилання занадто довге")
    .refine(
      (val) => {
        if (!val || val === "") return true;
        try {
          const parsed = new URL(val);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Посилання повинно починатися з http:// або https://" }
    )
    .nullable()
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(1000).nullable().optional(),
  cooling_days: z
    .number()
    .int()
    .min(1, "Період охолодження має бути щонайменше 1 день")
    .max(365)
    .default(14),
  cooling_end_date: z.string().optional(),
});

export const wishlistItemUpdateSchema = wishlistItemSchema.partial().extend({
  id: z.coerce.number().int().positive("ID повинен бути додатним числом"),
  status: z.enum(["cooling", "ready", "purchased", "saved"]).optional(),
  resolved_at: z.string().nullable().optional(),
});

export const wishlistResolveSchema = z.object({
  id: z.coerce.number().int().positive("ID обов'язковий"),
  action: z.enum(["saved", "purchased", "extend"]),
  extend_days: z.number().int().positive().optional(),
});

export const costPerUseSchema = z.object({
  item_name: z.string().trim().min(1, "Назва речі обов'язкова").max(200),
  category_name: z.string().trim().min(1).max(100).default("Інше"),
  purchase_price: z
    .number()
    .positive("Вартість покупки має бути більшою за нуль")
    .max(100_000_000),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]).default("UAH"),
  purchase_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата повинна бути у форматі РРРР-ММ-ДД")
    .optional(),
  total_uses: z.number().int().min(0).default(1),
  benchmark_cost_per_use: z.number().positive().nullable().optional(),
  target_cost_per_use: z.number().positive().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const costPerUseUpdateSchema = costPerUseSchema.partial().extend({
  id: z.coerce.number().int().positive("ID повинен бути додатним числом"),
  total_uses: z.number().int().min(0).optional(),
  last_used_at: z.string().nullable().optional(),
});

export const costPerUseActionSchema = z.object({
  id: z.coerce.number().int().positive("ID обов'язковий"),
  action: z.literal("log_use"),
  increment: z.number().int().positive().default(1),
});

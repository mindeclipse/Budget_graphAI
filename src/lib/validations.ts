import { z } from "zod";

export const transactionCreateSchema = z.object({
  amount: z
    .number()
    .positive("Сума повинна бути більшою за нуль")
    .max(10_000_000, "Сума перевищує допустимий ліміт"),
  currency: z.enum(["UAH", "USD", "EUR"]).default("UAH"),
  merchant_raw: z
    .string()
    .trim()
    .min(1, "Назва не може бути порожньою")
    .max(255),
  category_name: z.string().trim().min(1).max(100).default("Інше"),
  source: z.enum(["manual", "monobank", "recurring", "csv"]).default("manual"),
  type: z.enum(["expense", "income"]).default("expense"),
  created_at: z.string().datetime().optional(),
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

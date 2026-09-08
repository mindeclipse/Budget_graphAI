import { z } from "zod";

export const transactionCreateSchema = z.object({
  amount: z.number().positive("Сума повинна бути більшою за нуль"),
  currency: z.enum(["UAH", "USD", "EUR"]).default("UAH"),
  merchant_raw: z.string().min(1, "Назва не може бути порожньою").max(255),
  category_name: z.string().min(1).max(100).default("Інше"),
  source: z.enum(["manual", "monobank", "recurring", "csv"]).default("manual"),
  type: z.enum(["expense", "income"]).default("expense"),
  created_at: z.string().datetime().optional(),
});

export const transactionUpdateSchema = z.object({
  id: z.string().or(z.number()),
  category_name: z.string().min(1).max(100).optional(),
  merchant_raw: z.string().min(1).max(255).optional(),
  clean_title: z.string().min(1).max(255).optional(),
  tags: z.array(z.string()).optional(),
  save_as_rule: z.boolean().optional(),
});

export const recurringTemplateSchema = z.object({
  title: z.string().min(1, "Назва обов'язкова").max(150),
  amount: z.number().positive("Сума має бути додатною"),
  currency: z.enum(["UAH", "USD"]).default("UAH"),
  category_name: z.string().min(1).max(100).default("Інше"),
  day_of_month: z.number().int().min(1).max(31, "День має бути від 1 до 31"),
  is_active: z.boolean().default(true),
});

export const recurringUpdateSchema = recurringTemplateSchema.partial().extend({
  id: z.number().int().positive(),
});

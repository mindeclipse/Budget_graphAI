import { z } from "zod";

export type BankCurrency = "UAH" | "USD" | "EUR" | "PLN";
export type PrivatCurrency = BankCurrency;

export interface ParsedBankTransaction {
  external_id: string;
  amount: number;
  currency: BankCurrency;
  merchant_raw: string;
  category_name: string;
  source: "privatbank_statement" | "bank_statement";
  type: "expense" | "income" | "transfer";
  exclude_from_budget: false;
  created_at: string;
}
export type ParsedPrivatTransaction = ParsedBankTransaction;

export const bankTransactionSchema = z.object({
  external_id: z.string().min(1).max(255),
  amount: z.number().positive().max(10_000_000),
  currency: z.enum(["UAH", "USD", "EUR", "PLN"]),
  merchant_raw: z.string().min(1).max(255),
  category_name: z.string().min(1).max(100),
  source: z.enum(["privatbank_statement", "bank_statement"]),
  type: z.enum(["expense", "income", "transfer"]),
  exclude_from_budget: z.literal(false),
  created_at: z.string().datetime(),
});
export const privatTransactionSchema = bankTransactionSchema;

export interface BankParseResult {
  transactions: ParsedBankTransaction[];
  totalRows: number;
  skippedRows: number;
}
export type PrivatParseResult = BankParseResult;

import { z } from "zod";

export interface ParsedInzhurTransaction {
  external_id: string;
  amount: number;
  currency: "UAH";
  merchant_raw: string;
  category_name: string;
  source: "inzhur_statement";
  type: "investment";
  exclude_from_budget: boolean;
  tags: string[];
  created_at: string;
}

export const inzhurTransactionSchema = z.object({
  external_id: z.string().min(1).max(255),
  amount: z.number().positive().max(100_000_000),
  currency: z.literal("UAH"),
  merchant_raw: z.string().min(1).max(255),
  category_name: z.string().min(1).max(100),
  source: z.literal("inzhur_statement"),
  type: z.literal("investment"),
  exclude_from_budget: z.literal(false),
  tags: z.array(z.string().min(1).max(50)),
  created_at: z.string().datetime(),
});

export interface InzhurParseResult {
  transactions: ParsedInzhurTransaction[];
  totalRows: number;
  skippedRows: number;
}

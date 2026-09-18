export interface UpdateTransactionPayload {
  id: number;
  category_name?: string;
  merchant_raw?: string;
  clean_title?: string;
  tags?: string[];
  save_as_rule?: boolean;
  exclude_from_budget?: boolean;
  metadata?: Record<string, any> | null;
}

export interface CreateTransactionPayload {
  amount: number;
  currency?: "UAH" | "USD" | "EUR" | "PLN";
  merchant_raw: string;
  category_name?: string;
  source?:
    | "manual"
    | "monobank"
    | "recurring"
    | "csv"
    | "inzhur_statement"
    | "bank_receipt_pdf";
  type?: "expense" | "income" | "investment";
  created_at?: string;
  exclude_from_budget?: boolean;
  tags?: string[];
  metadata?: Record<string, any> | null;
}

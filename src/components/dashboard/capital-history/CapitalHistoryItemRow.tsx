import { Building2, PiggyBank, TrendingUp } from "lucide-react";
import { Transaction } from "@/types/finance";

interface CapitalHistoryItemRowProps {
  tx: Transaction;
  onSelect: (tx: Transaction) => void;
}

export function CapitalHistoryItemRow({
  tx,
  onSelect,
}: CapitalHistoryItemRowProps) {
  const isDeposit =
    tx.category_name?.toLowerCase().includes("заощадж") ||
    tx.merchant_raw?.toLowerCase().includes("скарбнич") ||
    tx.tags?.includes("дебет") ||
    tx.merchant_raw?.toLowerCase().includes("нарахування") ||
    tx.merchant_raw?.toLowerCase().includes("поповнення");

  const isCredit =
    tx.tags?.includes("кредит") ||
    tx.merchant_raw?.toLowerCase().includes("купівля") ||
    tx.merchant_raw?.toLowerCase().includes("сплата");

  const isReit =
    tx.tags?.includes("reit") ||
    tx.merchant_raw?.toLowerCase().includes("reit");

  const isBonds =
    tx.tags?.includes("овдп") ||
    tx.merchant_raw?.toLowerCase().includes("овдп");

  const isInzhur = tx.source === "inzhur_statement";

  const dateStr = new Date(tx.created_at).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      onClick={() => onSelect(tx)}
      className="group flex cursor-pointer items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 transition-all hover:border-zinc-700 hover:bg-zinc-900/80"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
            isReit
              ? "border-teal-500/20 bg-teal-500/10 text-teal-400"
              : isBonds
                ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
                : isDeposit
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-violet-500/20 bg-violet-500/10 text-violet-400"
          }`}
        >
          {isReit ? (
            <Building2 size={15} />
          ) : isDeposit ? (
            <PiggyBank size={15} />
          ) : (
            <TrendingUp size={15} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-semibold text-zinc-200 group-hover:text-white">
              {tx.merchant_raw}
            </p>
            {isInzhur && (
              <span className="shrink-0 rounded border border-emerald-500/20 bg-emerald-500/10 px-1 py-0.5 text-[8px] font-bold text-emerald-400">
                Inzhur
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span>{dateStr}</span>
            <span>•</span>
            <span
              className={
                isReit
                  ? "text-teal-400/90"
                  : isBonds
                    ? "text-indigo-400/90"
                    : isDeposit
                      ? "text-emerald-400/90"
                      : "text-violet-400/90"
              }
            >
              {tx.category_name || "Капітал"}
            </span>
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right whitespace-nowrap">
        <span
          className={`text-xs font-bold whitespace-nowrap tabular-nums ${
            isCredit ? "text-zinc-200" : "text-emerald-400"
          }`}
        >
          {isCredit ? "−" : "+"}
          {Number(tx.amount).toLocaleString("uk-UA")}&nbsp;
          {tx.currency === "USD" ? "$" : "₴"}
        </span>
      </div>
    </div>
  );
}

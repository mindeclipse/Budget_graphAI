import { SlidersHorizontal, Split, Paperclip } from "lucide-react";
import { Transaction } from "@/types/finance";

interface TransactionBadgesProps {
  transaction: Transaction;
  isEmergency: boolean;
  isAmortized: boolean;
  amortMonths: number;
  amortMonthly: number;
  hasSplitItems: boolean;
  onOpenTagProject?: (tag: string) => void;
}

export function TransactionBadges({
  transaction,
  isEmergency,
  isAmortized,
  amortMonths,
  amortMonthly,
  hasSplitItems,
  onOpenTagProject,
}: TransactionBadgesProps) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {/* Бейдж форс-мажору */}
      {isEmergency && (
        <span className="inline-flex items-center gap-0.5 rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-400">
          🛡️ Форс-мажор
        </span>
      )}

      {/* Бейдж амортизації */}
      {isAmortized && (
        <span
          className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400"
          title={`Списання розбито на ${amortMonths} міс. (по ~${Math.round(amortMonthly).toLocaleString()} ₴/міс)`}
        >
          <SlidersHorizontal size={9} />
          {amortMonths} міс.
        </span>
      )}

      {/* Бейдж спліту чека */}
      {hasSplitItems && (
        <span
          className="inline-flex items-center gap-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-400"
          title={`Чек розбито на ${transaction.metadata?.receipt_items.length} позицій`}
        >
          <Split size={9} />
          {transaction.metadata?.receipt_items.length} поз.
        </span>
      )}

      {/* Бейдж наявності чека/фото */}
      {Boolean(transaction.metadata?.receipt_url) && (
        <span
          className="inline-flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-medium text-zinc-300"
          title="Прикріплено фото або скан чека"
        >
          <Paperclip size={9} />
          Чек
        </span>
      )}

      {/* Теги транзакції */}
      {transaction.tags &&
        transaction.tags.length > 0 &&
        transaction.tags
          .filter((t) => t !== "форсмажор")
          .map((tag) => (
            <span
              key={tag}
              onClick={(e) => {
                if (onOpenTagProject) {
                  e.stopPropagation();
                  onOpenTagProject(tag);
                }
              }}
              className={`inline-flex items-center rounded border border-zinc-800 bg-zinc-800/50 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 transition-colors ${
                onOpenTagProject
                  ? "cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-400"
                  : ""
              }`}
            >
              #{tag}
            </span>
          ))}
    </div>
  );
}

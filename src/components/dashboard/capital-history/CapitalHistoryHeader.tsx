import { Landmark, FileSpreadsheet, Plus } from "lucide-react";

interface CapitalHistoryHeaderProps {
  transactionCount: number;
  totalCapitalMoved: number;
  onImportInzhur?: () => void;
  onAddCapital?: () => void;
}

export function CapitalHistoryHeader({
  transactionCount,
  totalCapitalMoved,
  onImportInzhur,
  onAddCapital,
}: CapitalHistoryHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <Landmark size={15} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
              Історія операцій капіталу
            </h2>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              {transactionCount}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Поповнення скарбничок, інвестиції Inzhur/ОВДП та рух капіталу
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-[10px] text-zinc-500">Загальний рух</p>
          <p className="text-xs font-bold text-emerald-400">
            {totalCapitalMoved.toLocaleString("uk-UA")} ₴
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {onImportInzhur && (
            <button
              onClick={onImportInzhur}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 hover:text-emerald-300 active:scale-95"
              title="Завантажити виписку або квитанцію (.xlsx, .pdf)"
            >
              <FileSpreadsheet size={13} />
              <span>Імпорт</span>
            </button>
          )}

          {onAddCapital && (
            <button
              onClick={onAddCapital}
              className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
            >
              <Plus size={13} /> Додати
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

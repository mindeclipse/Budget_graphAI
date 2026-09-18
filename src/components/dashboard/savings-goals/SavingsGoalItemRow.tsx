import {
  Calendar,
  Pencil,
  Trash2,
  Infinity as InfinityIcon,
} from "lucide-react";
import { SavingsGoal } from "@/types/finance";
import { convertToUah, CURRENCY_SYMBOLS } from "./types";

interface SavingsGoalItemRowProps {
  goal: SavingsGoal;
  rates: { USD: number; EUR: number; PLN: number };
  onDeposit: (goal: SavingsGoal) => void;
  onEdit: (goal: SavingsGoal) => void;
  onDelete: (id: number) => void;
}

export function SavingsGoalItemRow({
  goal,
  rates,
  onDeposit,
  onEdit,
  onDelete,
}: SavingsGoalItemRowProps) {
  const current = Number(goal.current_amount) || 0;
  const target = Number(goal.target_amount) || 0;
  const hasTarget = target > 0;
  const percent = hasTarget
    ? Math.min(100, Math.round((current / target) * 100))
    : 0;

  return (
    <div className="group rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3.5 transition-colors hover:border-zinc-700/80">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-white sm:text-sm">
            {goal.name}
          </h4>
          {goal.target_date && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
              <Calendar size={11} />
              Дедлайн: {new Date(goal.target_date).toLocaleDateString("uk-UA")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDeposit(goal)}
            className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
          >
            + Поповнити
          </button>
          <button
            type="button"
            onClick={() => onEdit(goal)}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Редагувати ціль"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(goal.id)}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-rose-400"
            title="Видалити ціль"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {hasTarget ? (
        <div className="mt-2.5">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-extrabold text-white tabular-nums">
              {current.toLocaleString()}{" "}
              <span className="text-[11px] font-semibold text-emerald-400">
                {CURRENCY_SYMBOLS[goal.currency] || goal.currency}
              </span>
            </span>
            <span className="text-[11px] font-medium text-zinc-500 tabular-nums">
              з {target.toLocaleString()}{" "}
              {CURRENCY_SYMBOLS[goal.currency] || goal.currency} ({percent}%)
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-900">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center justify-between border-t border-zinc-800/40 pt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-medium text-zinc-400">
              Накопичено:
            </span>
            <span className="text-sm font-extrabold text-white tabular-nums">
              {current.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-emerald-400">
                {CURRENCY_SYMBOLS[goal.currency] || goal.currency}
              </span>
            </span>
            {goal.currency !== "UAH" && (
              <span className="text-[11px] text-zinc-500 tabular-nums">
                (≈{" "}
                {Math.round(
                  convertToUah(current, goal.currency, rates)
                ).toLocaleString()}{" "}
                ₴)
              </span>
            )}
          </div>

          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            <InfinityIcon size={12} />
            <span>{goal.target_date ? "Без ліміту" : "Безстроково"}</span>
          </span>
        </div>
      )}
    </div>
  );
}

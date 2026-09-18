import { SavingsGoal } from "@/types/finance";
import { SavingsGoalItemRow } from "./SavingsGoalItemRow";

interface SavingsGoalsListProps {
  goals: SavingsGoal[];
  rates: { USD: number; EUR: number; PLN: number };
  onDeposit: (goal: SavingsGoal) => void;
  onEdit: (goal: SavingsGoal) => void;
  onDelete: (id: number) => void;
}

export function SavingsGoalsList({
  goals,
  rates,
  onDeposit,
  onEdit,
  onDelete,
}: SavingsGoalsListProps) {
  if (goals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
        У вас ще немає створених цілей заощаджень. Додайте подушку безпеки або
        скарбничку на велику покупку.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => (
        <SavingsGoalItemRow
          key={goal.id}
          goal={goal}
          rates={rates}
          onDeposit={onDeposit}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

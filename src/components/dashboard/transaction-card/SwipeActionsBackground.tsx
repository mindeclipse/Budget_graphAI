import { Trash2 } from "lucide-react";

interface SwipeActionsBackgroundProps {
  offsetX: number;
  hasCrossedThreshold: boolean;
}

export function SwipeActionsBackground({
  offsetX,
  hasCrossedThreshold,
}: SwipeActionsBackgroundProps) {
  return (
    <>
      {/* Лівий бекграунд (свайп вправо) */}
      <div
        className={`absolute inset-y-0 left-0 flex items-center justify-start rounded-2xl px-5 transition-colors ${
          hasCrossedThreshold && offsetX > 0
            ? "bg-rose-600 text-white"
            : "bg-rose-500/20 text-rose-400"
        }`}
        style={{ width: `${Math.max(0, offsetX)}px` }}
      >
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold transition-transform ${
            hasCrossedThreshold ? "scale-110" : "scale-100"
          }`}
        >
          <Trash2 size={18} />
          {offsetX > 60 && <span>Видалити</span>}
        </div>
      </div>

      {/* Правий бекграунд (свайп вліво) */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-end rounded-2xl px-5 transition-colors ${
          hasCrossedThreshold && offsetX < 0
            ? "bg-rose-600 text-white"
            : "bg-rose-500/20 text-rose-400"
        }`}
        style={{ width: `${Math.max(0, -offsetX)}px` }}
      >
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold transition-transform ${
            hasCrossedThreshold ? "scale-110" : "scale-100"
          }`}
        >
          {offsetX < -60 && <span>Видалити</span>}
          <Trash2 size={18} />
        </div>
      </div>
    </>
  );
}

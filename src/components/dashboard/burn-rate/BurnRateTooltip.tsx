"use client";

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: any;
  payload?: {
    dateLabel?: string;
    dropToday?: number;
    [key: string]: any;
  };
}

export interface BurnRateTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}

export function BurnRateTooltip({
  active,
  payload,
  label,
}: BurnRateTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const actualPoint = payload.find((p) => p.dataKey === "actual");
  const idealPoint = payload.find((p) => p.dataKey === "ideal");
  const drop = idealPoint?.payload?.dropToday || 0;
  const dateLabel =
    actualPoint?.payload?.dateLabel || idealPoint?.payload?.dateLabel;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 p-2.5 shadow-2xl backdrop-blur-md">
      <p className="mb-1.5 border-b border-zinc-800 pb-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
        {label}-й день {dateLabel ? `(${dateLabel})` : "періоду"}
      </p>
      <div className="space-y-1 font-mono text-xs tabular-nums">
        {actualPoint && actualPoint.value !== null && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-sans text-[11px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Факт:
            </span>
            <span className="font-semibold text-white">
              {Number(actualPoint.value).toLocaleString("uk-UA")} ₴
            </span>
          </div>
        )}
        {idealPoint && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-sans text-[11px] text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              План:
            </span>
            <span className="font-semibold text-zinc-300">
              {Number(idealPoint.value).toLocaleString("uk-UA")} ₴
            </span>
          </div>
        )}
        {drop > 0 && (
          <p className="mt-1 border-t border-zinc-800 pt-1 font-sans text-[10px] text-sky-400">
            ⚡ Фіксоване списання: +{drop.toLocaleString("uk-UA")} ₴
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { Store, BookmarkCheck, Check, Loader2 } from "lucide-react";

interface ActionSheetMerchantSectionProps {
  cleanTitleInput: string;
  onChangeTitle: (val: string) => void;
  isTitleModified: boolean;
  onSaveTitle: () => void;
  isSubmitting: boolean;
  saveAsRule: boolean;
  onToggleSaveAsRule: (val: boolean) => void;
}

export const ActionSheetMerchantSection: React.FC<
  ActionSheetMerchantSectionProps
> = ({
  cleanTitleInput,
  onChangeTitle,
  isTitleModified,
  onSaveTitle,
  isSubmitting,
  saveAsRule,
  onToggleSaveAsRule,
}) => {
  return (
    <>
      {/* Поле редагування назви закладу */}
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
          <Store size={12} className="text-zinc-500" /> Назва мерчанта
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={cleanTitleInput}
            onChange={(e) => onChangeTitle(e.target.value)}
            placeholder="Введіть зрозумілу назву..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
          />
          {isTitleModified && (
            <button
              type="button"
              onClick={onSaveTitle}
              disabled={isSubmitting}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-sky-500 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              Зберегти
            </button>
          )}
        </div>
      </div>

      {/* Чекбокс запам'ятовування правила */}
      <div>
        <label className="hover:border-zinc-750 flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3 transition-colors">
          <input
            type="checkbox"
            checked={saveAsRule}
            onChange={(e) => onToggleSaveAsRule(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-0 focus:ring-offset-0"
          />
          <div className="text-xs">
            <div className="flex items-center gap-1.5 font-medium text-zinc-200">
              <BookmarkCheck size={13} className="text-sky-400" />
              Запам'ятати для майбутніх покупок
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
              Усі наступні списання від цього продавця отримуватимуть цю назву
              та категорію.
            </p>
          </div>
        </label>
      </div>
    </>
  );
};

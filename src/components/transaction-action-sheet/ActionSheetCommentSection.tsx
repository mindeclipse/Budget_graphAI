"use client";

import { Tag as TagIcon, X } from "lucide-react";

interface ActionSheetCommentSectionProps {
  commentInput: string;
  currentTags: string[];
  onChangeComment: (text: string) => void;
  onRemoveTag: (tag: string) => void;
  onOpenTagProject?: (tag: string) => void;
}

export function ActionSheetCommentSection({
  commentInput,
  currentTags,
  onChangeComment,
  onRemoveTag,
  onOpenTagProject,
}: ActionSheetCommentSectionProps) {
  return (
    <div className="border-t border-zinc-800/80 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
          <TagIcon size={12} className="text-zinc-500" /> Коментар та теги
        </label>
        <span
          className={`text-[10px] ${
            commentInput.length > 450
              ? "font-semibold text-amber-400"
              : "text-zinc-500"
          }`}
        >
          {commentInput.length}/500
        </span>
      </div>

      <div className="relative">
        <textarea
          value={commentInput}
          maxLength={500}
          rows={2}
          onChange={(e) => onChangeComment(e.target.value)}
          placeholder="Додайте опис або коментар... Слова з # стають тегами (напр: подарунок мамі #деньнародження)"
          className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-base text-white placeholder-zinc-500 transition-colors focus:border-zinc-700 focus:outline-none sm:text-xs"
        />
      </div>

      {/* Відображення розпізнаних тегів */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {currentTags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300 transition-all"
          >
            <button
              type="button"
              onClick={() => onOpenTagProject?.(tag)}
              title={`Аналітика проєкту #${tag} за весь час`}
              className="transition-colors hover:text-sky-200"
            >
              #{tag}
            </button>
            <button
              type="button"
              onClick={() => onRemoveTag(tag)}
              className="text-sky-400/60 transition-colors hover:text-rose-400"
              title={`Вилучити #${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {currentTags.length === 0 && (
          <span className="text-[11px] text-zinc-500 italic">
            Тегів немає. Введіть слово з # у полі вище, щоб створити тег.
          </span>
        )}
      </div>
    </div>
  );
}

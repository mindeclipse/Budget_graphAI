"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Trash2,
  Tag as TagIcon,
  Store,
  BookmarkCheck,
  Check,
  Loader2,
  Split,
  FileText,
  FileCheck,
  ExternalLink,
  Paperclip,
  ShieldAlert,
  CalendarDays,
} from "lucide-react";
import { Transaction, TransactionReceiptMetadata } from "@/types/finance";
import { triggerHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
} from "@/constants/categories";
import {
  extractTagsAndComment,
  formatInitialCommentAndTags,
  removeTagFromText,
} from "@/lib/tag-utils";

interface TransactionActionSheetProps {
  transaction: Transaction | null;
  onClose: () => void;
  onUpdateCategory: (
    txId: number,
    newCategory: string,
    cleanTitle?: string,
    saveAsRule?: boolean
  ) => void | Promise<void>;
  onUpdateTags: (txId: number, newTags: string[]) => void | Promise<void>;
  onDelete: (txId: number) => void | Promise<void>;
  onOpenSplit?: (tx: Transaction) => void;
  onOpenTagProject?: (tag: string) => void;
  onReceiptUpdated?: () => void;
  onUpdateTransaction?: (payload: {
    id: number;
    category_name?: string;
    clean_title?: string;
    merchant_raw?: string;
    tags?: string[];
    save_as_rule?: boolean;
    exclude_from_budget?: boolean;
    metadata?: Record<string, any>;
  }) => void | Promise<void>;
}

export function TransactionActionSheet({
  transaction,
  onClose,
  onUpdateCategory,
  onUpdateTags,
  onDelete,
  onOpenSplit,
  onOpenTagProject,
  onReceiptUpdated,
  onUpdateTransaction,
}: TransactionActionSheetProps) {
  const [cleanTitleInput, setCleanTitleInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(true);
  const [commentInput, setCommentInput] = useState("");
  const [initialCommentFormatted, setInitialCommentFormatted] = useState("");
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Стан форс-мажору (подушка) та амортизації
  const [isEmergency, setIsEmergency] = useState(false);
  const [initialIsEmergency, setInitialIsEmergency] = useState(false);
  const [amortizationMonths, setAmortizationMonths] = useState(1);
  const [initialAmortizationMonths, setInitialAmortizationMonths] = useState(1);

  // Стан прикріпленої квитанції
  const [currentReceipt, setCurrentReceipt] =
    useState<TransactionReceiptMetadata | null>(null);
  const [isAttachingReceipt, setIsAttachingReceipt] = useState(false);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (transaction) {
      setCleanTitleInput(transaction.merchant_raw || "");
      setSelectedCategory(transaction.category_name || "");
      setCurrentTags(transaction.tags || []);
      setSaveAsRule(true);
      setIsConfirmingDelete(false);
      setCurrentReceipt(
        (transaction.metadata?.receipt as TransactionReceiptMetadata) || null
      );

      const existingComment =
        transaction.metadata?.comment || transaction.metadata?.note || "";
      const formatted = formatInitialCommentAndTags(
        existingComment,
        transaction.tags
      );
      setCommentInput(formatted);
      setInitialCommentFormatted(formatted);

      const emergencyInit = Boolean(
        transaction.exclude_from_budget ||
        transaction.metadata?.is_emergency ||
        (Array.isArray(transaction.tags) &&
          transaction.tags.includes("форсмажор"))
      );
      setIsEmergency(emergencyInit);
      setInitialIsEmergency(emergencyInit);

      const amortInit = Number(transaction.metadata?.amortization?.months) || 1;
      setAmortizationMonths(amortInit);
      setInitialAmortizationMonths(amortInit);
    }
  }, [transaction]);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const handleViewReceipt = () => {
    try {
      if (!currentReceipt?.base64) {
        toast.error("Вміст квитанції відсутній");
        return;
      }
      const byteCharacters = atob(currentReceipt.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: currentReceipt.mimeType || "application/pdf",
      });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (err: any) {
      console.error("Помилка відкриття квитанції:", err);
      toast.error("Не вдалося відкрити квитанцію");
    }
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !transaction) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Розмір файлу перевищує 5 МБ");
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Дозволені лише PDF-файли");
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
      return;
    }

    try {
      setIsAttachingReceipt(true);
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const isPdf =
        uint8.length >= 4 &&
        uint8[0] === 0x25 &&
        uint8[1] === 0x50 &&
        uint8[2] === 0x44 &&
        uint8[3] === 0x46;

      if (!isPdf) {
        toast.error("Вміст файлу не є дійсним PDF");
        return;
      }

      let binary = "";
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const receiptPayload: TransactionReceiptMetadata = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: "application/pdf",
        base64,
        attachedAt: new Date().toISOString(),
      };

      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transaction.id,
          metadata: {
            receipt: receiptPayload,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Не вдалося прикріпити квитанцію");
      }

      setCurrentReceipt(receiptPayload);
      triggerHaptic("success");
      toast.success("Квитанцію успішно прикріплено!");
      onReceiptUpdated?.();
    } catch (err: any) {
      triggerHaptic("error");
      toast.error(err.message || "Помилка прикріплення файлу");
    } finally {
      setIsAttachingReceipt(false);
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
    }
  };

  const handleDeleteReceipt = async () => {
    if (!transaction) return;
    try {
      setIsAttachingReceipt(true);
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transaction.id,
          metadata: {
            receipt: null,
          },
        }),
      });
      if (!res.ok) throw new Error("Не вдалося видалити квитанцію");
      setCurrentReceipt(null);
      triggerHaptic("selection");
      toast.success("Квитанцію видалено");
      onReceiptUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Помилка");
    } finally {
      setIsAttachingReceipt(false);
    }
  };

  if (!transaction) return null;

  const isTitleModified =
    cleanTitleInput.trim() !== "" &&
    cleanTitleInput.trim() !== transaction.merchant_raw;

  const isEmergencyModified = isEmergency !== initialIsEmergency;
  const isAmortizationModified =
    amortizationMonths !== initialAmortizationMonths;
  const isCommentModified =
    commentInput.trim() !== initialCommentFormatted.trim();
  const isDirty =
    isTitleModified ||
    isEmergencyModified ||
    isAmortizationModified ||
    isCommentModified;

  const handleSave = async (targetCategory: string = selectedCategory) => {
    if (!transaction || isSubmitting) return;

    setIsSubmitting(true);
    try {
      triggerHaptic("success");

      const existingMetadata = transaction.metadata || {};
      const newMetadata: Record<string, any> = { ...existingMetadata };

      if (isEmergency) {
        newMetadata.is_emergency = true;
        delete newMetadata.amortization;
      } else {
        delete newMetadata.is_emergency;
        if (amortizationMonths > 1) {
          const monthlyAmount = Math.round(
            Number(transaction.amount || 0) / amortizationMonths
          );
          newMetadata.amortization = {
            months: amortizationMonths,
            monthly_amount: monthlyAmount,
            start_date: transaction.created_at,
          };
        } else {
          delete newMetadata.amortization;
        }
      }

      const parsed = extractTagsAndComment(commentInput);
      let updatedTags = [...parsed.tags];
      if (isEmergency && !updatedTags.includes("форсмажор")) {
        updatedTags.push("форсмажор");
      } else if (!isEmergency && updatedTags.includes("форсмажор")) {
        updatedTags = updatedTags.filter((t) => t !== "форсмажор");
      }

      if (parsed.comment) {
        newMetadata.comment = parsed.comment;
        newMetadata.note = parsed.comment;
      } else {
        newMetadata.comment = null;
        newMetadata.note = null;
      }

      if (onUpdateTransaction) {
        await onUpdateTransaction({
          id: transaction.id,
          category_name: targetCategory,
          clean_title: cleanTitleInput.trim() || transaction.merchant_raw,
          merchant_raw: transaction.merchant_raw,
          save_as_rule: saveAsRule,
          tags: updatedTags,
          exclude_from_budget: false,
          metadata: newMetadata,
        });
      } else {
        await fetch("/api/transactions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: transaction.id,
            category_name: targetCategory,
            clean_title: cleanTitleInput.trim() || transaction.merchant_raw,
            merchant_raw: transaction.merchant_raw,
            save_as_rule: saveAsRule,
            tags: updatedTags,
            exclude_from_budget: false,
            metadata: newMetadata,
          }),
        });
        await onUpdateCategory(
          transaction.id,
          targetCategory,
          cleanTitleInput.trim() || transaction.merchant_raw,
          saveAsRule
        );
        if (onReceiptUpdated) {
          onReceiptUpdated();
        }
      }
      toast.success("Зміни збережено!");
      onClose();
    } catch (err) {
      triggerHaptic("error");
      console.error("Не вдалося оновити транзакцію:", err);
      toast.error("Помилка збереження змін");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentChange = (text: string) => {
    setCommentInput(text);
    const parsed = extractTagsAndComment(text);
    let newTags = [...parsed.tags];
    if (isEmergency && !newTags.includes("форсмажор")) {
      newTags.push("форсмажор");
    }
    setCurrentTags(newTags);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    triggerHaptic("selection");
    if (tagToRemove === "форсмажор") {
      setIsEmergency(false);
    }
    const updated = removeTagFromText(commentInput, tagToRemove);
    setCommentInput(updated);
    const parsed = extractTagsAndComment(updated);
    let newTags = [...parsed.tags];
    if (
      isEmergency &&
      tagToRemove !== "форсмажор" &&
      !newTags.includes("форсмажор")
    ) {
      newTags.push("форсмажор");
    }
    setCurrentTags(newTags);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Клік по підкладці закриває шторку */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Шторка (Bottom Sheet) для iPhone / Центрована картка для десктопу */}
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overscroll-contain rounded-t-[28px] border border-zinc-800/80 bg-zinc-950 p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6 sm:pb-6">
        {/* Grabber Bar — маркер свайпу для iOS */}
        <div className="mx-auto mb-3.5 h-1.5 w-11 shrink-0 rounded-full bg-zinc-700/50 sm:hidden" />

        {/* Шапка модалки */}
        <div className="mb-4 flex items-start justify-between border-b border-zinc-800/80 pb-3.5">
          <div className="min-w-0 pr-2">
            <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              Редагування чека
            </span>
            <h3 className="truncate text-base font-bold text-white">
              {transaction.merchant_raw}
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              {new Date(transaction.created_at).toLocaleString("uk-UA")} •{" "}
              <strong className="font-mono font-semibold text-emerald-400 tabular-nums">
                {Number(transaction.amount).toFixed(2)} ₴
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/60 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        {/* Скрол-зона вмісту форми з ізольованим overscroll */}
        <div className="[scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {/* Поле редагування назви закладу */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              <Store size={12} className="text-zinc-500" /> Назва мерчанта
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cleanTitleInput}
                onChange={(e) => setCleanTitleInput(e.target.value)}
                placeholder="Введіть зрозумілу назву..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-base text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none sm:text-xs"
              />
              {isTitleModified && (
                <button
                  type="button"
                  onClick={() => handleSave(selectedCategory)}
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
                onChange={(e) => setSaveAsRule(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-0 focus:ring-offset-0"
              />
              <div className="text-xs">
                <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                  <BookmarkCheck size={13} className="text-sky-400" />
                  Запам'ятати для майбутніх покупок
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                  Усі наступні списання від цього продавця отримуватимуть цю
                  назву та категорію.
                </p>
              </div>
            </label>
          </div>

          {/* Форс-мажор та покриття з Фінансової подушки */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 transition-colors">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isEmergency
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  <ShieldAlert size={16} />
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                    🛡️ Форс-мажор (екстрена витрата)
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                    Позначає витрату для ШІ як вимушену екстрену потребу (ліки,
                    поломка тощо), щоб вона не вважалася споживчим
                    марнотратством.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => {
                  triggerHaptic("selection");
                  setIsEmergency(e.target.checked);
                }}
                className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0 focus:ring-offset-0"
              />
            </label>
          </div>

          {/* Розподіл витрати на кілька місяців (амортизація) */}
          {!isEmergency && Number(transaction.amount) > 0 && (
            <div className="space-y-2.5 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <CalendarDays size={14} className="text-indigo-400" />
                  🗓️ Розподіл на кілька місяців (амортизація)
                </div>
                {amortizationMonths > 1 && (
                  <span className="font-mono text-[11px] font-bold text-indigo-400">
                    по ~
                    {Math.round(
                      Number(transaction.amount) / amortizationMonths
                    ).toLocaleString("uk-UA")}{" "}
                    ₴/міс
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Для курсів лікування (вітаміни на 3+ міс), страховки або великих
                покупок: вся сума списується з картки одразу, а ШІ та аналітика
                сприймають це як планову інвестицію на кілька місяців, а не
                разове марнотратство.
              </p>
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {[1, 2, 3, 6, 12].map((m) => {
                  const isSelected = amortizationMonths === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        triggerHaptic("selection");
                        setAmortizationMonths(m);
                      }}
                      className={`rounded-xl py-1.5 text-center text-xs font-semibold transition-all active:scale-95 ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400"
                          : "border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {m === 1 ? "Вимкнено" : `${m} міс`}
                    </button>
                  );
                })}
              </div>
              {amortizationMonths > 1 && (
                <div className="rounded-lg border border-indigo-800/30 bg-indigo-950/40 px-2.5 py-1.5 text-[11px] text-indigo-300">
                  💡 З балансу списується вся сума (
                  <b>{Number(transaction.amount).toLocaleString("uk-UA")} ₴</b>)
                  — гроші не повертаються віртуально. ШІ та аналітика зафіксують
                  це як планову інвестицію на {amortizationMonths} міс (по ~
                  {Math.round(
                    Number(transaction.amount) / amortizationMonths
                  ).toLocaleString("uk-UA")}{" "}
                  ₴/міс), щоб не вважати її разовим марнотратством.
                </div>
              )}
            </div>
          )}

          {/* Вибір категорії */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Категорія (натисніть для вибору)
              </label>
              {isSubmitting && (
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Loader2 size={11} className="animate-spin" /> Збереження...
                </span>
              )}
            </div>

            <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
              {CATEGORIES.map((catName) => {
                const Icon = CATEGORY_ICONS[catName];
                const color = CATEGORY_COLORS[catName] || "#71717a";
                const isSelected = selectedCategory === catName;

                return (
                  <button
                    key={catName}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setSelectedCategory(catName);
                      handleSave(catName);
                    }}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition-all active:scale-[0.98] ${
                      isSelected
                        ? "border-sky-500/50 bg-sky-500/10 font-semibold text-white shadow-xs"
                        : "border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {Icon && (
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        <Icon size={12} />
                      </span>
                    )}
                    <span className="truncate">{catName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Коментар та теги */}
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
                onChange={(e) => handleCommentChange(e.target.value)}
                placeholder="Додайте опис або коментар... Слова з # стають тегами (напр: подарунок мамі #деньнародження)"
                className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 transition-colors focus:border-zinc-700 focus:outline-none"
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
                    onClick={() => {
                      onClose();
                      onOpenTagProject?.(tag);
                    }}
                    title={`Аналітика проєкту #${tag} за весь час`}
                    className="transition-colors hover:text-sky-200"
                  >
                    #{tag}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
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

          {/* Блок прикріпленої квитанції / чека */}
          <div className="border-t border-zinc-800/80 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                <FileText size={12} className="text-zinc-500" /> Квитанція / Чек
              </label>
              {currentReceipt?.fileSize && (
                <span className="text-[10px] text-zinc-500">
                  {formatFileSize(currentReceipt.fileSize)}
                </span>
              )}
            </div>

            {currentReceipt ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3.5 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                      <FileCheck size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">
                        {currentReceipt.fileName || "Квитанція.pdf"}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {currentReceipt.bankName
                          ? `${currentReceipt.bankName} • `
                          : ""}
                        Оригінал PDF збережено
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleViewReceipt}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95"
                      title="Відкрити PDF-квитанцію"
                    >
                      <ExternalLink size={13} />
                      <span>Відкрити</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteReceipt}
                      disabled={isAttachingReceipt}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-rose-500/20 hover:text-rose-400"
                      title="Видалити квитанцію"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {currentReceipt.purpose && (
                  <p className="mt-2.5 line-clamp-2 rounded-lg bg-zinc-950/40 p-2 text-[10px] leading-relaxed text-zinc-400">
                    {currentReceipt.purpose}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <input
                  ref={receiptFileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileInputChange}
                  disabled={isAttachingReceipt}
                />
                <button
                  type="button"
                  onClick={() => receiptFileInputRef.current?.click()}
                  disabled={isAttachingReceipt}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-2.5 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-900/60 active:scale-[0.99]"
                >
                  {isAttachingReceipt ? (
                    <>
                      <Loader2
                        size={14}
                        className="animate-spin text-emerald-400"
                      />
                      <span>Прикріплення квитанції...</span>
                    </>
                  ) : (
                    <>
                      <Paperclip size={14} className="text-zinc-500" />
                      <span>Прикріпити квитанцію (PDF)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Кнопка збереження змін форми (якщо змінено назву, форс-мажор або амортизацію) */}
          {isDirty && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleSave(selectedCategory)}
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 py-3 text-xs font-bold text-white shadow-lg shadow-sky-950/40 transition-all hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Зберегти зміни
              </button>
            </div>
          )}

          {/* Розділити транзакцію (якщо це не вже розділена дочірня) */}
          {onOpenSplit && !transaction.parent_transaction_id && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onOpenSplit(transaction);
                  onClose();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 py-2.5 text-xs font-bold text-sky-400 transition-all hover:bg-sky-500/20 active:scale-[0.99]"
              >
                <Split size={14} /> Розділити на кілька категорій
              </button>
            </div>
          )}

          {/* Видалення транзакції із захистом від випадкового натискання */}
          <div className="pt-2">
            {isConfirmingDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("selection");
                    setIsConfirmingDelete(false);
                  }}
                  className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/80 py-2.5 text-xs font-semibold text-zinc-400 transition-all hover:bg-zinc-800 active:scale-95"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("heavy");
                    onDelete(transaction.id);
                  }}
                  className="flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-950/40 transition-all hover:bg-rose-500 active:scale-95"
                >
                  <Trash2 size={14} className="mr-1 inline" />
                  Точно видалити?
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("warning");
                  setIsConfirmingDelete(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-900/40 bg-rose-950/20 py-2.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-900/30 active:scale-[0.99]"
              >
                <Trash2 size={14} /> Видалити транзакцію
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

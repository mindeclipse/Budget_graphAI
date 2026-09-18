import {
  sendTelegramMessage,
  sendTelegramChatAction,
  getTelegramFile,
} from "@/lib/telegram";
import {
  parseMultimodalReceipt,
  applyMerchantRules,
  recordTelegramTransaction,
  formatTransactionConfirmation,
  normalizeCategory,
} from "@/lib/telegram-bot";
import { CategoryType } from "@/constants/categories";
import { extractTagsAndComment } from "@/lib/tag-utils";
import { TransactionReceiptMetadata } from "@/types/finance";

function parseCaption(captionText?: string): {
  tags: string[];
  comment?: string;
  category: CategoryType | null;
} {
  const caption = (captionText || "").trim();
  if (!caption) {
    return { tags: [], comment: undefined, category: null };
  }
  const parsed = extractTagsAndComment(caption);
  const normalized = normalizeCategory(parsed.comment || caption);
  return {
    tags: parsed.tags,
    comment: parsed.comment || undefined,
    category: normalized !== "Інше" ? normalized : null,
  };
}

export async function handlePhotoReceipt(
  message: any,
  supabaseAdmin: any
): Promise<void> {
  await sendTelegramChatAction("upload_photo");
  const bestPhoto = message.photo[message.photo.length - 1];
  const downloaded = await getTelegramFile(bestPhoto.file_id);

  if (!downloaded) {
    await sendTelegramMessage(
      "⚠️ Не вдалося завантажити зображення з серверів Telegram. Спробуйте ще раз."
    );
    return;
  }

  const caption = (message.caption || "").trim();
  const {
    tags: captionTags,
    comment: captionComment,
    category: captionCategory,
  } = parseCaption(caption);

  const receipt = await parseMultimodalReceipt(
    downloaded.buffer,
    "image/jpeg",
    new Date(),
    caption
  );

  if (!receipt) {
    await sendTelegramMessage(
      "⚠️ Не вдалося розпізнати чек на зображенні. Переконайтеся, що скріншот чіткий, або запишіть витрату текстом (наприклад: <i>«Сільпо 450»</i>)."
    );
    return;
  }

  // Застосовуємо правила користувача з бази
  const { merchant, category } = await applyMerchantRules(
    receipt.merchant,
    supabaseAdmin
  );

  const finalCategory =
    captionCategory || category || receipt.suggested_category;

  const receiptPayload: TransactionReceiptMetadata = {
    fileName: downloaded.fileName || "Чек.jpg",
    fileSize: downloaded.buffer.length,
    mimeType: "image/jpeg",
    base64: downloaded.buffer.toString("base64"),
    attachedAt: new Date().toISOString(),
    bankName: receipt.bankName,
    purpose: receipt.purpose,
  };

  const { transaction, dailyBudget, roundupResult } =
    await recordTelegramTransaction(supabaseAdmin, {
      amount: receipt.amount,
      currency: receipt.currency,
      merchant,
      category: finalCategory,
      type: receipt.type,
      date: receipt.date,
      tags: captionTags.length > 0 ? captionTags : undefined,
      metadata: {
        source_type: "photo_receipt",
        file_name: downloaded.fileName,
        receipt_items: receipt.items || [],
        comment: captionComment,
        note: captionComment,
        receipt: receiptPayload,
      },
    });

  const confirmation = formatTransactionConfirmation({
    transaction,
    dailyBudget,
    roundupResult,
    itemsCount: receipt.items?.length || 0,
  });

  await sendTelegramMessage(confirmation.text, confirmation.replyMarkup);
}

export async function handleDocumentReceipt(
  message: any,
  supabaseAdmin: any
): Promise<void> {
  await sendTelegramChatAction("upload_document");
  const doc = message.document;
  const mimeType = (doc.mime_type || "").toLowerCase();
  const fileName = (doc.file_name || "").toLowerCase();

  const isPdf = mimeType.includes("pdf") || fileName.endsWith(".pdf");
  const isImage =
    mimeType.startsWith("image/") || fileName.match(/\.(png|jpe?g|webp)$/i);

  if (!isPdf && !isImage) {
    await sendTelegramMessage(
      "⚠️ Підтримуються лише PDF-квитанції або зображення чеків (PNG, JPEG, WEBP)."
    );
    return;
  }

  const downloaded = await getTelegramFile(doc.file_id);
  if (!downloaded) {
    await sendTelegramMessage(
      "⚠️ Не вдалося завантажити документ. Спробуйте надіслати ще раз."
    );
    return;
  }

  const caption = (message.caption || "").trim();
  const {
    tags: captionTags,
    comment: captionComment,
    category: captionCategory,
  } = parseCaption(caption);

  const actualMime = isPdf ? "application/pdf" : mimeType || "image/jpeg";
  const receipt = await parseMultimodalReceipt(
    downloaded.buffer,
    actualMime,
    new Date(),
    caption
  );

  if (!receipt) {
    await sendTelegramMessage(
      "⚠️ Не вдалося автоматично витягти дані з документа. Перевірте читабельність квитанції."
    );
    return;
  }

  const { merchant, category } = await applyMerchantRules(
    receipt.merchant,
    supabaseAdmin
  );

  const finalCategory =
    captionCategory || category || receipt.suggested_category;

  const receiptPayload: TransactionReceiptMetadata = {
    fileName: doc.file_name || (isPdf ? "Квитанція.pdf" : "Чек.jpg"),
    fileSize: downloaded.buffer.length,
    mimeType: actualMime,
    base64: downloaded.buffer.toString("base64"),
    attachedAt: new Date().toISOString(),
    bankName: receipt.bankName,
    purpose: receipt.purpose,
  };

  const { transaction, dailyBudget, roundupResult } =
    await recordTelegramTransaction(supabaseAdmin, {
      amount: receipt.amount,
      currency: receipt.currency,
      merchant,
      category: finalCategory,
      type: receipt.type,
      date: receipt.date,
      tags: captionTags.length > 0 ? captionTags : undefined,
      metadata: {
        source_type: "document_receipt",
        file_name: doc.file_name,
        receipt_items: receipt.items || [],
        comment: captionComment,
        note: captionComment,
        receipt: receiptPayload,
      },
    });

  const confirmation = formatTransactionConfirmation({
    transaction,
    dailyBudget,
    roundupResult,
    itemsCount: receipt.items?.length || 0,
  });

  await sendTelegramMessage(confirmation.text, confirmation.replyMarkup);
}

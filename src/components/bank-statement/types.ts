export interface ParsedReceiptData {
  amount: number;
  currency: string;
  recipient: string;
  purpose: string;
  date: string;
  type: "expense" | "investment";
  category: string;
  payer?: string;
  bankName?: string;
  isPotentialDuplicate?: boolean;
  duplicateTxId?: number | null;
  fileMeta: {
    fileName: string;
    fileSize: number;
    base64: string;
    mimeType: string;
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function toDateTimeLocalString(isoOrDateStr: string): string {
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return "";
  }
}

"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { consumeSharedReceipt } from "@/lib/share-target";

interface ShareTargetListenerProps {
  onOpenReceipt: (file: File) => void;
}

export function ShareTargetListener({
  onOpenReceipt,
}: ShareTargetListenerProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isCheckingRef = useRef(false);

  useEffect(() => {
    const action = searchParams.get("action");

    const checkSharedReceipt = async () => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;

      try {
        const shared = await consumeSharedReceipt();

        if (shared?.file) {
          onOpenReceipt(shared.file);
        } else if (shared?.text) {
          // Якщо передано текстовий опис/номер чека, конвертуємо у текстовий файл
          const textBlob = new Blob([shared.text], { type: "text/plain" });
          const textFile = new File([textBlob], "shared-receipt.txt", {
            type: "text/plain",
          });
          onOpenReceipt(textFile);
        }

        if (action === "shared_receipt") {
          router.replace("/", { scroll: false });
        }
      } catch (err) {
        console.warn(
          "[ShareTargetListener] Помилка зчитування спільної квитанції:",
          err
        );
      } finally {
        isCheckingRef.current = false;
      }
    };

    if (action === "shared_receipt") {
      checkSharedReceipt();
    }
  }, [searchParams, onOpenReceipt, router]);

  return null;
}

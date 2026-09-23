"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { InvestmentAsset, BondCoupon } from "@/types/finance";
import { parseFlexibleNumber } from "@/lib/normalize";
import {
  parseDateInputToIso,
  formatIsoToDisplayDate,
} from "./investment-asset/date-utils";
import { InvestmentAssetModalHeader } from "./investment-asset/InvestmentAssetModalHeader";
import { InvestmentAssetFormFields } from "./investment-asset/InvestmentAssetFormFields";
import { InvestmentAssetModalFooter } from "./investment-asset/InvestmentAssetModalFooter";

export { parseDateInputToIso, formatIsoToDisplayDate };

export interface InvestmentAssetModalProps {
  isOpen: boolean;
  asset?: InvestmentAsset | null;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onUpsertOptimistic?: (asset: any) => void;
}

export function InvestmentAssetModal({
  isOpen,
  asset,
  onClose,
  onRefresh,
  onUpsertOptimistic,
}: InvestmentAssetModalProps) {
  const [mounted, setMounted] = useState(false);
  const hiddenDatePickerRef = useRef<HTMLInputElement>(null);

  const isEditing = Boolean(asset);
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<
    "bonds" | "stocks" | "reit" | "crypto" | "deposit" | "other"
  >("bonds");
  const [invested, setInvested] = useState("");
  const [currentVal, setCurrentVal] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [yieldPct, setYieldPct] = useState("");
  const [maturityDateInput, setMaturityDateInput] = useState("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState("");
  const [couponAmount, setCouponAmount] = useState("");
  const [coupons, setCoupons] = useState<BondCoupon[]>([]);
  const [isArchived, setIsArchived] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (asset) {
      setName(asset.asset_name || "");
      setAssetType(asset.asset_type || "bonds");
      setInvested(String(asset.invested_amount || ""));
      setCurrentVal(String(asset.current_value || ""));
      setCurrency(asset.currency || "UAH");
      setYieldPct(asset.yield_percent ? String(asset.yield_percent) : "");
      setMaturityDateInput(formatIsoToDisplayDate(asset.maturity_date));
      setNotes(asset.notes || "");
      setQuantity(asset.quantity ? String(asset.quantity) : "");
      setCouponAmount(asset.coupon_amount ? String(asset.coupon_amount) : "");
      setCoupons(Array.isArray(asset.coupons) ? asset.coupons : []);
      setIsArchived(Boolean(asset.is_archived));
    } else {
      setName("");
      setAssetType("bonds");
      setInvested("");
      setCurrentVal("");
      setCurrency("UAH");
      setYieldPct("");
      setMaturityDateInput("");
      setNotes("");
      setQuantity("");
      setCouponAmount("");
      setCoupons([]);
      setIsArchived(false);
    }
    setFormError("");
  }, [isOpen, asset]);

  if (!mounted || !isOpen) return null;

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Введіть назву активу");
      return;
    }

    const investedNum = parseFlexibleNumber(invested);
    if (isNaN(investedNum) || investedNum < 0) {
      setFormError("Некоректна сума вкладення");
      return;
    }

    const currentNum = parseFlexibleNumber(currentVal);
    if (isNaN(currentNum) || currentNum < 0) {
      setFormError("Некоректна поточна вартість");
      return;
    }

    let parsedYield: number | null = null;
    if (yieldPct.trim()) {
      const yNum = parseFlexibleNumber(yieldPct);
      if (isNaN(yNum)) {
        setFormError("Некоректна ставка дохідності");
        return;
      }
      parsedYield = yNum;
    }

    let parsedMaturity: string | null = null;
    if (maturityDateInput.trim()) {
      parsedMaturity = parseDateInputToIso(maturityDateInput);
      if (!parsedMaturity) {
        setFormError(
          "Некоректний формат дати. Використовуйте ДД.ММ.РРРР (напр. 25.04.2028)"
        );
        return;
      }
    }

    const quantityNum = quantity.trim() ? parseFlexibleNumber(quantity) : null;
    const couponAmountNum = couponAmount.trim()
      ? parseFlexibleNumber(couponAmount)
      : null;

    const cleanedCoupons: BondCoupon[] =
      assetType === "bonds"
        ? coupons
            .filter((c) => c.date && Number(c.amount) > 0)
            .map((c) => ({
              id:
                c.id ||
                `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              date: c.date.trim(),
              amount: Number(c.amount),
            }))
        : [];

    setIsSubmitting(true);
    setFormError("");

    try {
      const payload = {
        id: asset ? asset.id : undefined,
        asset_name: name.trim(),
        asset_type: assetType,
        invested_amount: investedNum,
        current_value: currentNum,
        currency,
        yield_percent: parsedYield,
        maturity_date: parsedMaturity,
        notes: notes.trim() || null,
        coupons: cleanedCoupons,
        quantity:
          assetType === "bonds" && quantityNum && quantityNum > 0
            ? quantityNum
            : null,
        coupon_amount:
          assetType === "bonds" && couponAmountNum && couponAmountNum > 0
            ? couponAmountNum
            : null,
        is_archived: isArchived,
      };

      onUpsertOptimistic?.(payload);
      onClose();

      const res = await fetch("/api/investments", {
        method: asset ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Помилка збереження активу");
      }

      await onRefresh();
    } catch (err: any) {
      setFormError(err.message || "Помилка сервера при збереженні");
      await onRefresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90dvh] min-h-0 w-full max-w-md flex-col overscroll-contain rounded-t-[28px] border border-zinc-800 bg-zinc-950 shadow-2xl duration-200 sm:max-h-[85vh] sm:rounded-3xl">
        <InvestmentAssetModalHeader isEditing={isEditing} onClose={onClose} />

        <form
          onSubmit={handleSaveAsset}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 [scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
            {formError && (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                {formError}
              </p>
            )}

            <InvestmentAssetFormFields
              name={name}
              setName={setName}
              assetType={assetType}
              setAssetType={setAssetType}
              currency={currency}
              setCurrency={setCurrency}
              invested={invested}
              setInvested={setInvested}
              currentVal={currentVal}
              setCurrentVal={setCurrentVal}
              yieldPct={yieldPct}
              setYieldPct={setYieldPct}
              maturityDateInput={maturityDateInput}
              setMaturityDateInput={setMaturityDateInput}
              notes={notes}
              setNotes={setNotes}
              clearError={() => setFormError("")}
              hiddenDatePickerRef={hiddenDatePickerRef}
              quantity={quantity}
              setQuantity={setQuantity}
              couponAmount={couponAmount}
              setCouponAmount={setCouponAmount}
              coupons={coupons}
              setCoupons={setCoupons}
            />
          </div>

          <InvestmentAssetModalFooter
            onClose={onClose}
            isSubmitting={isSubmitting}
            isEditing={isEditing}
          />
        </form>
      </div>
    </div>,
    document.body
  );
}

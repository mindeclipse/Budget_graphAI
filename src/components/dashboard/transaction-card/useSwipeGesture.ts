import { useState, useRef, useEffect, useCallback } from "react";
import { triggerHaptic } from "@/lib/haptics";

const SWIPE_THRESHOLD = 75;
const MAX_RUBBER_BAND = 130;

interface UseSwipeGestureProps {
  transactionId: number;
  isSyncing?: boolean;
  onDelete?: (txId: number) => void;
  onSelect: () => void;
}

export function useSwipeGesture({
  transactionId,
  isSyncing = false,
  onDelete,
  onSelect,
}: UseSwipeGestureProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [hasCrossedThreshold, setHasCrossedThreshold] = useState(false);

  // Відстеження жестів touch
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);
  const currentOffsetRef = useRef(0);
  const hasTriggeredHapticRef = useRef(false);

  // Очищення стану виходу при зміні транзакції
  useEffect(() => {
    setIsExiting(false);
    setOffsetX(0);
    currentOffsetRef.current = 0;
  }, [transactionId]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isSyncing || isExiting) return;
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    isHorizontalSwipeRef.current = null;
    hasTriggeredHapticRef.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isSyncing || isExiting || !isDragging) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartXRef.current;
    const diffY = touch.clientY - touchStartYRef.current;

    // Визначаємо намір користувача: вертикальний скрол чи горизонтальний свайп
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalSwipeRef.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    if (!isHorizontalSwipeRef.current) return;

    // Rubber-band опір
    const sign = Math.sign(diffX);
    const absDiff = Math.abs(diffX);
    let effectiveOffset = diffX;

    if (absDiff > SWIPE_THRESHOLD) {
      const excess = absDiff - SWIPE_THRESHOLD;
      const damped = Math.pow(excess, 0.72) * 2;
      effectiveOffset =
        sign * Math.min(SWIPE_THRESHOLD + damped, MAX_RUBBER_BAND);

      if (!hasTriggeredHapticRef.current) {
        triggerHaptic("medium");
        hasTriggeredHapticRef.current = true;
        setHasCrossedThreshold(true);
      }
    } else {
      if (hasTriggeredHapticRef.current) {
        hasTriggeredHapticRef.current = false;
        setHasCrossedThreshold(false);
      }
    }

    currentOffsetRef.current = effectiveOffset;
    setOffsetX(effectiveOffset);
  };

  const handleTouchEnd = useCallback(() => {
    if (isSyncing || isExiting) return;
    setIsDragging(false);

    const finalOffset = currentOffsetRef.current;
    const isOverThreshold = Math.abs(finalOffset) >= SWIPE_THRESHOLD;

    if (isOverThreshold && onDelete) {
      triggerHaptic("warning");
      setIsExiting(true);
      const exitDirection = finalOffset > 0 ? 1 : -1;
      setOffsetX(exitDirection * 400);

      setTimeout(() => {
        onDelete(transactionId);
      }, 200);
    } else {
      setOffsetX(0);
      currentOffsetRef.current = 0;
      setHasCrossedThreshold(false);
      hasTriggeredHapticRef.current = false;
    }
  }, [isSyncing, isExiting, onDelete, transactionId]);

  const handleClick = (e: React.MouseEvent) => {
    // Якщо був помітний горизонтальний рух — блокуємо клік
    if (Math.abs(currentOffsetRef.current) > 10) {
      e.stopPropagation();
      return;
    }
    onSelect();
  };

  return {
    offsetX,
    isDragging,
    isExiting,
    hasCrossedThreshold,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleClick,
  };
}

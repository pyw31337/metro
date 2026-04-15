"use client";

import { useRef, useCallback } from "react";

interface LongPressOptions {
  onLongPress: (e: TouchEvent | MouseEvent) => void;
  onPress?: (e: TouchEvent | MouseEvent) => void;
  delay?: number; // ms, default 500
}

export function useLongPress({ onLongPress, onPress, delay = 500 }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);
  const posRef = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((e: TouchEvent | MouseEvent) => {
    triggeredRef.current = false;
    const pos = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
    posRef.current = pos;

    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const move = useCallback((e: TouchEvent | MouseEvent) => {
    if (!posRef.current || !timerRef.current) return;
    const pos = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
    // 10px 이상 이동 시 취소
    if (Math.abs(pos.x - posRef.current.x) > 10 || Math.abs(pos.y - posRef.current.y) > 10) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const end = useCallback((e: TouchEvent | MouseEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!triggeredRef.current) {
      onPress?.(e);
    }
  }, [onPress]);

  return { onTouchStart: start, onTouchMove: move, onTouchEnd: end };
}

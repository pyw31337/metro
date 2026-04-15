"use client";

import { useEffect, useRef } from "react";
import { Navigation, Flag, GitBranch, X } from "lucide-react";

interface LongPressMenuProps {
  point: { x: number; y: number };
  stationName: string;
  onSetStart: (name: string) => void;
  onSetEnd: (name: string) => void;
  onSetWaypoint: (name: string) => void;
  onClose: () => void;
}

export default function LongPressMenu({
  point,
  stationName,
  onSetStart,
  onSetEnd,
  onSetWaypoint,
  onClose,
}: LongPressMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside tap
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  // Clamp menu so it stays inside viewport
  const MENU_W = 180;
  const MENU_H = 160;
  const left = Math.min(point.x, window.innerWidth - MENU_W - 8);
  const top = point.y + 12 + MENU_H > window.innerHeight
    ? point.y - MENU_H - 12
    : point.y + 12;

  const items = [
    {
      label: "출발지로 설정",
      icon: <Navigation size={14} />,
      color: "text-blue-500",
      action: () => { onSetStart(stationName); onClose(); },
    },
    {
      label: "도착지로 설정",
      icon: <Flag size={14} />,
      color: "text-rose-500",
      action: () => { onSetEnd(stationName); onClose(); },
    },
    {
      label: "경유지로 추가",
      icon: <GitBranch size={14} />,
      color: "text-emerald-500",
      action: () => { onSetWaypoint(stationName); onClose(); },
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] animate-fade-in-up select-none"
      style={{ left, top }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200/60 dark:border-white/10 overflow-hidden min-w-[180px]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-white/8">
          <span className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 truncate max-w-[130px]">
            {stationName}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
            aria-label="닫기"
          >
            <X size={12} />
          </button>
        </div>

        {/* Actions */}
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors active:scale-[0.98]"
            >
              <span className={item.color}>{item.icon}</span>
              <span className="text-[13px] font-bold text-zinc-800 dark:text-white">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

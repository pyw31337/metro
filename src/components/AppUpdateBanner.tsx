"use client";

import { useEffect, useMemo, useState } from "react";

import { withDeployBase } from "@/utils/deployPaths";
import { hapticLight } from "@/utils/haptic";

interface VersionPayload {
  buildVersion?: string;
  builtAt?: string;
}

const CURRENT_BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";
const VERSION_URL = withDeployBase("/version.json");

function formatBuiltAt(value?: string) {
  if (!value) return "새 버전";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "새 버전";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AppUpdateBanner() {
  const [remote, setRemote] = useState<VersionPayload | null>(null);
  const [available, setAvailable] = useState(false);

  const builtAtLabel = useMemo(() => formatBuiltAt(remote?.builtAt), [remote?.builtAt]);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      try {
        const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;

        const payload = (await response.json()) as VersionPayload;
        if (!payload.buildVersion || cancelled) return;

        if (payload.buildVersion !== CURRENT_BUILD_VERSION) {
          setRemote(payload);
          setAvailable(true);
          return;
        }

        setAvailable(false);
      } catch {}
    };

    const pokeServiceWorker = () => {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.getRegistration().then((registration) => {
        registration?.update().catch(() => {});
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      pokeServiceWorker();
      checkForUpdate();
    };

    checkForUpdate();
    pokeServiceWorker();

    const intervalId = window.setInterval(() => {
      pokeServiceWorker();
      checkForUpdate();
    }, 120000);

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  if (!available) return null;

  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-[3005] w-[min(92vw,420px)] -translate-x-1/2">
      <div className="pointer-events-auto rounded-3xl border border-white/12 bg-zinc-950/92 px-4 py-3 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-2xl dark:bg-black/82">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
              새 배포 감지
            </div>
            <p className="mt-1 text-[13px] font-black leading-5">
              더 최신 버전이 올라왔어요.
            </p>
            <p className="mt-1 text-[11px] font-bold leading-5 text-white/70">
              오래 열린 탭이면 예전 코드가 남아 있을 수 있어요. {builtAtLabel} 빌드로 새로고침하는 걸 권장합니다.
            </p>
          </div>
          <button
            onClick={() => {
              hapticLight();
              window.location.reload();
            }}
            className="shrink-0 rounded-2xl bg-emerald-400 px-3 py-2 text-[11px] font-black text-zinc-950 transition hover:bg-emerald-300"
          >
            지금 새로고침
          </button>
        </div>
      </div>
    </div>
  );
}

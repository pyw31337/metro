"use client";

import { useEffect, useState } from "react";

type RealtimeHealthState =
  | { status: "checking"; label: string }
  | { status: "proxy"; label: string }
  | { status: "fallback"; label: string }
  | { status: "offline"; label: string };

const FIREBASE_DEPLOY = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "firebase";

export function useRealtimeHealth(): RealtimeHealthState {
  const [state, setState] = useState<RealtimeHealthState>(() => {
    if (!FIREBASE_DEPLOY) return { status: "proxy", label: "로컬 프록시 사용" };
    return { status: "checking", label: "실시간 경로 점검 중" };
  });

  useEffect(() => {
    if (!FIREBASE_DEPLOY) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ status: "offline", label: "네트워크 오프라인" });
      return;
    }

    const controller = new AbortController();

    fetch("/api/realtime/subway/alerts", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (response.ok) {
          setState({ status: "proxy", label: "실시간 프록시 연결" });
          return;
        }
        setState({ status: "fallback", label: "외부 백업 경로 사용" });
      })
      .catch(() => {
        setState(
          typeof navigator !== "undefined" && !navigator.onLine
            ? { status: "offline", label: "네트워크 오프라인" }
            : { status: "fallback", label: "외부 백업 경로 사용" }
        );
      });

    return () => controller.abort();
  }, []);

  return state;
}

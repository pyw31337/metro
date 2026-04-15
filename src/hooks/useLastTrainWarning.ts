"use client";

import { useEffect, useState } from "react";

const SCHED_BASE = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "firebase" ? "" : "/metro";
const WARN_MINUTES = 30; // 막차 N분 전부터 경고

interface ScheduleEntry {
  first: string;
  last: string | null;
  dest: string;
  count: number;
}
interface ScheduleIndexEntry {
  name: string;
  line: string;
  week?: Record<string, ScheduleEntry>;
  sat?: Record<string, ScheduleEntry>;
  sun?: Record<string, ScheduleEntry>;
}
type ScheduleIndex = Record<string, ScheduleIndexEntry>;

let _index: ScheduleIndex | null = null;
let _loading: Promise<ScheduleIndex> | null = null;
async function getIndex(): Promise<ScheduleIndex> {
  if (_index) return _index;
  if (_loading) return _loading;
  _loading = fetch(`${SCHED_BASE}/data/subway-schedule-index.json`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((d) => { _index = d; return d; });
  return _loading;
}

/** HH:MM 또는 25:MM(익일 새벽) → 오늘 기준 ms 타임스탬프 */
function toTodayMs(timeStr: string): number {
  const [hRaw, m] = timeStr.split(":").map(Number);
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (hRaw >= 24) {
    // 익일 새벽: 다음 날 기준으로 처리
    return base.getTime() + (hRaw - 24) * 3600000 + m * 60000 + 86400000;
  }
  return base.getTime() + hRaw * 3600000 + m * 60000;
}

function getDayKey(): "week" | "sat" | "sun" {
  const d = new Date().getDay();
  if (d === 6) return "sat";
  if (d === 0) return "sun";
  return "week";
}

export interface LastTrainInfo {
  station: string;
  line: string;
  dest: string;
  lastTimeStr: string;
  minutesLeft: number;
}

/**
 * 경로의 탑승역들에 대해 막차 30분 이내인 항목을 반환.
 * `stationNames`: 경로 path 배열 (환승역 포함)
 */
export function useLastTrainWarning(stationNames: string[]): LastTrainInfo | null {
  const [warning, setWarning] = useState<LastTrainInfo | null>(null);

  useEffect(() => {
    if (!stationNames.length) { setWarning(null); return; }
    let cancelled = false;

    const check = async () => {
      const index = await getIndex();
      const dayKey = getDayKey();
      const now = Date.now();
      let earliest: LastTrainInfo | null = null;

      for (const name of stationNames) {
        // 역명으로 인덱스 키 탐색
        for (const key of Object.keys(index)) {
          const entry = index[key];
          if (entry.name !== name) continue;
          const dayData = entry[dayKey];
          if (!dayData) continue;
          for (const [dir, sched] of Object.entries(dayData)) {
            if (!sched.last) continue;
            const lastMs = toTodayMs(sched.last);
            const diff = Math.floor((lastMs - now) / 60000);
            if (diff >= 0 && diff <= WARN_MINUTES) {
              if (!earliest || diff < earliest.minutesLeft) {
                earliest = {
                  station: name,
                  line: entry.line,
                  dest: sched.dest,
                  lastTimeStr: sched.last.replace(/^2[4-9]:/, (m) =>
                    `0${parseInt(m) - 24}:`.padStart(3, "0")
                  ),
                  minutesLeft: diff,
                };
              }
            }
          }
        }
      }
      if (!cancelled) setWarning(earliest);
    };

    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [stationNames.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return warning;
}

"use client";

import { useEffect } from "react";
import { SUBWAY_LINES } from "@/data/subway-lines";
import { transitRealtimeService } from "@/services/TransitRealtimeService";

interface Bounds {
  minLat: number; minLng: number;
  maxLat: number; maxLng: number;
}

/** bounds에 역이 1개 이상 포함된 노선 이름 목록을 계산해 실시간 서비스에 전달 */
export function useViewportLines(bounds: Bounds | null) {
  useEffect(() => {
    if (!bounds) {
      transitRealtimeService.setVisibleLines(null);
      return;
    }
    const { minLat, minLng, maxLat, maxLng } = bounds;
    const visible = new Set<string>();
    for (const line of SUBWAY_LINES) {
      for (const s of line.stations) {
        if (s.lat >= minLat && s.lat <= maxLat && s.lng >= minLng && s.lng <= maxLng) {
          visible.add(line.name);
          break;
        }
      }
    }
    transitRealtimeService.setVisibleLines(visible.size > 0 ? Array.from(visible) : null);
  }, [bounds?.minLat, bounds?.minLng, bounds?.maxLat, bounds?.maxLng]); // eslint-disable-line react-hooks/exhaustive-deps
}

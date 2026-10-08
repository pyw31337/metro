"use client";

import { useEffect, useState } from "react";
import { transitRealtimeService, SimStatus } from "@/services/TransitRealtimeService";
import { getSeoulApiIssue, onSeoulApiIssue, type SeoulApiIssue } from "@/services/seoulApi";

export function useSimStatus(): SimStatus {
  const [status, setStatus] = useState<SimStatus>(() => transitRealtimeService.simStatus);
  useEffect(() => {
    const handler = (s: SimStatus) => setStatus(s);
    transitRealtimeService.on("simStatus", handler);
    return () => { transitRealtimeService.off("simStatus", handler); };
  }, []);
  return status;
}

/** 서울 실시간 API 상태(호출 한도 초과, 키 오류, 연결 실패, 샘플 키) */
export function useSeoulApiIssue(): SeoulApiIssue {
  const [issue, setIssue] = useState<SeoulApiIssue>(() => getSeoulApiIssue());
  useEffect(() => onSeoulApiIssue(setIssue), []);
  return issue;
}

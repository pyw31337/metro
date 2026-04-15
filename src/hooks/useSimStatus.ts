"use client";

import { useEffect, useState } from "react";
import { transitRealtimeService, SimStatus } from "@/services/TransitRealtimeService";

export function useSimStatus(): SimStatus {
  const [status, setStatus] = useState<SimStatus>(() => transitRealtimeService.simStatus);
  useEffect(() => {
    const handler = (s: SimStatus) => setStatus(s);
    transitRealtimeService.on("simStatus", handler);
    return () => { transitRealtimeService.off("simStatus", handler); };
  }, []);
  return status;
}

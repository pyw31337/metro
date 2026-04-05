import { useState, useEffect } from 'react';
import { MetropolitanBusService, BusArrivalItem } from '@/services/busApi';

export function useBusArrivals(stopId: string | null, cityCode: string | null) {
  const [arrivals, setArrvials] = useState<BusArrivalItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stopId || !cityCode) {
      setArrvials([]);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await MetropolitanBusService.fetchArrivals(stopId, cityCode);
        setArrvials(data.sort((a, b) => a.arrivalTime - b.arrivalTime));
      } catch (err) {
        console.error("Bus arrival fetch error", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s refresh

    return () => clearInterval(interval);
  }, [stopId, cityCode]);

  return { arrivals, loading };
}

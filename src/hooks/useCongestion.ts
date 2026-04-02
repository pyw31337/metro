"use client";

import { useState, useEffect } from 'react';
import { fetchStationCongestion, CongestionData } from '@/services/congestionApi';

export const useCongestion = (selectedStationName: string | null) => {
    const [congestionData, setCongestionData] = useState<CongestionData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedStationName) {
            setCongestionData(null);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchStationCongestion(selectedStationName);
                setCongestionData(data);
            } catch (err) {
                setError(String(err));
                setCongestionData(null);
            } finally {
                setLoading(false);
            }
        };

        loadData();
        // Refresh every 5 minutes if popup is open
        const interval = setInterval(loadData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [selectedStationName]);

    return { data: congestionData, loading, error };
};

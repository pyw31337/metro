"use client";

import { useState, useCallback, useEffect } from 'react';
import { DataIngestionService, type IngestionTask } from '@/services/dataIngestion';
import { db } from '@/services/db';

export function useIngestion() {
    const [tasks, setTasks] = useState<IngestionTask[]>([]);
    const [isIngesting, setIsIngesting] = useState(false);

    const startIngestion = useCallback(async () => {
        if (isIngesting) return;
        setIsIngesting(true);
        await DataIngestionService.refreshStaticData((updatedTasks) => {
            setTasks(updatedTasks);
        });
        setIsIngesting(false);
    }, [isIngesting]);

    // Check if ingestion is needed on mount
    useEffect(() => {
        const checkAndStart = async () => {
            // Guard: Only attempt once per session to avoid infinite error loops
            const hasAttempted = sessionStorage.getItem('metro_ingestion_attempted');
            if (hasAttempted) return;

            const count = await db.facilities.count();
            if (count === 0) {
                sessionStorage.setItem('metro_ingestion_attempted', 'true');
                startIngestion();
            }
        };
        checkAndStart();
    }, [startIngestion]);

    return {
        tasks,
        isIngesting,
        startIngestion
    };
}

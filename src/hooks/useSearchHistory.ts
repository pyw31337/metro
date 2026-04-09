"use client";

import { useState, useCallback } from "react";

const STORAGE_KEY = "metro-search-history";
const MAX_HISTORY = 6;

export interface HistoryEntry {
    name: string;
    type: "subway" | "bus";
    lines?: string[];
    id?: string;
}

function loadHistory(): HistoryEntry[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
        return [];
    }
}

function saveHistory(entries: HistoryEntry[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {}
}

export function useSearchHistory() {
    const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

    const addToHistory = useCallback((entry: HistoryEntry) => {
        setHistory(prev => {
            const deduped = prev.filter(h => h.name !== entry.name || h.type !== entry.type);
            const updated = [entry, ...deduped].slice(0, MAX_HISTORY);
            saveHistory(updated);
            return updated;
        });
    }, []);

    const clearHistory = useCallback(() => {
        saveHistory([]);
        setHistory([]);
    }, []);

    return { history, addToHistory, clearHistory };
}

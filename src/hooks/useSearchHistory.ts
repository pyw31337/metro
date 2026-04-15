"use client";

import { useState, useCallback } from "react";

const HISTORY_KEY   = "metro-search-history";
const FAVORITES_KEY = "metro-favorites";
const MAX_HISTORY   = 6;
const MAX_FAVORITES = 8;

export interface HistoryEntry {
    name: string;
    type: "subway" | "bus";
    lines?: string[];
    id?: string;
    pinned?: boolean;
}

function loadHistory(): HistoryEntry[] {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)); }
    catch {}
}

function loadFavorites(): HistoryEntry[] {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); }
    catch { return []; }
}

function saveFavorites(entries: HistoryEntry[]) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(entries)); }
    catch {}
}

export function useSearchHistory() {
    const [history,   setHistory]   = useState<HistoryEntry[]>(() => loadHistory());
    const [favorites, setFavorites] = useState<HistoryEntry[]>(() => loadFavorites());

    const addToHistory = useCallback((entry: HistoryEntry) => {
        setHistory(prev => {
            const deduped = prev.filter(h => h.name !== entry.name || h.type !== entry.type);
            const updated = [{ ...entry, pinned: false }, ...deduped].slice(0, MAX_HISTORY);
            saveHistory(updated);
            return updated;
        });
    }, []);

    const toggleFavorite = useCallback((entry: HistoryEntry) => {
        setFavorites(prev => {
            const exists = prev.some(f => f.name === entry.name && f.type === entry.type);
            const updated = exists
                ? prev.filter(f => !(f.name === entry.name && f.type === entry.type))
                : [{ ...entry, pinned: true }, ...prev].slice(0, MAX_FAVORITES);
            saveFavorites(updated);
            return updated;
        });
    }, []);

    const isFavorite = useCallback((entry: HistoryEntry) =>
        favorites.some(f => f.name === entry.name && f.type === entry.type),
    [favorites]);

    const clearHistory = useCallback(() => {
        saveHistory([]);
        setHistory([]);
    }, []);

    return { history, favorites, addToHistory, toggleFavorite, isFavorite, clearHistory };
}

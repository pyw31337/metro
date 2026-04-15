import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ActiveTab, WCFilters } from '@/types/metro';

// Detect system dark mode preference for first-time visitors
const systemPrefersDark = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
  : false;

interface UIStore {
  activeTab: ActiveTab;
  isDarkMode: boolean;
  isHighContrast: boolean;
  weatherOpen: boolean;
  timeDisplayMode: 'duration' | 'arrival';
  wcFilters: WCFilters;

  setActiveTab: (tab: ActiveTab) => void;
  setIsDarkMode: (v: boolean) => void;
  toggleDarkMode: () => void;
  toggleHighContrast: () => void;
  setWeatherOpen: (v: boolean) => void;
  toggleWeather: () => void;
  setTimeDisplayMode: (m: 'duration' | 'arrival') => void;
  toggleTimeDisplayMode: () => void;
  setWcFilters: (f: WCFilters) => void;
  updateWcFilter: (key: keyof WCFilters, v: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      activeTab: 'subway',
      isDarkMode: systemPrefersDark,
      isHighContrast: false,
      weatherOpen: false,
      timeDisplayMode: 'duration',
      wcFilters: { accessible: false, diapers: false, emergencyBell: false },

      setActiveTab: (tab) => set({ activeTab: tab }),
      setIsDarkMode: (v) => set({ isDarkMode: v }),
      toggleDarkMode: () => set(s => ({ isDarkMode: !s.isDarkMode })),
      toggleHighContrast: () => set(s => ({ isHighContrast: !s.isHighContrast })),
      setWeatherOpen: (v) => set({ weatherOpen: v }),
      toggleWeather: () => set(s => ({ weatherOpen: !s.weatherOpen })),
      setTimeDisplayMode: (m) => set({ timeDisplayMode: m }),
      toggleTimeDisplayMode: () => set(s => ({
        timeDisplayMode: s.timeDisplayMode === 'duration' ? 'arrival' : 'duration'
      })),
      setWcFilters: (f) => set({ wcFilters: f }),
      updateWcFilter: (key, v) => set(s => ({
        wcFilters: { ...s.wcFilters, [key]: v }
      })),
    }),
    {
      name: 'metro-ui-prefs',
      // Only persist user preference fields, not transient UI state
      partialize: (s) => ({
        isDarkMode: s.isDarkMode,
        isHighContrast: s.isHighContrast,
        timeDisplayMode: s.timeDisplayMode,
        wcFilters: s.wcFilters,
      }),
    }
  )
);

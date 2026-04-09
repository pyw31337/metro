import { create } from 'zustand';
import { ActiveTab, WCFilters } from '@/types/metro';

interface UIStore {
  activeTab: ActiveTab;
  isDarkMode: boolean;
  weatherOpen: boolean;
  timeDisplayMode: 'duration' | 'arrival';
  wcFilters: WCFilters;

  setActiveTab: (tab: ActiveTab) => void;
  setIsDarkMode: (v: boolean) => void;
  toggleDarkMode: () => void;
  setWeatherOpen: (v: boolean) => void;
  toggleWeather: () => void;
  setTimeDisplayMode: (m: 'duration' | 'arrival') => void;
  toggleTimeDisplayMode: () => void;
  setWcFilters: (f: WCFilters) => void;
  updateWcFilter: (key: keyof WCFilters, v: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTab: 'subway',
  isDarkMode: false,
  weatherOpen: false,
  timeDisplayMode: 'duration',
  wcFilters: { accessible: false, diapers: false, emergencyBell: false },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsDarkMode: (v) => set({ isDarkMode: v }),
  toggleDarkMode: () => set(s => ({ isDarkMode: !s.isDarkMode })),
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
}));

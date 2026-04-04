import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export type SortOption = 'created_at' | 'name' | 'recently_made' | 'prep_time' | 'random';

interface SettingsState {
  defaultSort: SortOption;
  setDefaultSort: (sort: SortOption) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultSort: 'created_at',
      setDefaultSort: (defaultSort) => set({ defaultSort }),
    }),
    {
      name: 'pulse-settings',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);

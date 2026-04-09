import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { ColorScheme } from '../theme';

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export type SortOption = 'created_at' | 'name' | 'recently_made' | 'prep_time' | 'random';
export type ExerciseSortOption = 'name' | 'created_at';

interface SettingsState {
  defaultSort: SortOption;
  setDefaultSort: (sort: SortOption) => void;
  defaultExerciseSort: ExerciseSortOption;
  setDefaultExerciseSort: (sort: ExerciseSortOption) => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultSort: 'created_at',
      setDefaultSort: (defaultSort) => set({ defaultSort }),
      defaultExerciseSort: 'name',
      setDefaultExerciseSort: (defaultExerciseSort) => set({ defaultExerciseSort }),
      colorScheme: 'blue',
      setColorScheme: (colorScheme) => set({ colorScheme }),
    }),
    {
      name: 'pulse-settings',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);

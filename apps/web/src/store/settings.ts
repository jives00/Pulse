import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortOption = 'random' | 'created_at' | 'name' | 'recently_made' | 'prep_time';
export type ExerciseSortOption = 'name' | 'created_at';
export type ColorScheme = 'blue' | 'slate' | 'sand' | 'midnight' | 'tide' | 'graphite';

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
    { name: 'dram-settings' }
  )
);

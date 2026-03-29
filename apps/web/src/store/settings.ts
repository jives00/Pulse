import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortOption = 'random' | 'created_at' | 'name' | 'recently_made' | 'prep_time';
export type ColorScheme = 'blue' | 'slate';

interface SettingsState {
  defaultSort: SortOption;
  setDefaultSort: (sort: SortOption) => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultSort: 'created_at',
      setDefaultSort: (defaultSort) => set({ defaultSort }),
      colorScheme: 'blue',
      setColorScheme: (colorScheme) => set({ colorScheme }),
    }),
    { name: 'dram-settings' }
  )
);

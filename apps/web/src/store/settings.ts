import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortOption = 'random' | 'created_at' | 'name' | 'recently_made' | 'prep_time';

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
    { name: 'dram-settings' }
  )
);

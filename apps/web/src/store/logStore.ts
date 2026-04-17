import { create } from 'zustand';
import { logApi, waterApi, localDateStr } from '@pulse/api-client';
import type { DailyLog, WaterDay, AddLogEntryPayload, UpdateLogEntryPayload, MealSlot, LogEntry } from '@pulse/api-client';

export function todayStr() {
  return localDateStr();
}

interface LogState {
  currentDate: string;
  dailyLog: DailyLog | null;
  waterDay: WaterDay | null;
  loading: boolean;
  setDate: (date: string) => void;
  fetchDay: (date?: string) => Promise<void>;
  addEntry: (payload: AddLogEntryPayload) => Promise<void>;
  removeEntry: (id: number) => Promise<void>;
  updateEntry: (id: number, payload: UpdateLogEntryPayload) => Promise<void>;
  moveEntry: (id: number, targetMeal: MealSlot, targetDate: string) => Promise<void>;
  copyEntry: (entry: LogEntry, targetMeal: MealSlot, targetDate: string) => Promise<void>;
  copyFromDate: (fromDate: string, meal?: MealSlot) => Promise<void>;
  addWater: (amountOz: number) => Promise<void>;
  removeWater: (id: number) => Promise<void>;
}

export const useLogStore = create<LogState>((set, get) => ({
  currentDate: todayStr(),
  dailyLog: null,
  waterDay: null,
  loading: false,

  setDate: (date) => {
    set({ currentDate: date });
    get().fetchDay(date);
  },

  fetchDay: async (date) => {
    const d = date ?? get().currentDate;
    set({ loading: true });
    try {
      const [log, water] = await Promise.all([
        logApi.getDay(d),
        waterApi.getDay(d),
      ]);
      set({ dailyLog: log, waterDay: water });
    } finally {
      set({ loading: false });
    }
  },

  addEntry: async (payload) => {
    await logApi.add(payload);
    await get().fetchDay();
  },

  removeEntry: async (id) => {
    await logApi.delete(id);
    await get().fetchDay();
  },

  updateEntry: async (id, payload) => {
    await logApi.update(id, payload);
    await get().fetchDay();
  },

  moveEntry: async (id, targetMeal, targetDate) => {
    await logApi.update(id, { meal: targetMeal, logDate: targetDate });
    await get().fetchDay();
  },

  copyEntry: async (entry, targetMeal, targetDate) => {
    await logApi.copyEntry(entry, targetMeal, targetDate);
    await get().fetchDay();
  },

  copyFromDate: async (fromDate, meal) => {
    await logApi.copy({ fromDate, toDate: get().currentDate, meal });
    await get().fetchDay();
  },

  addWater: async (amountOz) => {
    await waterApi.add(get().currentDate, amountOz);
    const water = await waterApi.getDay(get().currentDate);
    set({ waterDay: water });
  },

  removeWater: async (id) => {
    await waterApi.delete(id);
    const water = await waterApi.getDay(get().currentDate);
    set({ waterDay: water });
  },
}));

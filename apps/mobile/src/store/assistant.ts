import { create } from 'zustand';
import type { AssistantScreenContext } from '../api/client';

interface AssistantStore {
  screenContext: AssistantScreenContext | undefined;
  setScreenContext: (ctx: AssistantScreenContext | undefined) => void;
}

export const useAssistantStore = create<AssistantStore>((set) => ({
  screenContext: undefined,
  setScreenContext: (ctx) => set({ screenContext: ctx }),
}));

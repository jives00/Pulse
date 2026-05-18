import { create } from 'zustand';
import type { AssistantScreenContext } from '@pulse/api-client';

interface AssistantStore {
  screenContext: AssistantScreenContext | null;
  setScreenContext: (ctx: AssistantScreenContext | null) => void;
}

export const useAssistantStore = create<AssistantStore>((set) => ({
  screenContext: null,
  setScreenContext: (ctx) => set({ screenContext: ctx }),
}));

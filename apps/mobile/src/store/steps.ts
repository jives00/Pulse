import { create } from 'zustand';

interface StepsState {
  liveSteps: number | null;
  setLiveSteps: (steps: number) => void;
}

export const useStepsStore = create<StepsState>()((set) => ({
  liveSteps: null,
  setLiveSteps: (steps) => set({ liveSteps: steps }),
}));

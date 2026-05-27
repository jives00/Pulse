// RN 0.83 new arch removed CallInvokerHolder::getCallInvoker which every
// audio recording library (expo-av, expo-audio) depends on at init time,
// causing immediate launch crashes. Voice input is handled via keyboard mic.
export function useVoice() {
  return {
    listening: false,
    transcribing: false,
    transcript: '',
    voiceError: null as string | null,
    start: async () => {},
    stop: async () => {},
    cancel: async () => {},
  };
}

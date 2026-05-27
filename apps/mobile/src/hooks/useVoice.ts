// Voice recording via native modules is not available on this platform
// (expo-av and @react-native-voice/voice are both incompatible with RN 0.83 + new arch).
// Use the Android keyboard's built-in microphone button for voice input instead.
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

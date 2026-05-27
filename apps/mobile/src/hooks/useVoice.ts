import { useState, useRef } from 'react';
import { NativeModules } from 'react-native';

// RecognizerIntent-based voice input via custom native module.
// Uses Android's activity system (not JNI audio layer), so it avoids the
// CallInvokerHolder::getCallInvoker removal in RN 0.83 new arch.
export function useVoice() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  async function start() {
    const mod = NativeModules.SpeechRecognizer;
    if (!mod) {
      setVoiceError('Speech recognition not available on this device.');
      return;
    }
    cancelledRef.current = false;
    setTranscript('');
    setVoiceError(null);
    setListening(true);
    try {
      const text: string = await mod.startRecognition();
      if (!cancelledRef.current && text) {
        setTranscript(text);
      }
    } catch (e: unknown) {
      if (!cancelledRef.current) {
        const msg = e instanceof Error ? e.message : String(e);
        setVoiceError(msg);
      }
    } finally {
      setListening(false);
    }
  }

  async function stop() {
    // RecognizerIntent dialog manages its own lifecycle; no explicit stop needed.
    setListening(false);
  }

  async function cancel() {
    cancelledRef.current = true;
    setListening(false);
    setTranscript('');
  }

  return { listening, transcribing: false, transcript, voiceError, start, stop, cancel };
}

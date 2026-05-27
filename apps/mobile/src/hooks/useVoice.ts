import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioRecorder, requestRecordingPermissionsAsync, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { useAuthStore } from '../store/auth';
import { API_BASE } from '../api/config';

const MAX_RECORDING_MS = 30_000;

export function useVoice() {
  const { token } = useAuthStore();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const stop = useCallback(async () => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    if (!listening) return;
    setListening(false);

    try {
      await recorder.stop();
    } catch { /* ignore */ }

    const uri = recorder.uri;
    if (!uri || !token) return;

    setTranscribing(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const response = await fetch(`${API_BASE}/api/ai/assistant/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audio: base64, mimeType: 'audio/mp4' }),
      });
      if (!response.ok) throw new Error('Transcription failed');
      const { transcript: text } = await response.json() as { transcript: string };
      setTranscript(text);
    } catch (err) {
      console.warn('[Voice] transcribe failed', err);
      setVoiceError('Could not transcribe. Try again.');
    } finally {
      setTranscribing(false);
    }
  }, [listening, recorder, token]);

  const start = useCallback(async () => {
    setTranscript('');
    setVoiceError(null);
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setVoiceError('Microphone permission denied. Enable it in Settings.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setListening(true);
      autoStopRef.current = setTimeout(() => stop(), MAX_RECORDING_MS);
    } catch (err) {
      console.warn('[Voice] start failed', err);
      setVoiceError('Could not start recording.');
    }
  }, [recorder, stop]);

  const cancel = useCallback(async () => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    if (listening) {
      try { await recorder.stop(); } catch { /* ignore */ }
      setListening(false);
    }
    setTranscribing(false);
  }, [listening, recorder]);

  return { listening, transcribing, transcript, voiceError, start, stop, cancel };
}

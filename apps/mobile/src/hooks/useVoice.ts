import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useAuthStore } from '../store/auth';
import { API_BASE } from '../api/config';

const MAX_RECORDING_MS = 30_000;

export function useVoice() {
  const { token } = useAuthStore();
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const stop = useCallback(async () => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    const recording = recordingRef.current;
    if (!recording) return;

    setListening(false);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch { /* ignore */ }
    recordingRef.current = null;

    const uri = recording.getURI();
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
      if (!response.ok) throw new Error('Transcription request failed');
      const { transcript: text } = await response.json() as { transcript: string };
      setTranscript(text);
    } catch (err) {
      console.warn('[Voice] transcribe failed', err);
      setVoiceError('Could not transcribe audio. Try again.');
    } finally {
      setTranscribing(false);
    }
  }, [token]);

  const start = useCallback(async () => {
    setTranscript('');
    setVoiceError(null);
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setVoiceError('Microphone permission denied. Enable it in Settings.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setListening(true);
      autoStopRef.current = setTimeout(() => stop(), MAX_RECORDING_MS);
    } catch (err) {
      console.warn('[Voice] start failed', err);
      setVoiceError('Could not start recording.');
    }
  }, [stop]);

  const cancel = useCallback(async () => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    const recording = recordingRef.current;
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch { /* ignore */ }
    recordingRef.current = null;
    setListening(false);
    setTranscribing(false);
  }, []);

  return { listening, transcribing, transcript, voiceError, start, stop, cancel };
}

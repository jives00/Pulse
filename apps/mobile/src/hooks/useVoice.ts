import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone Permission',
      message: 'Pulse needs microphone access to hear your voice.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );
  return status === PermissionsAndroid.RESULTS.GRANTED;
}

export function useVoice() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    Voice.onSpeechStart = () => { setListening(true); setVoiceError(null); };
    Voice.onSpeechEnd = () => setListening(false);
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      setTranscript(e.value?.[0] ?? '');
      setListening(false);
    };
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      console.warn('[Voice] error', e.error);
      setListening(false);
      const code = e.error?.code;
      if (code === '7') {
        setVoiceError('No speech recognized. Try again.');
      } else {
        setVoiceError(`Voice error: ${e.error?.message ?? code ?? 'unknown'}`);
      }
    };
    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => {});
    };
  }, []);

  const start = useCallback(async () => {
    setTranscript('');
    setVoiceError(null);
    const allowed = await requestMicPermission();
    if (!allowed) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    try {
      await Voice.start('en-US');
    } catch (err: unknown) {
      console.warn('[Voice] start failed', err);
      setListening(false);
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceError(`Could not start voice: ${msg}`);
    }
  }, []);

  const stop = useCallback(async () => {
    try { await Voice.stop(); } catch { /* ignore */ }
  }, []);

  const cancel = useCallback(async () => {
    try { await Voice.cancel(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  return { listening, transcript, permissionDenied, voiceError, start, stop, cancel };
}

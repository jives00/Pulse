import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { login } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { resetApiBase, resolveApiBase } from '../../src/api/apiBase';
import { recoverSession } from '../../src/api/session';
import { fontSize, type Colors } from '../../src/theme';
import { useColors } from '../../src/hooks/useColors';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [errorIsCredentials, setErrorIsCredentials] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const router = useRouter();
  const c = useColors();
  const styles = makeStyles(c);

  // Only a 401 from /auth/login may accuse the password. An unreachable NAS, a
  // disconnected Tailscale, a timeout or a 429 from the login limiter each get their own
  // message, and only the credentials case renders in the error colour — otherwise a
  // network blip reads as a typo and gets retried until it becomes a real lockout.
  function describeLoginError(e: any): { message: string; credentials: boolean } {
    const status = e?.response?.status;
    if (status === 401) return { message: 'Invalid username or password', credentials: true };
    if (status === 429) return { message: 'Too many attempts — wait a few minutes and try again.', credentials: false };
    if (status >= 500) return { message: 'The server hit an error. Try again in a moment.', credentials: false };
    if (status) return { message: e?.message || `Request failed (${status})`, credentials: false };
    return {
      message: "Can't reach the server — check Tailscale or the home wifi.",
      credentials: false,
    };
  }

  function fail(e: any) {
    const { message, credentials } = describeLoginError(e);
    setError(message);
    setErrorIsCredentials(credentials);
  }

  async function handleLogin() {
    if (!username || !password) return;
    setLoading(true);
    setError('');
    try {
      const { token } = await login(username, password);
      setToken(token);
      router.replace('/(app)');
    } catch (e: any) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }

  // Re-run what a force-close used to do: re-probe the API bases and ask for a
  // passwordless session. On the home LAN or Tailscale this signs straight in.
  async function handleRetry() {
    setRetrying(true);
    setError('');
    try {
      resetApiBase();
      const base = await resolveApiBase();
      if (!base) {
        setError("Still can't reach the server — check Tailscale or the home wifi.");
        setErrorIsCredentials(false);
        return;
      }
      const token = await recoverSession();
      if (token) {
        router.replace('/(app)');
        return;
      }
      setError('Connected, but this network needs a password.');
      setErrorIsCredentials(false);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <Text style={styles.title}>Pulse</Text>
      <Text style={styles.subtitle}>Your health companion</Text>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, { marginBottom: 0, flex: 1 }]}
            placeholder="Password"
            placeholderTextColor={c.muted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>
        {error ? (
          <Text style={[styles.error, !errorIsCredentials && styles.errorMuted]}>{error}</Text>
        ) : null}
        <TouchableOpacity onPress={handleLogin} disabled={loading} style={styles.button}>
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRetry} disabled={retrying} style={styles.retryBtn}>
          <Text style={styles.retryText}>
            {retrying ? 'Reconnecting…' : 'Retry connection'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    title: { color: c.accent, fontSize: fontSize['4xl'], fontWeight: 'bold', marginBottom: 8 },
    subtitle: { color: c.muted, fontSize: fontSize.sm, marginBottom: 40 },
    form: { width: '100%', gap: 12 },
    input: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: c.text, fontSize: fontSize.base },
    error: { color: c.error, fontSize: fontSize.sm, textAlign: 'center' },
    errorMuted: { color: c.muted },
    retryBtn: { alignItems: 'center', paddingVertical: 10 },
    retryText: { color: c.muted, fontSize: fontSize.sm, textDecorationLine: 'underline' },
    passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12 },
    eyeBtn: { paddingHorizontal: 12 },
    eyeIcon: { fontSize: 18 },
    button: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    buttonText: { color: c.bg, fontWeight: 'bold', fontSize: fontSize.base },
  });
}

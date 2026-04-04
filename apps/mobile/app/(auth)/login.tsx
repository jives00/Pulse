import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { login } from '../../src/api/client';
import { API_BASE } from '../../src/api/config';
import { useAuthStore } from '../../src/store/auth';
import { colors, fontSize } from '../../src/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const router = useRouter();

  async function handleLogin() {
    if (!username || !password) return;
    setLoading(true);
    setError('');
    try {
      const { token } = await login(username, password);
      setToken(token);
      router.replace('/(app)');
    } catch (e: any) {
      setDebugInfo(`${API_BASE} — ${e?.message ?? String(e)}`);
      setError(e.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <Text style={styles.title}>Pulse</Text>
      <Text style={styles.subtitle}>Your health companion</Text>
      <Text style={{ color: 'yellow', fontSize: 10, marginBottom: 8 }}>{API_BASE}</Text>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, { marginBottom: 0, flex: 1 }]}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>
        {debugInfo ? <Text style={{ color: 'yellow', fontSize: 10, textAlign: 'center' }}>{debugInfo}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity onPress={handleLogin} disabled={loading} style={styles.button}>
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { color: colors.accent, fontSize: fontSize['4xl'], fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, marginBottom: 40 },
  form: { width: '100%', gap: 12 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: fontSize.base },
  error: { color: colors.error, fontSize: fontSize.xs, textAlign: 'center' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  eyeBtn: { paddingHorizontal: 12 },
  eyeIcon: { fontSize: 18 },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: colors.bg, fontWeight: 'bold', fontSize: fontSize.base },
});

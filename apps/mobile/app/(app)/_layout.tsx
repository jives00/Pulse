import { Stack } from 'expo-router';
import { useColors } from '../../src/hooks/useColors';

export default function AppLayout() {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="routine/[id]" />
      <Stack.Screen name="workout/[id]" />
      <Stack.Screen name="exercise/[id]" />
      <Stack.Screen name="recipe/[id]" />
      <Stack.Screen name="recipe/edit" />
    </Stack>
  );
}

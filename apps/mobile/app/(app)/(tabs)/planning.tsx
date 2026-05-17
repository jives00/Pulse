import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../../../src/hooks/useColors';

export default function PlanningScreen() {
  const c = useColors();
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Text style={[styles.title, { color: c.text }]}>Planning</Text>
      <Text style={[styles.sub, { color: c.muted }]}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  sub:       { fontSize: 15 },
});

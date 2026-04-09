import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { fontSize, type Colors } from '../theme';
import { useColors } from '../hooks/useColors';

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
}

export default function FilterChip({ label, active, onPress }: Props) {
  const c = useColors();
  const styles = makeStyles(c);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active ? styles.active : styles.inactive]}
    >
      <Text style={[styles.label, active ? styles.activeLabel : styles.inactiveLabel]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
    active: { backgroundColor: c.accent, borderColor: c.accent },
    inactive: { backgroundColor: 'transparent', borderColor: c.border },
    label: { fontSize: fontSize.xs, fontWeight: '600' },
    activeLabel: { color: c.bg },
    inactiveLabel: { color: c.muted },
  });
}

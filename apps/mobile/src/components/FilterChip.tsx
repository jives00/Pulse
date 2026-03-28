import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fontSize } from '../theme';

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
}

export default function FilterChip({ label, active, onPress }: Props) {
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

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  inactive: { backgroundColor: 'transparent', borderColor: colors.border },
  label: { fontSize: fontSize.xs, fontWeight: '600' },
  activeLabel: { color: colors.bg },
  inactiveLabel: { color: colors.muted },
});

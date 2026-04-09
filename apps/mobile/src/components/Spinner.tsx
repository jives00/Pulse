import { ActivityIndicator, View } from 'react-native';
import { useColors } from '../hooks/useColors';

export default function Spinner() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator size="large" color={c.accent} />
    </View>
  );
}

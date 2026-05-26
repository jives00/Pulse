import { PALETTES, type Colors } from '../theme';
import { useSettingsStore } from '../store/settings';

export function useColors(): Colors {
  const colorScheme = useSettingsStore((s) => s.colorScheme);
  return PALETTES[colorScheme] as Colors;
}

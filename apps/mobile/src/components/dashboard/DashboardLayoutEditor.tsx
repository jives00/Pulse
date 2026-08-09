// Settings › Dashboard editor UI. Editing happens here rather than in place on the
// dashboard — an overlay on a phone-sized card is too cramped for reorder/visibility/
// tab controls. Renders one reorderable list per dashboard tab (Today/Goals/Trends/
// Sessions): ↑/↓ buttons instead of drag (there's no good drag gesture on a scrolling
// phone list), a visibility Switch, and a small "move to tab" picker. Purely
// presentational — all mutation goes through the callbacks the settings screen passes,
// which apply mobileLayoutReducer functions and persist (debounced) via the store.

import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  WIDGET_BY_KEY,
  type DashboardWidgetKey, type EnabledFeatures, type LayoutEntry,
} from '../../../../../packages/api-client/src/index';
import { fontSize, type Colors } from '../../theme';
import { useColors } from '../../hooks/useColors';
import { isWidgetEditable } from './mobileLayoutReducer';
import { TAB_ORDER, TAB_LABELS, type Tab } from './dashboardTabs';

interface Props {
  /** Full merged widget list (every catalog key, including feature-disabled ones). */
  layout: LayoutEntry[];
  features: EnabledFeatures;
  onMoveUp: (key: DashboardWidgetKey) => void;
  onMoveDown: (key: DashboardWidgetKey) => void;
  onToggleVisible: (key: DashboardWidgetKey, visible: boolean) => void;
  onSetTab: (key: DashboardWidgetKey, tab: Tab) => void;
  onReset: () => void;
}

function WidgetRow({ entry, isFirst, isLast, onMoveUp, onMoveDown, onToggleVisible, onSetTab, c, s }: {
  entry: LayoutEntry; isFirst: boolean; isLast: boolean;
  onMoveUp: () => void; onMoveDown: () => void;
  onToggleVisible: (visible: boolean) => void;
  onSetTab: (tab: Tab) => void;
  c: Colors; s: ReturnType<typeof makeStyles>;
}) {
  const widget = WIDGET_BY_KEY[entry.key];
  return (
    <View style={s.row}>
      <View style={s.rowTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.rowLabel}>{widget.label}</Text>
          <Text style={s.rowDesc}>{widget.description}</Text>
        </View>
        <Switch
          value={entry.visible}
          onValueChange={onToggleVisible}
          trackColor={{ false: c.border, true: c.accent }}
          thumbColor={c.card}
        />
      </View>
      <View style={s.rowBottom}>
        <View style={s.moveBtns}>
          <TouchableOpacity style={[s.moveBtn, isFirst && s.moveBtnDisabled]} onPress={onMoveUp} disabled={isFirst}>
            <Text style={[s.moveBtnText, isFirst && s.moveBtnTextDisabled]}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.moveBtn, isLast && s.moveBtnDisabled]} onPress={onMoveDown} disabled={isLast}>
            <Text style={[s.moveBtnText, isLast && s.moveBtnTextDisabled]}>↓</Text>
          </TouchableOpacity>
        </View>
        <View style={s.tabPicker}>
          {TAB_ORDER.filter((t) => t !== entry.tab).map((t) => (
            <TouchableOpacity key={t} style={s.tabChip} onPress={() => onSetTab(t)}>
              <Text style={s.tabChipText}>→ {TAB_LABELS[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

export function DashboardLayoutEditor({ layout, features, onMoveUp, onMoveDown, onToggleVisible, onSetTab, onReset }: Props) {
  const c = useColors();
  const s = makeStyles(c);

  const editable = layout.filter((w) => isWidgetEditable(w, features));
  if (!editable.length) {
    return (
      <View style={s.card}>
        <Text style={s.emptyText}>Turn on a feature module to customize the dashboard.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {TAB_ORDER.map((tab) => {
        const tabWidgets = editable.filter((w) => w.tab === tab);
        if (!tabWidgets.length) return null;
        return (
          <View key={tab}>
            <Text style={s.sectionLabel}>{TAB_LABELS[tab]}</Text>
            <View style={s.card}>
              {tabWidgets.map((entry, i) => (
                <View key={entry.key}>
                  {i > 0 && <View style={s.divider} />}
                  <WidgetRow
                    entry={entry}
                    isFirst={i === 0}
                    isLast={i === tabWidgets.length - 1}
                    onMoveUp={() => onMoveUp(entry.key)}
                    onMoveDown={() => onMoveDown(entry.key)}
                    onToggleVisible={(v) => onToggleVisible(entry.key, v)}
                    onSetTab={(t) => onSetTab(entry.key, t)}
                    c={c}
                    s={s}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={s.resetBtn} onPress={onReset}>
        <Text style={s.resetBtnText}>Reset to default</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    sectionLabel: { fontSize: fontSize.sm, color: c.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, gap: 0 },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 10 },
    row: { gap: 10 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowLabel: { fontSize: fontSize.base, fontWeight: '600', color: c.text },
    rowDesc: { fontSize: fontSize.sm, color: c.muted, marginTop: 2 },
    rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    moveBtns: { flexDirection: 'row', gap: 6 },
    moveBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    moveBtnDisabled: { opacity: 0.35 },
    moveBtnText: { fontSize: fontSize.base, fontWeight: '700', color: c.text },
    moveBtnTextDisabled: { color: c.muted },
    tabPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
    tabChip: { borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 5 },
    tabChipText: { fontSize: 11, color: c.muted },
    resetBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
    resetBtnText: { fontSize: fontSize.sm, color: '#ef4444', fontWeight: '600' },
    emptyText: { fontSize: fontSize.sm, color: c.muted },
  });
}

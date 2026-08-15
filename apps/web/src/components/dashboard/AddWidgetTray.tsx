// Tray of hidden-but-editable widgets shown at the bottom of the dashboard while in
// customize mode, so a widget the user hid can be found and restored.

import { WIDGET_BY_KEY, type LayoutEntry } from '@pulse/api-client';
import { ACCENT, CARD, LINE, MUTED, MUTED2, TEXT } from '../../utils/dashboardTheme';
import { T } from '../../utils/typeScale';


export function AddWidgetTray({ hidden, onShow }: { hidden: LayoutEntry[]; onShow: (key: LayoutEntry['key']) => void }) {
  if (!hidden.length) return null;
  return (
    <div style={{ padding: '8px 36px 32px' }}>
      <div className="text-base font-semibold uppercase tracking-wider" style={{ marginBottom: 12, color: MUTED }}>
        Hidden widgets
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {hidden.map((entry) => {
          const widget = WIDGET_BY_KEY[entry.key];
          return (
            <div key={entry.key} style={{ background: CARD, border: `1px dashed ${LINE}`, borderRadius: 4, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: T.body, color: TEXT, fontWeight: 600 }}>{widget.label}</div>
              <div style={{ fontSize: T.small, color: MUTED2, flex: 1 }}>{widget.description}</div>
              <button
                type="button"
                onClick={() => onShow(entry.key)}
                style={{ alignSelf: 'flex-start', background: 'none', border: `1px solid ${ACCENT}`, color: ACCENT, borderRadius: 4, fontSize: T.small, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
              >
                + Add back
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: T.small, color: MUTED, marginTop: 10 }} className="font-mono">
        Hidden widgets keep their spot — showing one restores it where it was.
      </div>
    </div>
  );
}

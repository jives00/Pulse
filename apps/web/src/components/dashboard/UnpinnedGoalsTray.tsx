// Tray of active-but-unpinned goals shown at the bottom of the dashboard while in
// customize mode, below the hidden-widgets tray, so a goal that isn't on the
// dashboard can be found and pinned without leaving the page. Reuses AddWidgetTray's
// card styling but lives in its own component — pinning goals is a different concern
// (a different collection, a different API call) from showing/hiding widgets.

import { type Goal, type GoalCategory } from '@pulse/api-client';
import { ACCENT, CARD, LINE, MUTED, MUTED2, TEXT } from '../../utils/dashboardTheme';
import { T } from '../../utils/typeScale';


const CATEGORY_LABEL: Record<GoalCategory, string> = {
  body: 'Body', nutrition: 'Nutrition', exercise: 'Exercise', activity: 'Activity',
};

export function UnpinnedGoalsTray({ goals, onPin }: { goals: Goal[]; onPin: (id: number) => void }) {
  if (!goals.length) return null;
  return (
    <div style={{ padding: '8px 36px 32px' }}>
      <div className="text-base font-semibold uppercase tracking-wider" style={{ marginBottom: 12, color: MUTED }}>
        Unpinned goals
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {goals.map((g) => (
          <div key={g.id} style={{ background: CARD, border: `1px dashed ${LINE}`, borderRadius: 4, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: T.body, color: TEXT, fontWeight: 600 }}>{g.name}</div>
            <div className="font-mono" style={{ fontSize: T.small, color: MUTED2, flex: 1 }}>{CATEGORY_LABEL[g.category] ?? g.category}</div>
            <button
              type="button"
              onClick={() => onPin(g.id)}
              style={{ alignSelf: 'flex-start', background: 'none', border: `1px solid ${ACCENT}`, color: ACCENT, borderRadius: 4, fontSize: T.small, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >
              + Pin to dashboard
            </button>
          </div>
        ))}
      </div>
      <div className="font-mono" style={{ fontSize: T.small, color: MUTED2, marginTop: 10 }}>
        Pinning adds the goal to the end of the dashboard — drag or use ↑/↓ to reposition it.
      </div>
    </div>
  );
}

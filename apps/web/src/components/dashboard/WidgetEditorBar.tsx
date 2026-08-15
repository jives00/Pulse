// Overlay toolbar shown on a widget while the dashboard is in customize mode.
// Purely presentational — DashboardPage supplies the handlers, which go through the
// pure helpers in layoutReducer.ts.

import { SPAN_OPTIONS, WIDGET_GROUPS, type SpanOption, type WidgetGroup } from '@pulse/api-client';
import { ACCENT, LINE, MUTED, MUTED2, TEXT } from '../../utils/dashboardTheme';
import { T } from '../../utils/typeScale';


const SPAN_LABEL: Record<SpanOption, string> = { 4: '⅓', 6: '½', 8: '⅔', 12: 'Full' };

export function WidgetEditorBar({
  label, span, minSpan, section, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onSetSpan, onSetSection, onHide,
}: {
  label: string;
  span: number;
  minSpan: number;
  section: WidgetGroup;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetSpan: (span: number) => void;
  onSetSection: (section: WidgetGroup) => void;
  onHide: () => void;
}) {
  const btnStyle: React.CSSProperties = {
    background: 'none', border: `1px solid ${LINE}`, borderRadius: 4, color: MUTED,
    fontSize: T.label, lineHeight: 1, padding: '4px 7px', cursor: 'pointer',
  };
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        background: 'rgba(0,0,0,0.35)', borderBottom: `1px solid ${LINE}`,
        fontFamily: 'var(--font-mono)', cursor: 'default', userSelect: 'none' as const,
      }}
    >
      <span title="Drag to reorder" style={{ cursor: 'grab', color: MUTED2, fontSize: T.body, paddingRight: 2 }}>⠿</span>
      <span style={{ fontSize: T.small, color: TEXT, marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>

      {/* A select rather than chips: six sections is more than the bar has room for,
          and unlike the ↑/↓ buttons this is a jump, not a nudge. */}
      <select
        value={section}
        onChange={(e) => onSetSection(e.target.value as WidgetGroup)}
        title="Move to section"
        style={{
          ...btnStyle, cursor: 'pointer', maxWidth: 132, marginRight: 2,
          appearance: 'auto' as const, fontFamily: 'inherit',
        }}
      >
        {WIDGET_GROUPS.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>

      <button type="button" disabled={!canMoveUp} onClick={onMoveUp} style={{ ...btnStyle, opacity: canMoveUp ? 1 : 0.35 }} title="Move up">↑</button>
      <button type="button" disabled={!canMoveDown} onClick={onMoveDown} style={{ ...btnStyle, opacity: canMoveDown ? 1 : 0.35 }} title="Move down">↓</button>

      <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
        {SPAN_OPTIONS.map((opt) => {
          const disabled = opt < minSpan;
          const active = opt === span;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onSetSpan(opt)}
              title={`${SPAN_LABEL[opt]} width`}
              style={{
                ...btnStyle,
                minWidth: 26,
                opacity: disabled ? 0.3 : 1,
                borderColor: active ? ACCENT : LINE,
                color: active ? ACCENT : MUTED,
              }}
            >
              {SPAN_LABEL[opt]}
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onHide} style={{ ...btnStyle, marginLeft: 4 }} title="Hide widget">👁</button>
    </div>
  );
}

// Overlay toolbar shown on a goal card while the dashboard is in customize mode.
// Mirrors WidgetEditorBar's visual language exactly — same drag handle, ↑/↓ buttons,
// span chips — plus a ⚙ card-options toggle and an unpin button that WidgetEditorBar
// has no equivalent for. Purely presentational; DashboardPage supplies the handlers,
// which go through the pure helpers in goalOrderReducer.ts.

import { SPAN_OPTIONS, type SpanOption } from '@pulse/api-client';

const ACCENT = 'rgb(var(--color-accent))';
const MUTED  = 'rgb(var(--color-muted))';
const MUTED2 = 'rgba(var(--color-muted) / 0.55)';
const LINE   = 'rgb(var(--color-border))';

const SPAN_LABEL: Record<SpanOption, string> = { 4: '⅓', 6: '½', 8: '⅔', 12: 'Full' };

export function GoalEditorBar({
  label, span, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onSetSpan, onUnpin, onToggleOptions, optionsOpen,
}: {
  label: string;
  span: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSetSpan: (span: number) => void;
  onUnpin: () => void;
  onToggleOptions: () => void;
  optionsOpen: boolean;
}) {
  const btnStyle: React.CSSProperties = {
    background: 'none', border: `1px solid ${LINE}`, borderRadius: 4, color: MUTED,
    fontSize: 11, lineHeight: 1, padding: '4px 7px', cursor: 'pointer',
  };
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        background: 'rgba(0,0,0,0.35)', borderBottom: `1px solid ${LINE}`,
        fontFamily: 'var(--font-mono)', cursor: 'default', userSelect: 'none' as const,
      }}
    >
      <span title="Drag to reorder" style={{ cursor: 'grab', color: MUTED2, fontSize: 13, paddingRight: 2 }}>⠿</span>
      <span style={{ fontSize: 11, color: 'white', marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>

      <button type="button" disabled={!canMoveUp} onClick={onMoveUp} style={{ ...btnStyle, opacity: canMoveUp ? 1 : 0.35 }} title="Move up">↑</button>
      <button type="button" disabled={!canMoveDown} onClick={onMoveDown} style={{ ...btnStyle, opacity: canMoveDown ? 1 : 0.35 }} title="Move down">↓</button>

      <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
        {SPAN_OPTIONS.map((opt) => {
          const active = opt === span;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSetSpan(opt)}
              title={`${SPAN_LABEL[opt]} width`}
              style={{
                ...btnStyle,
                minWidth: 26,
                borderColor: active ? ACCENT : LINE,
                color: active ? ACCENT : MUTED,
              }}
            >
              {SPAN_LABEL[opt]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggleOptions}
        style={{ ...btnStyle, marginLeft: 4, borderColor: optionsOpen ? ACCENT : LINE, color: optionsOpen ? ACCENT : MUTED }}
        title="Card options"
      >⚙</button>
      <button type="button" onClick={onUnpin} style={{ ...btnStyle, marginLeft: 4 }} title="Unpin from dashboard">📌</button>
    </div>
  );
}

// Mini line chart with optional projection tail(s) — shared by the dashboard's own
// widgets and the goal cards under src/components/goals/. Extracted unchanged from
// dashboard.tsx so both call sites share one implementation.
import { View, useWindowDimensions } from 'react-native';

export const CHART_H = 56;
export const DOT_R = 2.5;

export function MiniLineChart({ data, projection, projection2, color, projectionColor, projection2Color, goalLine, maxOverride, minOverride }: {
  data: number[]; projection?: number[]; projection2?: number[]; color: string; projectionColor?: string; projection2Color?: string; goalLine?: number | null; maxOverride?: number; minOverride?: number;
}) {
  const projColor = projectionColor ?? '#818cf8';
  const proj2Color = projection2Color ?? '#f97316';
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 56;
  const allVals = [...data, ...(projection ?? []), ...(projection2 ?? [])];
  const maxVal = maxOverride ?? Math.max(...allVals, goalLine ?? 0, 1);
  const minVal = minOverride ?? 0;
  const range = maxVal - minVal || 1;
  const total = data.length + Math.max((projection?.length ?? 0), (projection2?.length ?? 0));
  if (data.length < 2) return <View style={{ height: CHART_H }} />;

  const X = (i: number) => (i / (total - 1)) * chartWidth;
  const Y = (v: number) => CHART_H - DOT_R - Math.max(((v - minVal) / range) * (CHART_H - DOT_R * 2), 0);

  const actualPts = data.map((v, i) => ({ x: X(i), y: Y(v), v }));
  const projPts  = (projection  ?? []).map((v, i) => ({ x: X(data.length - 1 + i + 1), y: Y(v), v }));
  const proj2Pts = (projection2 ?? []).map((v, i) => ({ x: X(data.length - 1 + i + 1), y: Y(v), v }));

  const goalY = goalLine != null ? Y(goalLine) : null;

  function renderSegments(pts: { x: number; y: number }[], col: string) {
    return pts.map((pt, i) => {
      if (i === pts.length - 1) return null;
      const next = pts[i + 1];
      const dx = next.x - pt.x; const dy = next.y - pt.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return (
        <View key={i} style={{ position: 'absolute', left: pt.x, top: pt.y - 0.75, width: len, height: 1.5, backgroundColor: col, transformOrigin: 'left center', transform: [{ rotate: `${angle}deg` }] }} />
      );
    });
  }

  return (
    <View style={{ height: CHART_H, width: chartWidth, position: 'relative' }}>
      {goalY != null && <View style={{ position: 'absolute', left: 0, top: goalY - 0.5, width: chartWidth, height: 1, borderStyle: 'dashed', borderTopWidth: 1, borderColor: `${color}44` }} />}
      {renderSegments(actualPts, `${color}99`)}
      {projPts.length > 0 && renderSegments([actualPts.at(-1)!, ...projPts], `${projColor}99`)}
      {actualPts.map((pt, i) => (
        <View key={i} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: i === actualPts.length - 1 ? color : `${color}88` }} />
      ))}
      {projPts.map((pt, i) => (
        <View key={`p${i}`} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: `${projColor}66` }} />
      ))}
      {proj2Pts.length > 0 && renderSegments([actualPts.at(-1)!, ...proj2Pts], `${proj2Color}99`)}
      {proj2Pts.map((pt, i) => (
        <View key={`p2${i}`} style={{ position: 'absolute', left: pt.x - DOT_R, top: pt.y - DOT_R, width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R, backgroundColor: `${proj2Color}66` }} />
      ))}
    </View>
  );
}

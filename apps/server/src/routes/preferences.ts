import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import {
  resolveFeatures,
  FEATURE_KEYS,
  type EnabledFeatures,
  type StoredDashboardLayout,
} from '@pulse/api-client';
import type { RowDataPacket } from 'mysql2/promise';

const router = Router();

// Built from FEATURE_KEYS so it stays in sync with the catalog automatically.
const enabledFeaturesSchema = z.object(
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().optional()]))
);

// Loose — resolveLayout sanitizes spans/keys/visibility on read. We only guard shape.
const layoutWidgetSchema = z.object({
  key:     z.string(),
  span:    z.number().optional(),
  visible: z.boolean().optional(),
  tab:     z.string().optional(),
});
const layoutHalfSchema = z.object({
  v:       z.number().optional(),
  widgets: z.array(layoutWidgetSchema).optional(),
}).partial();
const dashboardLayoutSchema = z.object({
  web:    layoutHalfSchema.optional(),
  mobile: layoutHalfSchema.optional(),
}).partial();

const updateSchema = z.object({
  enabledFeatures: enabledFeaturesSchema.optional(),
  dashboardLayout: dashboardLayoutSchema.optional(),
});

// mysql2 may return JSON columns already parsed as objects, or as strings, depending
// on driver config — handle both defensively.
function parseJsonColumn(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  return typeof v === 'string' ? JSON.parse(v) : (v as Record<string, unknown>);
}

// GET /api/preferences
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT enabled_features, dashboard_layout FROM users WHERE id = ?',
      [req.userId]
    );
    const u = rows[0] ?? {};
    const enabledFeatures = resolveFeatures(parseJsonColumn(u.enabled_features) as Partial<EnabledFeatures> | null);
    const dashboardLayout = (parseJsonColumn(u.dashboard_layout) ?? {}) as StoredDashboardLayout;
    res.json({ enabledFeatures, dashboardLayout });
  } catch (err) {
    console.error('[preferences] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/preferences — partial update, merged over the stored value.
router.put('/', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid preferences payload' });
    return;
  }
  const { enabledFeatures: featuresPatch } = parsed.data;
  // zod's inferred `v?: number` is widened from the catalog's literal `1` — cast back
  // to the catalog shape; resolveLayout sanitizes the actual values on read regardless.
  const layoutPatch = parsed.data.dashboardLayout as StoredDashboardLayout | undefined;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT enabled_features, dashboard_layout FROM users WHERE id = ?',
      [req.userId]
    );
    const u = rows[0] ?? {};
    const storedFeatures = parseJsonColumn(u.enabled_features) as Partial<EnabledFeatures> | null;
    const storedLayout = (parseJsonColumn(u.dashboard_layout) ?? {}) as StoredDashboardLayout;

    const mergedFeatures: Partial<EnabledFeatures> | null = featuresPatch
      ? { ...(storedFeatures ?? {}), ...featuresPatch }
      : storedFeatures;

    // Merge per-platform so a PUT with only `web` never wipes `mobile`.
    const mergedLayout: StoredDashboardLayout = layoutPatch
      ? {
          ...storedLayout,
          ...(layoutPatch.web    !== undefined ? { web:    layoutPatch.web }    : {}),
          ...(layoutPatch.mobile !== undefined ? { mobile: layoutPatch.mobile } : {}),
        }
      : storedLayout;

    await pool.query(
      'UPDATE users SET enabled_features = ?, dashboard_layout = ? WHERE id = ?',
      [
        mergedFeatures ? JSON.stringify(mergedFeatures) : null,
        Object.keys(mergedLayout).length ? JSON.stringify(mergedLayout) : null,
        req.userId,
      ]
    );

    res.json({
      enabledFeatures: resolveFeatures(mergedFeatures),
      dashboardLayout: mergedLayout,
    });
  } catch (err) {
    console.error('[preferences] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

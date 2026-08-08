import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { resolveFeatures } from '@pulse/api-client';
import type { RowDataPacket } from 'mysql2/promise';

// Loads users.enabled_features for req.userId and assigns the resolved map to
// req.features. Per-request only — NO cross-request cache, so a toggle flipped in
// PUT /api/preferences takes effect on the very next request. Requires requireAuth
// to have already set req.userId. Only mount on routes that actually gate on features
// (aggregates: TDEE, goals-v2 list/nudges, export, ai-assistant) — never blanket-applied.
export async function loadFeatures(req: Request, res: Response, next: NextFunction) {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT enabled_features FROM users WHERE id = ?',
      [req.userId]
    );
    const stored = rows[0]?.enabled_features;
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    req.features = resolveFeatures(parsed);
    next();
  } catch (err) {
    console.error('[features] error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

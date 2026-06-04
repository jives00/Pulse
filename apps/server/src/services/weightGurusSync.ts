import axios from 'axios';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database';
import { env } from '../config/env';

const LOGIN_URL = 'https://api.weightgurus.com/v3/account/login';
const OPS_URL   = 'https://api.weightgurus.com/v3/operation/';
const SCALE     = 10.0;

const FIELD_MAP: Record<string, { metric: string; unit: string }> = {
  weight:     { metric: 'weight',      unit: 'lb' },
  bodyFat:    { metric: 'body_fat',    unit: '%'  },
  muscleMass: { metric: 'muscle_mass', unit: '%'  },
  water:      { metric: 'water',       unit: '%'  },
  bmi:        { metric: 'bmi',         unit: ''   },
};

async function wgLogin(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ email, password });
  const resp = await axios.post(LOGIN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });
  const token = resp.data.accessToken ?? resp.data.token ?? resp.data.auth_token;
  if (!token) throw new Error(`No token in WeightGurus login response`);
  return token as string;
}

async function wgFetch(token: string, daysBack: number): Promise<Record<string, unknown>[]> {
  const startMs = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const resp = await axios.get(OPS_URL, {
    params: { startDate: startMs },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
  });
  const data = resp.data;
  const ops: Record<string, unknown>[] = Array.isArray(data) ? data : (data.operations ?? []);
  return ops.filter((o) => o.operationType === 'create');
}

export async function syncWeightGurus(daysBack = 7): Promise<{ inserted: number }> {
  const { WG_EMAIL: email, WG_PASSWORD: password, WG_USER_ID: userId } = env;
  if (!email || !password) throw new Error('WG_EMAIL and WG_PASSWORD must be set in .env');

  const token  = await wgLogin(email, password);
  const entries = await wgFetch(token, daysBack);
  if (!entries.length) return { inserted: 0 };

  const [existingRows] = await pool.query<RowDataPacket[]>(
    'SELECT metric, measured_at FROM body_measurements WHERE user_id = ?',
    [userId],
  );
  const existing = new Set(
    existingRows.map((r) => `${r.metric}|${String(r.measured_at).slice(0, 10)}`),
  );

  const rows: [number, string, number, string, string][] = [];
  for (const entry of entries) {
    const ts = entry.entryTimestamp as string | undefined;
    if (!ts) continue;
    const measuredAt = ts.slice(0, 10);

    for (const [field, { metric, unit }] of Object.entries(FIELD_MAP)) {
      const raw = entry[field] as number | null | undefined;
      if (raw == null || raw === 0) continue;
      if (existing.has(`${metric}|${measuredAt}`)) continue;
      rows.push([userId, metric, Math.round((raw / SCALE) * 10) / 10, unit, measuredAt]);
    }
  }

  if (rows.length) {
    await pool.query(
      'INSERT INTO body_measurements (user_id, metric, value, unit, measured_at) VALUES ?',
      [rows],
    );
  }

  return { inserted: rows.length };
}

import { pool } from '../config/database';
import { env } from '../config/env';
import axios from 'axios';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// ── Types ────────────────────────────────────────────────────

interface FoodResult {
  id: number;
  barcode?: string;
  name: string;
  brand?: string;
  source: 'custom' | 'open_food_facts' | 'usda';
  isCustom: boolean;
  nutrition: { calories: number; carbs: number; protein: number; fat: number; fiber?: number; sodium?: number };
  servingSizes: Array<{ id: number; label: string; grams: number; isDefault: boolean }>;
}

// ── Local DB search ──────────────────────────────────────────

async function searchLocal(q: string, limit: number): Promise<FoodResult[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT f.*, GROUP_CONCAT(
       CONCAT(ss.id,'|',ss.label,'|',ss.grams,'|',ss.is_default)
       ORDER BY ss.is_default DESC, ss.id ASC SEPARATOR '~'
     ) AS servings
     FROM foods f
     LEFT JOIN serving_sizes ss ON ss.food_id = f.id
     WHERE MATCH(f.name, f.brand) AGAINST(? IN BOOLEAN MODE)
        OR f.name LIKE ?
     GROUP BY f.id
     ORDER BY f.is_custom DESC, f.name ASC
     LIMIT ?`,
    [q + '*', `%${q}%`, limit]
  );
  return rows.map(rowToResult);
}

function rowToResult(row: RowDataPacket): FoodResult {
  const servingSizes = row.servings
    ? String(row.servings).split('~').map((s) => {
        const [id, label, grams, isDef] = s.split('|');
        return { id: Number(id), label, grams: Number(grams), isDefault: isDef === '1' };
      })
    : [];

  return {
    id: row.id,
    barcode: row.barcode ?? undefined,
    name: row.name,
    brand: row.brand ?? undefined,
    source: row.source,
    isCustom: Boolean(row.is_custom),
    nutrition: {
      calories: Number(row.calories_per100),
      carbs: Number(row.carbs_per100),
      protein: Number(row.protein_per100),
      fat: Number(row.fat_per100),
      fiber: row.fiber_per100 != null ? Number(row.fiber_per100) : undefined,
      sodium: row.sodium_per100 != null ? Number(row.sodium_per100) : undefined,
    },
    servingSizes,
  };
}

// ── Open Food Facts ──────────────────────────────────────────

async function searchOpenFoodFacts(q: string): Promise<FoodResult[]> {
  try {
    const res = await axios.get('https://world.openfoodfacts.org/cgi/search.pl', {
      params: { search_terms: q, search_simple: 1, action: 'process', json: 1, page_size: 10 },
      timeout: 5000,
    });
    const products = res.data?.products ?? [];
    return products
      .filter((p: Record<string, unknown>) => p.product_name)
      .map((p: Record<string, unknown>) => offToResult(p));
  } catch {
    return [];
  }
}

function offToResult(p: Record<string, unknown>): FoodResult {
  const n = (p.nutriments as Record<string, unknown>) ?? {};

  // Extract actual serving size from OFacts (serving_quantity is grams, serving_size is label)
  const servingGrams = p.serving_quantity ? Number(p.serving_quantity) : null;
  const servingLabel = p.serving_size ? String(p.serving_size).trim() : null;

  const servingSizes: FoodResult['servingSizes'] = [{ id: 0, label: '100g', grams: 100, isDefault: !servingGrams }];
  if (servingGrams && servingGrams > 0) {
    servingSizes.unshift({ id: 0, label: servingLabel ?? `${servingGrams}g`, grams: servingGrams, isDefault: true });
  }

  return {
    id: 0,
    barcode: String(p.code ?? p._id ?? ''),
    name: String(p.product_name ?? ''),
    brand: p.brands ? String(p.brands).split(',')[0].trim() : undefined,
    source: 'open_food_facts',
    isCustom: false,
    nutrition: {
      calories: Number(n['energy-kcal_100g'] ?? n['energy_100g'] ?? 0),
      carbs:    Number(n['carbohydrates_100g'] ?? 0),
      protein:  Number(n['proteins_100g'] ?? 0),
      fat:      Number(n['fat_100g'] ?? 0),
      fiber:    n['fiber_100g'] != null ? Number(n['fiber_100g']) : undefined,
      sodium:   n['sodium_100g'] != null ? Number(n['sodium_100g']) * 1000 : undefined,
    },
    servingSizes,
  };
}

// ── USDA FoodData Central ────────────────────────────────────

async function searchUSDA(q: string): Promise<FoodResult[]> {
  if (!env.USDA_API_KEY) return [];
  try {
    const res = await axios.get('https://api.nal.usda.gov/fdc/v1/foods/search', {
      params: { query: q, pageSize: 10, api_key: env.USDA_API_KEY },
      timeout: 5000,
    });
    const foods = res.data?.foods ?? [];
    return foods.map((f: Record<string, unknown>) => usdaToResult(f));
  } catch {
    return [];
  }
}

function usdaToResult(f: Record<string, unknown>): FoodResult {
  const nutrients = (f.foodNutrients as Array<Record<string, unknown>>) ?? [];
  const get = (id: number) => {
    const n = nutrients.find((n) => n.nutrientId === id);
    return n ? Number(n.value) : 0;
  };
  return {
    id: 0,
    name: String(f.description ?? ''),
    brand: f.brandOwner ? String(f.brandOwner) : undefined,
    source: 'usda',
    isCustom: false,
    nutrition: {
      calories: get(1008),
      carbs:    get(1005),
      protein:  get(1003),
      fat:      get(1004),
      fiber:    get(1079) || undefined,
      sodium:   get(1093) || undefined,
    },
    servingSizes: [{ id: 0, label: '100g', grams: 100, isDefault: true }],
  };
}

// ── Cache external results ───────────────────────────────────

async function cacheFood(food: FoodResult): Promise<number> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO foods (barcode, name, brand, source, source_id,
         calories_per100, carbs_per100, protein_per100, fat_per100, fiber_per100, sodium_per100)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [food.barcode ?? null, food.name, food.brand ?? null, food.source, food.barcode ?? null,
       food.nutrition.calories, food.nutrition.carbs, food.nutrition.protein, food.nutrition.fat,
       food.nutrition.fiber ?? null, food.nutrition.sodium ?? null]
    );
    const foodId = result.insertId;
    for (const ss of food.servingSizes) {
      await conn.execute(
        'INSERT INTO serving_sizes (food_id, label, grams, is_default) VALUES (?, ?, ?, ?)',
        [foodId, ss.label, ss.grams, ss.isDefault ? 1 : 0]
      );
    }
    await conn.commit();
    return foodId;
  } catch {
    await conn.rollback();
    return 0;
  } finally {
    conn.release();
  }
}

// ── Deduplicate ──────────────────────────────────────────────

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function deduplicate(local: FoodResult[], external: FoodResult[]): FoodResult[] {
  const seen = new Set(local.map((f) => normalize(f.name)));
  const unique = external.filter((f) => !seen.has(normalize(f.name)));
  return [...local, ...unique];
}

// ── Public API ───────────────────────────────────────────────

export async function searchFoods(q: string, limit: number): Promise<FoodResult[]> {
  const local = await searchLocal(q, limit);
  if (local.length >= 10) return local.slice(0, limit);

  const [off, usda] = await Promise.allSettled([searchOpenFoodFacts(q), searchUSDA(q)]);
  const external = [
    ...(off.status === 'fulfilled' ? off.value : []),
    ...(usda.status === 'fulfilled' ? usda.value : []),
  ];

  const combined = deduplicate(local, external);

  // Cache external results synchronously so every returned food has a real DB id
  await Promise.all(
    combined
      .filter((f) => f.id === 0)
      .slice(0, 10)
      .map(async (f) => {
        const id = await cacheFood(f);
        if (id) {
          f.id = id;
          const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT id, grams, is_default FROM serving_sizes WHERE food_id = ? ORDER BY is_default DESC, id ASC',
            [id]
          );
          if (rows.length) {
            f.servingSizes = f.servingSizes.map((s, i) => ({
              ...s,
              id: (rows[i] ?? rows[0]).id,
            }));
          }
        }
      })
  );

  return combined.slice(0, limit);
}

export async function lookupBarcode(barcode: string): Promise<FoodResult | null> {
  // 1. Check cache
  const [cached] = await pool.query<RowDataPacket[]>(
    'SELECT food_id, fetched_at FROM barcode_cache WHERE barcode = ?', [barcode]
  );
  if (cached.length) {
    const age = Date.now() - new Date(cached[0].fetched_at).getTime();
    if (cached[0].food_id === null && age < 7 * 24 * 60 * 60 * 1000) return null;
    if (cached[0].food_id) {
      const [foods] = await pool.query<RowDataPacket[]>(
        `SELECT f.*, GROUP_CONCAT(
           CONCAT(ss.id,'|',ss.label,'|',ss.grams,'|',ss.is_default)
           ORDER BY ss.is_default DESC, ss.id ASC SEPARATOR '~'
         ) AS servings
         FROM foods f
         LEFT JOIN serving_sizes ss ON ss.food_id = f.id
         WHERE f.id = ? GROUP BY f.id`,
        [cached[0].food_id]
      );
      if (foods.length) return rowToResult(foods[0]);
    }
  }

  // 2. Hit Open Food Facts
  try {
    const res = await axios.get(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { timeout: 5000 }
    );
    if (res.data?.status !== 1 || !res.data?.product) {
      await pool.execute(
        'INSERT INTO barcode_cache (barcode, food_id) VALUES (?, NULL) ON DUPLICATE KEY UPDATE food_id=NULL, fetched_at=NOW()',
        [barcode]
      );
      return null;
    }

    const food = offToResult({ ...res.data.product, code: barcode });
    const foodId = await cacheFood(food);
    if (foodId) {
      food.id = foodId;
      await pool.execute(
        'INSERT INTO barcode_cache (barcode, food_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE food_id=?, fetched_at=NOW()',
        [barcode, foodId, foodId]
      );
      const [ssRows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM serving_sizes WHERE food_id = ? ORDER BY is_default DESC, id ASC',
        [foodId]
      );
      if (ssRows.length) {
        food.servingSizes = food.servingSizes.map((s, i) => ({ ...s, id: (ssRows[i] ?? ssRows[0]).id }));
      }
    }
    return food;
  } catch {
    return null;
  }
}

import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { suggestTags } from '../services/claude';

const router = Router();

const DEFAULT_TAG_DEFINITIONS = {
  health:   ['High Protein', 'Low Fat', 'Low Carb', 'Vegetarian', 'Vegan', 'Gluten Free', 'Dairy Free', 'Keto'],
  cuisine:  ['American', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Thai', 'Indian', 'French', 'Mediterranean', 'Greek'],
  category: ['Meat', 'Pasta', 'Vegetables', 'Seafood', 'Soup', 'Salad', 'Sandwich', 'Rice', 'Dessert', 'Bread'],
};

// GET /api/tags?type=food|cocktail — list tags used by the current user's recipes
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const type = req.query.type as string | undefined;
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT t.id, t.name
       FROM tags t
       JOIN recipe_tags rt ON rt.tag_id = t.id
       JOIN recipes r ON r.id = rt.recipe_id AND r.user_id = ?
       ${type ? 'AND r.type = ?' : ''}
       ORDER BY t.name`,
      type ? [userId, type] : [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tags/definitions — get per-user tag definitions grouped by category
router.get('/definitions', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  try {
    const [rows] = await pool.execute<any[]>(
      'SELECT name, category FROM tag_definitions WHERE user_id = ? ORDER BY category, name',
      [userId]
    );

    if (rows.length === 0) {
      // Seed defaults for new user
      const values = Object.entries(DEFAULT_TAG_DEFINITIONS).flatMap(([cat, names]) =>
        names.map((name) => [userId, name, cat])
      );
      for (const [uid, name, category] of values) {
        await pool.execute(
          'INSERT IGNORE INTO tag_definitions (user_id, name, category) VALUES (?, ?, ?)',
          [uid, name, category]
        );
      }
      return res.json(DEFAULT_TAG_DEFINITIONS);
    }

    const result: Record<string, string[]> = { health: [], cuisine: [], category: [] };
    for (const row of rows) {
      result[row.category].push(row.name);
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tags/definitions — replace user's tag definitions
router.put('/definitions', async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { health, cuisine, category } = req.body as {
    health: string[];
    cuisine: string[];
    category: string[];
  };

  if (!Array.isArray(health) || !Array.isArray(cuisine) || !Array.isArray(category)) {
    return res.status(400).json({ error: 'health, cuisine, and category arrays required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM tag_definitions WHERE user_id = ?', [userId]);
    const all: [string, string][] = [
      ...health.map((n): [string, string] => [n, 'health']),
      ...cuisine.map((n): [string, string] => [n, 'cuisine']),
      ...category.map((n): [string, string] => [n, 'category']),
    ];
    for (const [name, cat] of all) {
      if (name.trim()) {
        await conn.execute(
          'INSERT IGNORE INTO tag_definitions (user_id, name, category) VALUES (?, ?, ?)',
          [userId, name.trim(), cat]
        );
      }
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// POST /api/tags/suggest — suggest tags without needing a saved recipe
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const { name, type, ingredients, steps } = req.body;
    const tags = await suggestTags(
      { name, type },
      Array.isArray(ingredients) ? ingredients : []
    );
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

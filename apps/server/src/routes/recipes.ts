import { Router, Request, Response } from 'express';
import pool from '../db';
import type { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { suggestTags } from '../services/claude';
import { getPresignedUploadUrl, getPresignedGetUrl, uploadBuffer, clearPresignedUrlCache } from '../services/s3';

const router = Router();

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Block SSRF: reject loopback, RFC-1918, link-local, and AWS metadata addresses. */
function isSafePhotoUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (!['http:', 'https:'].includes(protocol)) return false;
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1)/i.test(hostname)) return false;
    return true;
  } catch { return false; }
}

// DELETE /api/recipes/history — clear all make log entries
router.delete('/history', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM recipe_log');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/recipes — delete all recipes (and cascade log entries via FK or explicit delete)
router.delete('/', async (req: Request, res: Response) => {
  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM recipe_log');
    await conn.query('DELETE FROM recipe_tags');
    await conn.query('DELETE FROM recipe_ingredients');
    await conn.query('DELETE FROM recipe_steps');
    await conn.query('DELETE FROM recipes');
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// GET /api/recipes/history — all make log entries with recipe info, newest first
router.get('/history', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(`
      SELECT rl.id AS log_id, rl.made_at, r.id AS recipe_id, r.name, r.photo_key, r.type, r.subcategory
      FROM recipe_log rl
      JOIN recipes r ON rl.recipe_id = r.id
      ORDER BY rl.made_at DESC
    `);
    const entries = await Promise.all(
      (rows as RowDataPacket[]).map(async (r) => ({
        ...r,
        photo_url: r.photo_key ? await getPresignedGetUrl(r.photo_key) : null,
      }))
    );
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/recipes
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, search, favorite, made, tags, sort, subcategory } = req.query;

    let query = `
      SELECT r.*,
        GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tags,
        MAX(rl.made_at) AS last_made
      FROM recipes r
      LEFT JOIN recipe_tags rt ON r.id = rt.recipe_id
      LEFT JOIN tags t ON rt.tag_id = t.id
      LEFT JOIN recipe_log rl ON r.id = rl.recipe_id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (type && type !== 'all') {
      conditions.push('r.type = ?');
      params.push(type);
    }
    if (search) {
      conditions.push('r.name LIKE ?');
      params.push(`%${search}%`);
    }
    if (favorite === '1') {
      conditions.push('r.is_favorite = 1');
    }
    if (subcategory) {
      conditions.push('r.subcategory = ?');
      params.push(subcategory);
    }

    if (tags) {
      const tagList = (tags as string).split(',').filter(Boolean);
      if (tagList.length > 0) {
        conditions.push(`
          r.id IN (
            SELECT rt2.recipe_id FROM recipe_tags rt2
            JOIN tags t2 ON rt2.tag_id = t2.id
            WHERE t2.name IN (${tagList.map(() => '?').join(',')})
            GROUP BY rt2.recipe_id
            HAVING COUNT(DISTINCT t2.name) = ?
          )
        `);
        params.push(...tagList, tagList.length);
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY r.id';

    if (made === '1') {
      query += ' HAVING last_made IS NOT NULL';
    } else if (made === '0') {
      query += ' HAVING last_made IS NULL';
    }

    if (sort === 'name') {
      query += ' ORDER BY r.name ASC';
    } else if (sort === 'recently_made') {
      query += ' ORDER BY last_made DESC, r.created_at DESC';
    } else if (sort === 'prep_time') {
      query += ' ORDER BY r.prep_time ASC';
    } else if (sort === 'created_at') {
      query += ' ORDER BY r.created_at DESC';
    } else {
      query += ' ORDER BY RAND()';
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    const recipes = await Promise.all(
      (rows as RowDataPacket[]).map(async (r) => ({
        ...r,
        tags: r.tags ? r.tags.split(',') : [],
        photo_url: r.photo_key ? await getPresignedGetUrl(r.photo_key) : null,
      }))
    );

    res.json(recipes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/recipes/suggest
router.get('/suggest', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.query;

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are a creative cocktail and recipe expert. Suggest 3-5 recipes based on the user's request.
Return a JSON array of recipe suggestions. Each item should have: name, type (cocktail|food), description, and ingredients (array of strings).
Only return valid JSON, no other text.`;

    const userMessage = prompt ? String(prompt) : 'Surprise me with something interesting.';

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    });

    const text = (message.content[0] as any).text;
    const suggestions = JSON.parse(text);
    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/recipes/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [id]);
    const recipe = (rows as RowDataPacket[])[0];
    if (!recipe) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const [ingredients] = await pool.query(
      `SELECT i.name, ri.quantity, ri.unit, ri.sort_order
       FROM recipe_ingredients ri
       JOIN ingredients i ON ri.ingredient_id = i.id
       WHERE ri.recipe_id = ?
       ORDER BY ri.sort_order`,
      [id]
    );

    const [steps] = await pool.query(
      'SELECT step_number, instruction FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number',
      [id]
    );

    const [tags] = await pool.query(
      `SELECT t.name FROM recipe_tags rt JOIN tags t ON rt.tag_id = t.id WHERE rt.recipe_id = ?`,
      [id]
    );

    const [logRows] = await pool.query(
      'SELECT MAX(made_at) AS last_made FROM recipe_log WHERE recipe_id = ?',
      [id]
    );

    res.json({
      ...recipe,
      photo_url: recipe.photo_key ? await getPresignedGetUrl(recipe.photo_key) : null,
      ingredients,
      steps,
      tags: (tags as RowDataPacket[]).map((t) => t.name),
      last_made: (logRows as RowDataPacket[])[0]?.last_made ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recipes
router.post('/', async (req: Request, res: Response) => {
  const { name, type } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  if (type !== 'cocktail' && type !== 'food') {
    res.status(400).json({ error: 'type must be cocktail or food' }); return;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      subcategory, description, notes, source,
      prep_time, cook_time, servings, glass_type, abv_level,
      calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg,
      ingredients, steps, tags,
    } = req.body;

    const [result] = await conn.query(
      `INSERT INTO recipes (type, name, subcategory, description, notes, source, prep_time, cook_time, servings, glass_type, abv_level,
        calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, name, subcategory ?? null, description, notes, source, prep_time, cook_time, servings ?? null, glass_type, abv_level,
       calories ?? null, carbs_g ?? null, protein_g ?? null, fat_g ?? null, fiber_g ?? null, sodium_mg ?? null]
    );
    const recipeId = (result as ResultSetHeader).insertId;

    if (ingredients?.length) {
      const seenIngredientIds = new Set<number>();
      let sortOrder = 0;
      for (const { name: rawIngName, quantity, unit } of ingredients) {
        const ingName = (rawIngName || '').trim();
        if (!ingName) continue;
        const [existing] = await conn.query('SELECT id, name FROM ingredients WHERE name = ?', [ingName]);
        let ingredientId: number;
        if ((existing as RowDataPacket[]).length > 0) {
          ingredientId = (existing as RowDataPacket[])[0].id as number;
          if ((existing as RowDataPacket[])[0].name !== ingName) {
            await conn.query('UPDATE ingredients SET name = ? WHERE id = ?', [ingName, ingredientId]);
          }
        } else {
          const [ins] = await conn.query('INSERT INTO ingredients (name) VALUES (?)', [ingName]);
          ingredientId = (ins as ResultSetHeader).insertId;
        }
        if (seenIngredientIds.has(ingredientId)) continue;
        seenIngredientIds.add(ingredientId);
        await conn.query(
          'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (?, ?, ?, ?, ?)',
          [recipeId, ingredientId, quantity, unit, sortOrder++]
        );
      }
    }

    if (steps?.length) {
      for (let i = 0; i < steps.length; i++) {
        await conn.query(
          'INSERT INTO recipe_steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)',
          [recipeId, i + 1, steps[i]]
        );
      }
    }

    if (tags?.length) {
      await setTags(conn, recipeId, tags);
    }

    await conn.commit();
    res.status(201).json({ id: recipeId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// PUT /api/recipes/:id
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { photo_key } = req.body;
  if (photo_key !== undefined && photo_key !== null && photo_key !== '') {
    if (typeof photo_key !== 'string' || !/^recipes\/\d+\/\d+$/.test(photo_key)) {
      res.status(400).json({ error: 'Invalid photo_key' }); return;
    }
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      type, name, subcategory, description, notes, source,
      prep_time, cook_time, servings, glass_type, abv_level,
      is_favorite,
      calories, carbs_g, protein_g, fat_g, fiber_g, sodium_mg,
      ingredients, steps, tags,
    } = req.body;

    const updateFields = `type=?, name=?, subcategory=?, description=?, notes=?, source=?,
       prep_time=?, cook_time=?, servings=?, glass_type=?, abv_level=?, is_favorite=?,
       calories=?, carbs_g=?, protein_g=?, fat_g=?, fiber_g=?, sodium_mg=?${photo_key !== undefined ? ', photo_key=?' : ''}`;
    const updateParams = [type, name, subcategory ?? null, description, notes, source, prep_time, cook_time, servings ?? null, glass_type, abv_level, is_favorite,
      calories ?? null, carbs_g ?? null, protein_g ?? null, fat_g ?? null, fiber_g ?? null, sodium_mg ?? null];
    if (photo_key !== undefined) updateParams.push(photo_key);
    updateParams.push(id);

    const [updateResult] = await conn.query(`UPDATE recipes SET ${updateFields} WHERE id=?`, updateParams);
    if ((updateResult as ResultSetHeader).affectedRows === 0) {
      await conn.rollback();
      res.status(404).json({ error: 'Not found' }); return;
    }
    if (photo_key !== undefined) clearPresignedUrlCache(photo_key);

    if (ingredients !== undefined) {
      await conn.query('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
      const seenIngredientIds = new Set<number>();
      let sortOrder = 0;
      for (const { name: rawIngName, quantity, unit } of ingredients) {
        const ingName = (rawIngName || '').trim();
        if (!ingName) continue;
        const [existing] = await conn.query('SELECT id, name FROM ingredients WHERE name = ?', [ingName]);
        let ingredientId: number;
        if ((existing as RowDataPacket[]).length > 0) {
          ingredientId = (existing as RowDataPacket[])[0].id as number;
          if ((existing as RowDataPacket[])[0].name !== ingName) {
            await conn.query('UPDATE ingredients SET name = ? WHERE id = ?', [ingName, ingredientId]);
          }
        } else {
          const [ins] = await conn.query('INSERT INTO ingredients (name) VALUES (?)', [ingName]);
          ingredientId = (ins as ResultSetHeader).insertId;
        }
        if (seenIngredientIds.has(ingredientId)) continue;
        seenIngredientIds.add(ingredientId);
        await conn.query(
          'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (?, ?, ?, ?, ?)',
          [id, ingredientId, quantity, unit, sortOrder++]
        );
      }
    }

    if (steps !== undefined) {
      await conn.query('DELETE FROM recipe_steps WHERE recipe_id = ?', [id]);
      for (let i = 0; i < steps.length; i++) {
        await conn.query(
          'INSERT INTO recipe_steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)',
          [id, i + 1, steps[i]]
        );
      }
    }

    if (tags !== undefined) {
      await setTags(conn, Number(id), tags);
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// DELETE /api/recipes/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await pool.query('DELETE FROM recipes WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recipes/:id/photo — get pre-signed S3 upload URL
router.post('/:id/photo', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const { contentType } = req.body;
    const key = `recipes/${id}/${Date.now()}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recipes/:id/photo-from-url
router.post('/:id/photo-from-url', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const { url } = req.body;
    if (!url) { res.status(400).json({ error: 'url is required' }); return; }
    if (!isSafePhotoUrl(url)) { res.status(400).json({ error: 'Invalid or disallowed URL' }); return; }
    const response = await fetch(url);
    if (!response.ok) { res.status(400).json({ error: 'Could not fetch image from URL' }); return; }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) { res.status(400).json({ error: 'URL does not point to an image' }); return; }
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `recipes/${id}/${Date.now()}`;
    await uploadBuffer(key, buffer, contentType);
    await pool.query('UPDATE recipes SET photo_key = ? WHERE id = ?', [key, id]);
    clearPresignedUrlCache(key);
    res.json({ key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload image from URL' });
  }
});

// POST /api/recipes/:id/log
router.post('/:id/log', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await pool.query('INSERT INTO recipe_log (recipe_id) VALUES (?)', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/recipes/:id/log
router.get('/:id/log', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [rows] = await pool.query(
      'SELECT id, made_at FROM recipe_log WHERE recipe_id = ? ORDER BY made_at DESC',
      [id]
    );
    const entries = rows as RowDataPacket[];
    res.json({ count: entries.length, entries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/recipes/:id/log/:logId — update made_at
router.patch('/:id/log/:logId', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const logId = parseId(req.params.logId);
  if (!id || !logId) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { made_at } = req.body as { made_at?: string };
  if (!made_at) { res.status(400).json({ error: 'made_at required' }); return; }
  try {
    const [result] = await pool.query(
      'UPDATE recipe_log SET made_at = ? WHERE id = ? AND recipe_id = ?',
      [new Date(made_at), logId, id]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/recipes/:id/log/:logId
router.delete('/:id/log/:logId', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const logId = parseId(req.params.logId);
  if (!id || !logId) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [result] = await pool.query(
      'DELETE FROM recipe_log WHERE id = ? AND recipe_id = ?',
      [logId, id]
    );
    if ((result as ResultSetHeader).affectedRows === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/recipes/:id/log
router.delete('/:id/log', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await pool.query('DELETE FROM recipe_log WHERE recipe_id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/recipes/:id/tags/suggest
router.post('/:id/tags/suggest', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [id]);
    const recipe = (rows as RowDataPacket[])[0];
    if (!recipe) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const [ingredients] = await pool.query(
      `SELECT i.name FROM recipe_ingredients ri JOIN ingredients i ON ri.ingredient_id = i.id WHERE ri.recipe_id = ?`,
      [id]
    );
    const tags = await suggestTags(recipe, (ingredients as RowDataPacket[]).map((i) => i.name));
    res.json({ tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/recipes/:id/tags
router.put('/:id/tags', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await setTags(conn, id, req.body.tags);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

async function setTags(conn: PoolConnection, recipeId: number, tagNames: string[]) {
  await conn.query('DELETE FROM recipe_tags WHERE recipe_id = ?', [recipeId]);
  for (const rawName of tagNames) {
    const name = String(rawName).trim().slice(0, 50);
    if (!name) continue;
    const [existing] = await conn.query('SELECT id FROM tags WHERE name = ?', [name]);
    let tagId: number;
    if ((existing as RowDataPacket[]).length > 0) {
      tagId = (existing as RowDataPacket[])[0].id as number;
    } else {
      const [ins] = await conn.query<ResultSetHeader>('INSERT INTO tags (name) VALUES (?)', [name]);
      tagId = ins.insertId;
    }
    await conn.query('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)', [recipeId, tagId]);
  }
}

export default router;

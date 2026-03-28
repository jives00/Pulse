import { Router, Request, Response } from 'express';
import pool from '../db';
import { suggestTags } from '../services/claude';

const router = Router();

// GET /api/tags
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tags ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
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

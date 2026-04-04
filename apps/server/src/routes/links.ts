import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import pool from '../db';
import type { ResultSetHeader } from 'mysql2/promise';

const router = Router();

function parseId(param: string): number | null {
  const n = Number(param);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const BLOCKED_TITLES = ['just a moment', 'attention required', 'are you human', 'ddos protection', 'access denied', 'robot or human'];

async function fetchSiteMeta(url: string): Promise<{ title: string; favicon_url: string }> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace('www.', '');
  const favicon_url = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      redirect: 'follow',
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const raw = $('title').first().text().trim();

    const isBlocked = BLOCKED_TITLES.some((t) => raw.toLowerCase().includes(t));
    const title = (!raw || isBlocked)
      ? hostname
      : raw.split(/\s*[|—–·]\s*|\s+-\s+|\s*:\s+/)[0].trim() || hostname;

    return { title, favicon_url };
  } catch {
    return { title: hostname, favicon_url };
  }
}

// GET /api/links
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const VALID_CATEGORIES = ['food', 'drinks', 'nutrition', 'exercise', 'other'];

// POST /api/links
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, category } = req.body;
    if (!url?.trim()) {
      res.status(400).json({ error: 'url is required' });
      return;
    }
    const cat = VALID_CATEGORIES.includes(category) ? category : 'other';
    const { title, favicon_url } = await fetchSiteMeta(url.trim());
    const [result] = await pool.query(
      'INSERT INTO links (user_id, url, title, favicon_url, category) VALUES (?, ?, ?, ?, ?)',
      [req.userId, url.trim(), title, favicon_url, cat]
    );
    res.status(201).json({ id: (result as ResultSetHeader).insertId, url: url.trim(), title, favicon_url, category: cat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/links/:id
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    const { title, favicon_url, url, category } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const cat = VALID_CATEGORIES.includes(category) ? category : null;
    const [updateResult] = await pool.query(
      'UPDATE links SET title = ?, favicon_url = ?, url = COALESCE(NULLIF(?, ""), url), category = COALESCE(?, category) WHERE id = ? AND user_id = ?',
      [title.trim(), favicon_url ?? null, url?.trim() ?? '', cat, id, req.userId]
    );
    if ((updateResult as ResultSetHeader).affectedRows === 0) {
      res.status(404).json({ error: 'Not found' }); return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/links/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  try {
    await pool.query('DELETE FROM links WHERE id = ? AND user_id = ?', [id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

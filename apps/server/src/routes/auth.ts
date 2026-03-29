import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import pool from '../db';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash as string))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const token = jwt.sign({ sub: user.id, username: user.username }, env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register (invite-token gated)
router.post('/register', async (req, res) => {
  const { username, password, inviteToken } = req.body as { username: string; password: string; inviteToken: string };
  if (!username || !password || !inviteToken) {
    res.status(400).json({ error: 'Username, password, and invite token required' });
    return;
  }
  try {
    const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
    const [tokens] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM invite_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
      [tokenHash]
    );
    if (!tokens[0]) {
      res.status(400).json({ error: 'Invalid or expired invite token' });
      return;
    }
    const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [username]);
    if (existing[0]) {
      res.status(400).json({ error: 'Username already taken' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );
    await pool.query('UPDATE invite_tokens SET used_at = NOW() WHERE id = ?', [tokens[0].id]);
    const token = jwt.sign({ sub: result.insertId, username }, env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/generate-invite — admin only (user id 1)
router.post('/generate-invite', requireAuth, async (req, res) => {
  if (req.userId !== 1) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    await pool.query(
      'INSERT INTO invite_tokens (token_hash, created_by, expires_at) VALUES (?, ?, ?)',
      [tokenHash, req.userId, expiresAt]
    );
    res.json({ token: rawToken, expiresAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/verify
router.get('/verify', requireAuth, (req, res) => {
  res.json({ ok: true, userId: req.userId });
});

export default router;

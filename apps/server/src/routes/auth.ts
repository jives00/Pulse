import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (
    username !== env.AUTH_USERNAME ||
    password !== env.AUTH_PASSWORD
  ) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign({ username }, env.JWT_SECRET, {
    expiresIn: '7d',
  });

  res.json({ token });
});

export default router;

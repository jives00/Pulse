import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requireAuth } from './middleware/auth';

import authRoutes      from './routes/auth';
import recipesRoutes   from './routes/recipes';
import tagsRoutes      from './routes/tags';
import scrapeRoutes    from './routes/scrape';
import linksRoutes     from './routes/links';
import foodsRoutes     from './routes/foods';
import logRoutes       from './routes/log';
import goalsRoutes     from './routes/goals';
import waterRoutes     from './routes/water';
import templatesRoutes from './routes/templates';
import historyRoutes   from './routes/history';
import exportRoutes    from './routes/export';
import workoutsRoutes  from './routes/workouts';
import exercisesRoutes from './routes/exercises';

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || env.CORS_ORIGIN.split(',').includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Public
app.use('/api/auth', authRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Protected — Recipes
app.use('/api/recipes/scrape', requireAuth, scrapeRoutes);
app.use('/api/recipes',        requireAuth, recipesRoutes);
app.use('/api/tags',           requireAuth, tagsRoutes);
app.use('/api/links',          requireAuth, linksRoutes);

// Protected — Nutrition
app.use('/api/foods',     requireAuth, foodsRoutes);
app.use('/api/log',       requireAuth, logRoutes);
app.use('/api/goals',     requireAuth, goalsRoutes);
app.use('/api/water',     requireAuth, waterRoutes);
app.use('/api/templates', requireAuth, templatesRoutes);
app.use('/api/history',   requireAuth, historyRoutes);
app.use('/api/export',    requireAuth, exportRoutes);

// Workouts
app.use('/api/workouts',  requireAuth, workoutsRoutes);
app.use('/api/exercises', requireAuth, exercisesRoutes);

app.listen(env.PORT, () => {
  console.log(`Pulse server running on port ${env.PORT}`);
});

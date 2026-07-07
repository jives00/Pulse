import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cron from 'node-cron';
import { env } from './config/env';
import { pool } from './config/database';
import { syncWeightGurus } from './services/weightGurusSync';
import { requireAuth } from './middleware/auth';
import { isTrustedOrigin } from './utils/trustedNetwork';

import authRoutes      from './routes/auth';
import appVersionRoutes from './routes/app-version';
import recipesRoutes   from './routes/recipes';
import tagsRoutes      from './routes/tags';
import scrapeRoutes    from './routes/scrape';
import linksRoutes     from './routes/links';
import foodsRoutes     from './routes/foods';
import logRoutes       from './routes/log';
// goals.ts removed — endpoints moved to nutrition-targets.ts
import waterRoutes     from './routes/water';
import templatesRoutes from './routes/templates';
import historyRoutes   from './routes/history';
import exportRoutes    from './routes/export';
import workoutsRoutes      from './routes/workouts';
import exercisesRoutes     from './routes/exercises';
import measurementsRoutes  from './routes/measurements';
import routinesRoutes      from './routes/routines';
import schedulesRoutes         from './routes/schedules';
import stepsRoutes             from './routes/steps';
import aiAssistantRoutes       from './routes/ai-assistant';
import recoveryRoutes          from './routes/recovery';
import mealPlanRoutes          from './routes/meal-plan';
// goal-checkpoints.ts removed — replaced by goal milestones in goals-v2.ts
import dayTypesRoutes          from './routes/day-types';
import mealSchedulesRoutes          from './routes/meal-schedules';
import nutritionSchedulesRoutes     from './routes/nutrition-schedules';
// user-goals.ts removed — custom goals migrated to goals-v2
import goalsV2Routes               from './routes/goals-v2';
import nutritionTargetsRoutes      from './routes/nutrition-targets';

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, cb) => {
    const allowed = env.CORS_ORIGIN.split(',').map(o => o.trim());
    if (isTrustedOrigin(origin, allowed)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.disable('etag'); // Prevent 304 responses — mobile HTTP clients send If-None-Match causing Axios to reject 304s

// Public
app.use('/api/auth', authRoutes);
app.use('/api/app', appVersionRoutes);
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'ok' });
  } catch {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

// Protected — Recipes
app.use('/api/recipes/scrape', requireAuth, scrapeRoutes);
app.use('/api/recipes',        requireAuth, recipesRoutes);
app.use('/api/tags',           requireAuth, tagsRoutes);
app.use('/api/links',          requireAuth, linksRoutes);

// Protected — Nutrition
app.use('/api/foods',     requireAuth, foodsRoutes);
app.use('/api/log',       requireAuth, logRoutes);
// /api/goals removed — use /api/nutrition-targets
app.use('/api/water',     requireAuth, waterRoutes);
app.use('/api/templates', requireAuth, templatesRoutes);
app.use('/api/history',   requireAuth, historyRoutes);
app.use('/api/export',    requireAuth, exportRoutes);

// Workouts
app.use('/api/workouts',      requireAuth, workoutsRoutes);
app.use('/api/exercises',     requireAuth, exercisesRoutes);
app.use('/api/measurements',  requireAuth, measurementsRoutes);
app.use('/api/routines',      requireAuth, routinesRoutes);
app.use('/api/schedules',     requireAuth, schedulesRoutes);
app.use('/api/steps',        requireAuth, stepsRoutes);
app.use('/api/ai/assistant',      requireAuth, aiAssistantRoutes);
app.use('/api/recovery',          requireAuth, recoveryRoutes);
app.use('/api/meal-plan',         requireAuth, mealPlanRoutes);
// /api/goal-checkpoints removed — use /api/goals-v2/:id/milestones
app.use('/api/day-types',         requireAuth, dayTypesRoutes);
app.use('/api/meal-schedules',         requireAuth, mealSchedulesRoutes);
app.use('/api/nutrition-schedules',    requireAuth, nutritionSchedulesRoutes);
// /api/user-goals removed — use /api/goals-v2
app.use('/api/goals-v2',               requireAuth, goalsV2Routes);
app.use('/api/nutrition-targets',      requireAuth, nutritionTargetsRoutes);

// Global error handler — catches anything that bubbles up from routes
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[server] unhandled error ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(env.PORT, () => {
  console.log(`Pulse server running on port ${env.PORT}`);
});

// WeightGurus sync — hourly 6am–noon CT
if (env.WG_EMAIL && env.WG_PASSWORD) {
  cron.schedule('0 6-12 * * *', async () => {
    console.log('[cron] WeightGurus sync starting...');
    try {
      const { inserted } = await syncWeightGurus();
      console.log(`[cron] WeightGurus sync done — ${inserted} rows inserted`);
    } catch (err) {
      console.error('[cron] WeightGurus sync failed:', err);
    }
  }, { timezone: 'America/Chicago' });
  console.log('[cron] WeightGurus sync scheduled (6am–noon CT)');
}

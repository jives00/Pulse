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
import workoutsRoutes      from './routes/workouts';
import exercisesRoutes     from './routes/exercises';
import measurementsRoutes  from './routes/measurements';
import routinesRoutes      from './routes/routines';
import schedulesRoutes         from './routes/schedules';
import stepsRoutes             from './routes/steps';
import aiAssistantRoutes       from './routes/ai-assistant';
import mealPlanRoutes          from './routes/meal-plan';
import goalCheckpointsRoutes   from './routes/goal-checkpoints';
import dayTypesRoutes          from './routes/day-types';
import mealSchedulesRoutes          from './routes/meal-schedules';
import nutritionSchedulesRoutes     from './routes/nutrition-schedules';
import userGoalsRoutes              from './routes/user-goals';

const app = express();

app.use(cors({
  origin: (origin, cb) => {
    const allowed = env.CORS_ORIGIN.split(',').map(o => o.trim());
    if (!origin || allowed.includes(origin)) return cb(null, true);
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
app.use('/api/workouts',      requireAuth, workoutsRoutes);
app.use('/api/exercises',     requireAuth, exercisesRoutes);
app.use('/api/measurements',  requireAuth, measurementsRoutes);
app.use('/api/routines',      requireAuth, routinesRoutes);
app.use('/api/schedules',     requireAuth, schedulesRoutes);
app.use('/api/steps',        requireAuth, stepsRoutes);
app.use('/api/ai/assistant',      requireAuth, aiAssistantRoutes);
app.use('/api/meal-plan',         requireAuth, mealPlanRoutes);
app.use('/api/goal-checkpoints',  requireAuth, goalCheckpointsRoutes);
app.use('/api/day-types',         requireAuth, dayTypesRoutes);
app.use('/api/meal-schedules',         requireAuth, mealSchedulesRoutes);
app.use('/api/nutrition-schedules',    requireAuth, nutritionSchedulesRoutes);
app.use('/api/user-goals',             requireAuth, userGoalsRoutes);

app.listen(env.PORT, () => {
  console.log(`Pulse server running on port ${env.PORT}`);
});

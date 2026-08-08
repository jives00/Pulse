import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { loadFeatures } from '../middleware/features';
import type { RowDataPacket } from 'mysql2/promise';
import { runConversation, transcribeAudio } from '../services/aiProvider';
import type { EnabledFeatures } from '@pulse/api-client';

const router = Router();
router.use(requireAuth);

// Simple in-memory cache: key = "userId:YYYY-MM-DD", value = insight text
const insightCache = new Map<string, { insight: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ScreenContext {
  screen: string;
  data?: Record<string, unknown>;
}

type ActionType = 'log_food' | 'update_nutrition_goal';

interface LogFoodPayload {
  name: string;
  meal: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface UpdateNutritionGoalPayload {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

interface AssistantAction {
  type: ActionType;
  payload: LogFoodPayload | UpdateNutritionGoalPayload;
}

interface AssistantResponse {
  type: 'answer' | 'action';
  text: string;
  action?: AssistantAction;
}

// ── Context description builder ───────────────────────────────────────────────

function buildContextDescription(ctx: ScreenContext | undefined): string {
  if (!ctx) return '';
  const { screen, data } = ctx;

  switch (screen) {
    case 'recipe': {
      const name = data?.name ?? 'a recipe';
      const macros = data?.macros as Record<string, number> | undefined;
      if (macros) {
        return `The user is viewing the recipe "${name}". Per serving: ${macros.calories ?? '?'} kcal, ${macros.protein_g ?? '?'}g protein, ${macros.carbs_g ?? '?'}g carbs, ${macros.fat_g ?? '?'}g fat.`;
      }
      return `The user is viewing the recipe "${name}".`;
    }
    case 'food-log': {
      const date = data?.date ?? 'today';
      const logged = data?.logged as Record<string, number> | undefined;
      const targets = data?.targets as Record<string, number> | undefined;
      if (logged && targets) {
        return `The user is on the food log for ${date}. Logged so far: ${logged.calories ?? 0} kcal, ${logged.protein_g ?? 0}g protein, ${logged.carbs_g ?? 0}g carbs, ${logged.fat_g ?? 0}g fat. Daily targets: ${targets.calories ?? '?'} kcal, ${targets.protein_g ?? '?'}g protein, ${targets.carbs_g ?? '?'}g carbs, ${targets.fat_g ?? '?'}g fat.`;
      }
      return `The user is on their food log for ${date}.`;
    }
    case 'routine': {
      const name = data?.name ?? 'a workout routine';
      const exercises = (data?.exercises as string[] | undefined)?.join(', ');
      return exercises
        ? `The user is viewing the routine "${name}" which includes: ${exercises}.`
        : `The user is viewing the routine "${name}".`;
    }
    case 'planning': {
      const targets = data?.targets as Record<string, number> | undefined;
      if (targets) {
        return `The user is on the planning page. Their daily nutrition targets are: ${targets.calories ?? '?'} kcal, ${targets.protein_g ?? '?'}g protein, ${targets.carbs_g ?? '?'}g carbs, ${targets.fat_g ?? '?'}g fat.`;
      }
      return 'The user is on the planning page where they manage their nutrition and exercise goals.';
    }
    case 'dashboard':
    default:
      return 'The user is on their health dashboard.';
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(contextDesc: string): string {
  return `You are Pulse Assistant, an AI built into the Pulse health tracking app. You help users with nutrition advice, workout guidance, food logging, and goal management.

You can perform two types of actions when appropriate:
- log_food: log a food item to the user's food journal
- update_nutrition_goal: update the user's daily nutrition targets

${contextDesc ? `Current context:\n${contextDesc}\n` : ''}
IMPORTANT: Always respond with a valid JSON object. No markdown, no code fences, no extra text.

Response format for a regular answer:
{"type":"answer","text":"Your helpful response here."}

Response format when you want to perform an action (always ask for confirmation first, include the action in your response once confirmed):
{"type":"action","text":"Brief description of what you're about to do, asking for confirmation."}

Response format when executing a confirmed action:
{"type":"action","text":"Done! I've logged X to your food journal.","action":{"type":"log_food","payload":{"name":"Food name","meal":"breakfast","calories":300,"proteinG":20,"carbsG":30,"fatG":10}}}

Or for nutrition goals:
{"type":"action","text":"Done! I've updated your daily nutrition targets.","action":{"type":"update_nutrition_goal","payload":{"calories":2000,"proteinG":150,"carbsG":200,"fatG":65}}}

Only include the "action" field when the user has explicitly confirmed they want to proceed. For the first mention of an action, set type to "action" but omit the action field — just describe what you'll do and ask for confirmation.

Keep responses concise and helpful. You are a fitness and nutrition expert.`;
}

// ── GET /insight ──────────────────────────────────────────────────────────────

type InsightPeriod = 'morning' | 'afternoon' | 'evening';

function getInsightPeriod(hour: number): InsightPeriod {
  if (hour < 11) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Short, order-independent fingerprint of enabled features — used in the insight cache
// key so flipping a toggle in /api/preferences invalidates the cached 24h insight
// immediately rather than serving stale text about a domain that's now off.
function featuresFingerprint(features: EnabledFeatures): string {
  return Object.keys(features).sort().map((k) => `${k}:${features[k as keyof EnabledFeatures] ? 1 : 0}`).join(',');
}

function trackedDomainsText(features: EnabledFeatures): string {
  const domains: string[] = [];
  if (features.nutrition) domains.push('nutrition/food logging');
  if (features.exercise) domains.push('exercise/workouts');
  if (features.body) domains.push('body weight & measurements');
  if (features.activity) domains.push('steps/activity');
  return domains.length
    ? `The user tracks: ${domains.join(', ')}. Only reference these domains — never suggest logging something they don't track.`
    : 'The user has not enabled any tracking modules.';
}

router.get('/insight', loadFeatures, async (req: Request, res: Response) => {
  try {
    const features = req.features!;
    const hasNutrition = features.nutrition;
    const hasExercise = features.exercise;

    const clientHour = parseInt(req.query.hour as string, 10);
    const hour = Number.isFinite(clientHour) ? clientHour : new Date().getHours();
    const period = getInsightPeriod(hour);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const cacheKey = `${req.userId}:${todayStr}:${period}:${featuresFingerprint(features)}`;

    const cached = insightCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ text: cached.insight, period });
    }

    // Nutrition targets (user_goals) — only meaningful while nutrition tracking is on.
    let goals: RowDataPacket | { calories: number; protein_g: number; carbs_g: number; fat_g: number } =
      { calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 65 };
    if (hasNutrition) {
      const [goalRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`,
        [req.userId, todayStr]
      );
      goals = goalRows[0] ?? goals;
    }

    let prompt: string;

    if (period === 'morning') {
      // Yesterday recap
      const n = hasNutrition ? await fetchFoodTotals(req.userId, yesterdayStr) : { cal: 0, prot: 0, carbs: 0, fat: 0 };
      const w = hasExercise ? await fetchWorkoutTotals(req.userId, yesterdayStr) : { workout_count: 0, total_minutes: 0 };

      const nutritionLine = hasNutrition
        ? `Nutrition goal: ${Math.round(goals.calories)} kcal, ${Math.round(goals.protein_g)}g protein\nNutrition actual: ${Math.round(n.cal)} kcal, ${Math.round(n.prot)}g protein (${Math.round(n.cal - goals.calories > 0 ? n.cal - goals.calories : goals.calories - n.cal)} kcal ${n.cal > goals.calories ? 'over' : 'under'})`
        : '';
      const workoutLine = hasExercise ? `Workouts: ${w.workout_count} session(s), ${w.total_minutes} min total` : '';

      prompt = `Write ONE encouraging sentence recapping yesterday's health. Start with "Yesterday".

${[nutritionLine, workoutLine].filter(Boolean).join('\n')}

Rules: ONE sentence, under 18 words, mention "yesterday", positive tone, highlight biggest win or gap. No numbers unless key.
Respond with ONLY the sentence.`;

    } else {
      // Today's progress (afternoon or evening)
      const n = hasNutrition ? await fetchFoodTotals(req.userId, todayStr) : { cal: 0, prot: 0, carbs: 0, fat: 0 };
      const w = hasExercise ? await fetchWorkoutTotals(req.userId, todayStr) : { workout_count: 0, total_minutes: 0 };

      const calRemaining = Math.round(goals.calories - n.cal);
      const protRemaining = Math.round(goals.protein_g - n.prot);

      if (period === 'afternoon') {
        const nutritionLine = hasNutrition
          ? `Nutrition goal: ${Math.round(goals.calories)} kcal, ${Math.round(goals.protein_g)}g protein\nLogged so far today: ${Math.round(n.cal)} kcal, ${Math.round(n.prot)}g protein\nRemaining: ${calRemaining > 0 ? calRemaining + ' kcal' : 'calorie goal hit'}, ${protRemaining > 0 ? protRemaining + 'g protein' : 'protein goal hit'}`
          : '';
        const workoutLine = hasExercise ? `Workout today: ${w.workout_count > 0 ? `${w.workout_count} session(s), ${w.total_minutes} min` : 'none yet'}` : '';

        prompt = `Write ONE motivating sentence about today's progress so far. Start with "Today".

${[nutritionLine, workoutLine].filter(Boolean).join('\n')}

Rules: ONE sentence, under 18 words, mention "today", focus on what's still achievable, actionable and positive. No numbers unless key.
Respond with ONLY the sentence.`;
      } else {
        const nutritionLine = hasNutrition
          ? `Nutrition goal: ${Math.round(goals.calories)} kcal, ${Math.round(goals.protein_g)}g protein\nActual today: ${Math.round(n.cal)} kcal, ${Math.round(n.prot)}g protein`
          : '';
        const workoutLine = hasExercise ? `Workouts: ${w.workout_count > 0 ? `${w.workout_count} session(s), ${w.total_minutes} min` : 'none'}` : '';

        prompt = `Write ONE sentence summarizing today and looking ahead to tomorrow. Start with "Today".

${[nutritionLine, workoutLine].filter(Boolean).join('\n')}

Rules: ONE sentence, under 18 words, mention "today", wrap up the day positively and set up tomorrow. No numbers unless key.
Respond with ONLY the sentence.`;
      }
    }

    const insight = await runConversation({
      model: 'haiku',
      systemPrompt: `You are a health coach providing brief, time-aware daily insights. Be concise and motivating. ${trackedDomainsText(features)}`,
      history: [],
      userMessage: prompt,
      maxTokens: 128,
    });

    const text = insight.trim();
    insightCache.set(cacheKey, { insight: text, timestamp: Date.now() });

    res.json({ text, period });
  } catch (err) {
    console.error('[ai-insight] Error:', err);
    return res.status(500).json({ error: 'Could not generate insight' });
  }
});

async function fetchFoodTotals(userId: number, date: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      COALESCE(SUM(f.calories_per100 * ss.grams * fl.quantity / 100), 0) as cal,
      COALESCE(SUM(f.protein_per100 * ss.grams * fl.quantity / 100), 0) as prot,
      COALESCE(SUM(f.carbs_per100 * ss.grams * fl.quantity / 100), 0) as carbs,
      COALESCE(SUM(f.fat_per100 * ss.grams * fl.quantity / 100), 0) as fat
     FROM food_log fl
     JOIN foods f ON f.id = fl.food_id
     JOIN serving_sizes ss ON ss.id = fl.serving_size_id
     WHERE fl.user_id = ? AND fl.log_date = ?`,
    [userId, date]
  );
  return rows[0] ?? { cal: 0, prot: 0, carbs: 0, fat: 0 };
}

async function fetchWorkoutTotals(userId: number, date: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as workout_count, COALESCE(SUM(duration_minutes), 0) as total_minutes
     FROM workout_logs WHERE user_id = ? AND DATE(workout_date) = ?`,
    [userId, date]
  );
  return rows[0] ?? { workout_count: 0, total_minutes: 0 };
}

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { history, message, context } = req.body as {
    history: ConversationMessage[];
    message: string;
    context?: ScreenContext;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (!Array.isArray(history)) {
    return res.status(400).json({ error: 'history must be an array' });
  }

  try {
    const contextDesc = buildContextDescription(context);
    const systemPrompt = buildSystemPrompt(contextDesc);

    const raw = await runConversation({
      model: 'haiku',
      systemPrompt,
      history,
      userMessage: message,
      maxTokens: 512,
    });

    // Strip any accidental markdown fences from model output
    const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed: AssistantResponse;
    try {
      parsed = JSON.parse(clean) as AssistantResponse;
    } catch {
      // Model didn't return valid JSON — wrap it as a plain answer
      parsed = { type: 'answer', text: raw.trim() };
    }

    return res.json(parsed);
  } catch (err) {
    console.error('[ai-assistant] Error:', err);
    return res.status(500).json({ error: 'AI assistant unavailable' });
  }
});

// ── POST /transcribe ──────────────────────────────────────────────────────────

router.post('/transcribe', async (req: Request, res: Response) => {
  const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };
  if (!audio) return res.status(400).json({ error: 'audio is required' });

  try {
    const transcript = await transcribeAudio(audio, mimeType || 'audio/mp4');
    return res.json({ transcript });
  } catch (err) {
    console.error('[ai-transcribe] Error:', err);
    return res.status(500).json({ error: 'Transcription failed' });
  }
});

export default router;

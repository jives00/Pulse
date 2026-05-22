import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { requireAuth } from '../middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';
import { runConversation } from '../services/aiProvider';

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
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

router.get('/insight', async (req: Request, res: Response) => {
  try {
    const clientHour = parseInt(req.query.hour as string, 10);
    const hour = Number.isFinite(clientHour) ? clientHour : new Date().getHours();
    const period = getInsightPeriod(hour);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const cacheKey = `${req.userId}:${todayStr}:${period}`;

    const cached = insightCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ text: cached.insight });
    }

    // Fetch goals (used by all periods)
    const [goalRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM user_goals WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`,
      [req.userId, todayStr]
    );
    const goals = goalRows[0] ?? { calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 65 };

    let prompt: string;

    if (period === 'morning') {
      // Yesterday recap
      const [foodRows] = await pool.query<RowDataPacket[]>(
        `SELECT
          COALESCE(SUM(f.calories_per100 * ss.grams * fl.quantity / 100), 0) as cal,
          COALESCE(SUM(f.protein_per100 * ss.grams * fl.quantity / 100), 0) as prot,
          COALESCE(SUM(f.carbs_per100 * ss.grams * fl.quantity / 100), 0) as carbs,
          COALESCE(SUM(f.fat_per100 * ss.grams * fl.quantity / 100), 0) as fat
         FROM food_log fl
         JOIN foods f ON f.id = fl.food_id
         JOIN serving_sizes ss ON ss.id = fl.serving_size_id
         WHERE fl.user_id = ? AND fl.log_date = ?`,
        [req.userId, yesterdayStr]
      );
      const [workoutRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as workout_count, COALESCE(SUM(duration_minutes), 0) as total_minutes
         FROM workout_logs WHERE user_id = ? AND DATE(workout_date) = ?`,
        [req.userId, yesterdayStr]
      );
      const n = foodRows[0] ?? { cal: 0, prot: 0, carbs: 0, fat: 0 };
      const w = workoutRows[0] ?? { workout_count: 0, total_minutes: 0 };

      prompt = `Write ONE encouraging sentence recapping yesterday's health. Start with "Yesterday".

Nutrition goal: ${Math.round(goals.calories)} kcal, ${Math.round(goals.protein_g)}g protein
Nutrition actual: ${Math.round(n.cal)} kcal, ${Math.round(n.prot)}g protein (${Math.round(n.cal - goals.calories > 0 ? n.cal - goals.calories : goals.calories - n.cal)} kcal ${n.cal > goals.calories ? 'over' : 'under'})
Workouts: ${w.workout_count} session(s), ${w.total_minutes} min total

Rules: ONE sentence, under 18 words, mention "yesterday", positive tone, highlight biggest win or gap. No numbers unless key.
Respond with ONLY the sentence.`;

    } else {
      // Today's progress (afternoon or evening)
      const [foodRows] = await pool.query<RowDataPacket[]>(
        `SELECT
          COALESCE(SUM(f.calories_per100 * ss.grams * fl.quantity / 100), 0) as cal,
          COALESCE(SUM(f.protein_per100 * ss.grams * fl.quantity / 100), 0) as prot,
          COALESCE(SUM(f.carbs_per100 * ss.grams * fl.quantity / 100), 0) as carbs,
          COALESCE(SUM(f.fat_per100 * ss.grams * fl.quantity / 100), 0) as fat
         FROM food_log fl
         JOIN foods f ON f.id = fl.food_id
         JOIN serving_sizes ss ON ss.id = fl.serving_size_id
         WHERE fl.user_id = ? AND fl.log_date = ?`,
        [req.userId, todayStr]
      );
      const [workoutRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as workout_count, COALESCE(SUM(duration_minutes), 0) as total_minutes
         FROM workout_logs WHERE user_id = ? AND DATE(workout_date) = ?`,
        [req.userId, todayStr]
      );
      const n = foodRows[0] ?? { cal: 0, prot: 0, carbs: 0, fat: 0 };
      const w = workoutRows[0] ?? { workout_count: 0, total_minutes: 0 };

      const calRemaining = Math.round(goals.calories - n.cal);
      const protRemaining = Math.round(goals.protein_g - n.prot);

      if (period === 'afternoon') {
        prompt = `Write ONE motivating sentence about today's progress so far. Start with "Today".

Nutrition goal: ${Math.round(goals.calories)} kcal, ${Math.round(goals.protein_g)}g protein
Logged so far today: ${Math.round(n.cal)} kcal, ${Math.round(n.prot)}g protein
Remaining: ${calRemaining > 0 ? calRemaining + ' kcal' : 'calorie goal hit'}, ${protRemaining > 0 ? protRemaining + 'g protein' : 'protein goal hit'}
Workout today: ${w.workout_count > 0 ? `${w.workout_count} session(s), ${w.total_minutes} min` : 'none yet'}

Rules: ONE sentence, under 18 words, mention "today", focus on what's still achievable, actionable and positive. No numbers unless key.
Respond with ONLY the sentence.`;
      } else {
        prompt = `Write ONE sentence summarizing today and looking ahead to tomorrow. Start with "Today".

Nutrition goal: ${Math.round(goals.calories)} kcal, ${Math.round(goals.protein_g)}g protein
Actual today: ${Math.round(n.cal)} kcal, ${Math.round(n.prot)}g protein
Workouts: ${w.workout_count > 0 ? `${w.workout_count} session(s), ${w.total_minutes} min` : 'none'}

Rules: ONE sentence, under 18 words, mention "today", wrap up the day positively and set up tomorrow. No numbers unless key.
Respond with ONLY the sentence.`;
      }
    }

    const insight = await runConversation({
      model: 'haiku',
      systemPrompt: 'You are a health coach providing brief, time-aware daily insights. Be concise and motivating.',
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

export default router;

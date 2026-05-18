import { Router, Request, Response } from 'express';
import { runConversation } from '../services/aiProvider';

const router = Router();

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

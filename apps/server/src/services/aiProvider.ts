import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

// ── Clients (lazy-initialized so missing keys don't crash at import time) ───

let _anthropic: Anthropic | null = null;
let _gemini: GoogleGenerativeAI | null = null;

function getAnthropic(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getGemini(): GoogleGenerativeAI | null {
  if (!env.GEMINI_API_KEY) return null;
  if (!_gemini) _gemini = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return _gemini;
}

// ── Model mapping ─────────────────────────────────────────────────────────────

const ANTHROPIC_MODELS = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
} as const;

const GEMINI_MODELS = {
  haiku:  'gemini-1.5-flash',
  sonnet: 'gemini-1.5-pro',
} as const;

type ModelTier = 'haiku' | 'sonnet';

// ── runText ───────────────────────────────────────────────────────────────────
// Returns plain text (or JSON-as-text) from the model.

export async function runText(params: {
  model: ModelTier;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens: number;
}): Promise<string> {
  const { model, systemPrompt, userPrompt, maxTokens } = params;

  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODELS[model],
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: userPrompt }],
      });
      return (msg.content[0] as Anthropic.TextBlock).text;
    } catch (err) {
      if (!env.GEMINI_API_KEY) throw err;
      console.warn('[aiProvider] Anthropic failed, falling back to Gemini:', (err as Error).message);
    }
  }

  const gemini = getGemini();
  if (!gemini) throw new Error('No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)');

  const geminiModel = gemini.getGenerativeModel({ model: GEMINI_MODELS[model] });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  const result = await geminiModel.generateContent(fullPrompt);
  return result.response.text();
}

// ── runWithTools ──────────────────────────────────────────────────────────────
// For structured tool-use calls. Tries Anthropic tool_choice first; falls back
// to instructing Gemini to return a JSON object matching the schema.

export async function runWithTools(params: {
  model: ModelTier;
  prompt: string;
  maxTokens?: number;
  tool: {
    name: string;
    description: string;
    schema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}): Promise<Record<string, unknown>> {
  const { model, prompt, maxTokens = 512, tool } = params;

  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const anthropicTool: Anthropic.Tool = {
        name: tool.name,
        description: tool.description,
        input_schema: tool.schema,
      };
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODELS[model],
        max_tokens: maxTokens,
        tools: [anthropicTool],
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: prompt }],
      });
      const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (!toolUse) throw new Error('No tool use block in Anthropic response');
      return toolUse.input as Record<string, unknown>;
    } catch (err) {
      if (!env.GEMINI_API_KEY) throw err;
      console.warn('[aiProvider] Anthropic failed, falling back to Gemini:', (err as Error).message);
    }
  }

  const gemini = getGemini();
  if (!gemini) throw new Error('No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)');

  // Build a required-fields description for the JSON instruction
  const requiredFields = tool.schema.required ?? Object.keys(tool.schema.properties);
  const schemaDesc = requiredFields.map((k) => {
    const prop = (tool.schema.properties[k] as any);
    const type = prop?.type ?? 'any';
    const desc = prop?.description ? ` (${prop.description})` : '';
    return `  "${k}": ${type}${desc}`;
  }).join(',\n');

  const geminiPrompt = `${prompt}

Respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.
Required fields:
{
${schemaDesc}
}`;

  const geminiModel = gemini.getGenerativeModel({ model: GEMINI_MODELS[model] });
  const result = await geminiModel.generateContent(geminiPrompt);
  const text = result.response.text().trim();
  // Strip any accidental markdown fences
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean) as Record<string, unknown>;
}

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
      console.log(`[ai] calling Anthropic ${ANTHROPIC_MODELS[model]}`);
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODELS[model],
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: userPrompt }],
      });
      return (msg.content[0] as Anthropic.TextBlock).text;
    } catch (err) {
      if (!env.GEMINI_API_KEY) throw err;
      console.warn('[ai] Anthropic failed, falling back to Gemini:', (err as Error).message);
    }
  }

  const gemini = getGemini();
  if (!gemini) throw new Error('No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)');

  console.log(`[ai] calling Gemini ${GEMINI_MODELS[model]}`);
  const geminiModel = gemini.getGenerativeModel({ model: GEMINI_MODELS[model] });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
  const result = await geminiModel.generateContent(fullPrompt);
  return result.response.text();
}

// ── runConversation ───────────────────────────────────────────────────────────
// Multi-turn conversation with history. Anthropic uses native messages array;
// Gemini flattens history into a single prompt string.

export async function runConversation(params: {
  model: ModelTier;
  systemPrompt: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  userMessage: string;
  maxTokens: number;
}): Promise<string> {
  const { model, systemPrompt, history, userMessage, maxTokens } = params;

  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      console.log(`[ai] calling Anthropic ${ANTHROPIC_MODELS[model]} (conversation)`);
      const messages: Anthropic.MessageParam[] = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];
      const msg = await anthropic.messages.create({
        model: ANTHROPIC_MODELS[model],
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      });
      return (msg.content[0] as Anthropic.TextBlock).text;
    } catch (err) {
      if (!env.GEMINI_API_KEY) throw err;
      console.warn('[ai] Anthropic failed, falling back to Gemini:', (err as Error).message);
    }
  }

  const gemini = getGemini();
  if (!gemini) throw new Error('No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)');

  console.log(`[ai] calling Gemini ${GEMINI_MODELS[model]} (conversation)`);
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
  const fullPrompt = [
    systemPrompt,
    historyText ? `\nConversation so far:\n${historyText}` : '',
    `\nUser: ${userMessage}`,
    '\nAssistant:',
  ].join('');

  const geminiModel = gemini.getGenerativeModel({ model: GEMINI_MODELS[model] });
  const result = await geminiModel.generateContent(fullPrompt);
  return result.response.text();
}

// ── transcribeAudio ───────────────────────────────────────────────────────────
// Uses Gemini 1.5 Flash to transcribe base64-encoded audio. Anthropic does not
// support audio input, so Gemini is required for this feature.

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const gemini = getGemini();
  if (!gemini) throw new Error('GEMINI_API_KEY is required for audio transcription');

  const model = gemini.getGenerativeModel({ model: GEMINI_MODELS.haiku });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64Audio } },
    'Transcribe this audio exactly as spoken. Return only the transcribed text, nothing else. If the audio is silent or unclear, return an empty string.',
  ]);
  return result.response.text().trim();
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
      console.log(`[ai] calling Anthropic ${ANTHROPIC_MODELS[model]} (tools: ${tool.name})`);
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
      console.warn('[ai] Anthropic failed, falling back to Gemini:', (err as Error).message);
    }
  }

  const gemini = getGemini();
  if (!gemini) throw new Error('No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)');

  console.log(`[ai] calling Gemini ${GEMINI_MODELS[model]} (tools: ${tool.name})`);

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

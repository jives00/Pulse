import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import type { MacroEstimatePayload, MacroEstimateResult } from '../types';

const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

const tool: Anthropic.Tool = {
  name: 'set_nutrition',
  description: 'Set the estimated nutrition facts per 100g of food',
  input_schema: {
    type: 'object' as const,
    properties: {
      calories:   { type: 'number', description: 'kcal per 100g' },
      carbs_g:    { type: 'number', description: 'total carbohydrates in grams per 100g' },
      protein_g:  { type: 'number', description: 'protein in grams per 100g' },
      fat_g:      { type: 'number', description: 'total fat in grams per 100g' },
      fiber_g:    { type: 'number', description: 'dietary fiber in grams per 100g' },
      sodium_mg:  { type: 'number', description: 'sodium in milligrams per 100g' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'estimation confidence' },
    },
    required: ['calories', 'carbs_g', 'protein_g', 'fat_g', 'confidence'],
  },
};

export async function estimateMacros(payload: MacroEstimatePayload): Promise<MacroEstimateResult> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');

  const { name, brand, description, knownMacros } = payload;

  const knownParts = knownMacros
    ? Object.entries(knownMacros)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : null;

  const prompt = [
    `Estimate the nutrition facts per 100g for: ${name}${brand ? ` by ${brand}` : ''}.`,
    description ? `Description: ${description}` : '',
    knownParts ? `Known values (do not change): ${knownParts}` : '',
    'Use your knowledge of typical food composition. If the food is ambiguous, use a common preparation.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    tools: [tool],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool use in response');

  const input = toolUse.input as {
    calories: number; carbs_g: number; protein_g: number; fat_g: number;
    fiber_g?: number; sodium_mg?: number; confidence: string;
  };

  // Apply known values on top (don't let Claude override what user already knows)
  return {
    nutrition: {
      calories: knownMacros?.calories ?? input.calories,
      carbs:    knownMacros?.carbs    ?? input.carbs_g,
      protein:  knownMacros?.protein  ?? input.protein_g,
      fat:      knownMacros?.fat      ?? input.fat_g,
      fiber:    knownMacros?.fiber    ?? input.fiber_g,
      sodium:   knownMacros?.sodium   ?? input.sodium_mg,
    },
    confidence: input.confidence as MacroEstimateResult['confidence'],
  };
}

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function suggestTags(recipe: any, ingredientNames: string[], availableTags?: string[]): Promise<string[]> {
  const tagInstruction = availableTags?.length
    ? `Choose only from this list of available tags (return the exact strings): ${availableTags.join(', ')}`
    : recipe.type === 'cocktail'
      ? 'Example cocktail tags: Sour, Tiki, Stirred, Shaken, Tropical, Creamy, Low ABV, Classic, Modern, Citrus'
      : 'Example food tags: Italian, Vegetarian, Quick, Comfort Food, Grilled, Spicy, Gluten-Free, One-Pan';

  const prompt = `Suggest 3-6 tags for this ${recipe.type} recipe.
Name: ${recipe.name}
Ingredients: ${ingredientNames.join(', ')}
${recipe.steps?.length ? `Steps summary: ${recipe.steps.slice(0, 2).join('. ')}` : ''}

${tagInstruction}

Return only a JSON array of tag name strings. No other text.`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = (message.content[0] as any).text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(text);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

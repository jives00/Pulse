import { runText } from './aiProvider';

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

  try {
    const text = await runText({ model: 'haiku', userPrompt: prompt, maxTokens: 256 });
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(clean);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

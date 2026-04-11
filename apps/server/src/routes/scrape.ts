import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { runWithTools, runText } from '../services/aiProvider';
import { suggestTags } from '../services/claude';
import { pool } from '../config/database';

const router = Router();

const LOWERCASE_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'into', 'up', 'as']);

function decodeHtmlEntities(str: string): string {
  if (!str) return str;
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function toTitleCase(s: string): string {
  if (!s) return s;
  return s.replace(/\w\S*/g, (word, offset) => {
    if (offset > 0 && LOWERCASE_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

function titleCaseIngredients(ingredients: any[]): any[] {
  return ingredients.map((ing) => ({ ...ing, name: toTitleCase((ing.name || '').trim()) }));
}

function hasNutrition(recipe: any): boolean {
  return recipe.calories != null || recipe.carbs_g != null || recipe.protein_g != null || recipe.fat_g != null;
}

// ── Shared tool schemas ───────────────────────────────────────────────────────

const nutritionEstimateTool = {
  name: 'nutrition_estimate',
  description: 'Estimated nutritional values per serving for a recipe.',
  schema: {
    type: 'object' as const,
    properties: {
      calories:   { type: 'number', description: 'Calories per serving (kcal), rounded to nearest integer' },
      carbs_g:    { type: 'number', description: 'Total carbohydrates per serving in grams, 1 decimal' },
      protein_g:  { type: 'number', description: 'Protein per serving in grams, 1 decimal' },
      fat_g:      { type: 'number', description: 'Total fat per serving in grams, 1 decimal' },
      fiber_g:    { type: 'number', description: 'Dietary fiber per serving in grams, 1 decimal' },
      sodium_mg:  { type: 'number', description: 'Sodium per serving in milligrams, rounded to nearest integer' },
    },
    required: ['calories', 'carbs_g', 'protein_g', 'fat_g', 'fiber_g', 'sodium_mg'],
  },
};

const extractRecipeTool = {
  name: 'extract_recipe',
  description: 'Extract structured recipe data from text. Use null for any fields not found.',
  schema: {
    type: 'object' as const,
    properties: {
      name:        { type: 'string' },
      type:        { type: 'string', enum: ['cocktail', 'food'] },
      description: { type: ['string', 'null'] },
      prep_time:   { type: ['number', 'null'] },
      cook_time:   { type: ['number', 'null'] },
      servings:    { type: ['number', 'null'] },
      subcategory: { type: ['string', 'null'], enum: ['main', 'side', 'breakfast', 'dessert', null] },
      glass_type:  { type: ['string', 'null'] },
      source:      { type: ['string', 'null'] },
      photo_url:   { type: ['string', 'null'] },
      calories:    { type: ['number', 'null'] },
      carbs_g:     { type: ['number', 'null'] },
      protein_g:   { type: ['number', 'null'] },
      fat_g:       { type: ['number', 'null'] },
      fiber_g:     { type: ['number', 'null'] },
      sodium_mg:   { type: ['number', 'null'] },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:     { type: 'string' },
            quantity: { type: ['number', 'null'] },
            unit:     { type: ['string', 'null'], description: 'The unit exactly as written in the source text. Do NOT convert or normalize.' },
          },
          required: ['name', 'quantity', 'unit'],
        },
      },
      steps: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'type', 'ingredients', 'steps'],
  },
};

async function estimateNutrition(recipe: any): Promise<void> {
  if (recipe.type === 'cocktail' || hasNutrition(recipe)) return;
  try {
    const ingredientList = (recipe.ingredients ?? [])
      .map((i: any) => [i.quantity, i.unit, i.name].filter(Boolean).join(' '))
      .join('\n');
    const servings = recipe.servings ?? 1;
    const prompt = `Estimate the nutritional information per serving for this recipe. Base your estimates on standard nutritional data for the ingredients listed.

Recipe: ${recipe.name}
Servings: ${servings}

Ingredients:
${ingredientList}`;

    const n = await runWithTools({ model: 'haiku', prompt, tool: nutritionEstimateTool });
    recipe.calories   = n.calories   ?? null;
    recipe.carbs_g    = n.carbs_g    ?? null;
    recipe.protein_g  = n.protein_g  ?? null;
    recipe.fat_g      = n.fat_g      ?? null;
    recipe.fiber_g    = n.fiber_g    ?? null;
    recipe.sodium_mg  = n.sodium_mg  ?? null;
  } catch {
    // Non-fatal — leave nutrition fields null if estimation fails
  }
}

// ── JSON-LD helpers ───────────────────────────────────────────────────────────

// Try to extract a Recipe JSON-LD block from the page — most recipe sites include this
function extractJsonLd(html: string): any | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const el of scripts) {
    try {
      const data = JSON.parse($(el).html() || '');
      // Collect all candidate objects to search
      const candidates: any[] = [];
      const items = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      for (const item of items) {
        candidates.push(item);
        // Handle mainEntity pattern: WebPage wrapping a Recipe
        if (item.mainEntity) candidates.push(item.mainEntity);
      }
      for (const item of candidates) {
        if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
          return item;
        }
      }
    } catch { /* skip malformed blocks */ }
  }
  return null;
}

// Convert a JSON-LD Recipe object into our internal format
function parseJsonLd(ld: any, sourceUrl: string): any {
  function parseTime(iso?: string): number | null {
    if (!iso) return null;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!m) return null;
    return (parseInt(m[1] || '0') * 60) + parseInt(m[2] || '0');
  }

  function capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  const UNITS = ['tablespoons', 'tablespoon', 'teaspoons', 'teaspoon', 'cups', 'cup',
    'tbsp', 'tsp', 'oz', 'ounces', 'ounce', 'lbs', 'lb', 'pounds', 'pound',
    'grams', 'gram', 'g', 'kg', 'ml', 'liters', 'liter', 'l',
    'cloves', 'clove', 'cans', 'can', 'slices', 'slice', 'pieces', 'piece',
    'dashes', 'dash', 'pinch', 'sprig', 'sprigs'];

  // Parse a quantity string that may be a fraction (1/2), mixed number (1 1/2),
  // range (3-4), or decimal — returns [value, tokensConsumed]
  function parseQty(parts: string[]): [number | null, number] {
    // Normalize unicode fractions
    const unicodeFracs: Record<string, number> = { '½':0.5,'⅓':0.333,'⅔':0.667,'¼':0.25,'¾':0.75,'⅕':0.2,'⅖':0.4,'⅗':0.6,'⅘':0.8,'⅙':0.167,'⅚':0.833,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875 };
    const token = parts[0]?.trim();
    if (!token) return [null, 0];

    // Unicode fraction alone e.g. "½"
    if (unicodeFracs[token] !== undefined) return [unicodeFracs[token], 1];

    // Range like "3-4" — take first number
    const rangeMatch = token.match(/^(\d+\.?\d*)-[\d]/);
    if (rangeMatch) return [parseFloat(rangeMatch[1]), 1];

    // Plain fraction like "1/2"
    const fracMatch = token.match(/^(\d+)\/(\d+)$/);
    if (fracMatch) return [parseInt(fracMatch[1]) / parseInt(fracMatch[2]), 1];

    // Whole number possibly followed by fraction "1 1/2", unicode "1 ½", range "3 - 4", or "3 to 4"
    const intMatch = token.match(/^(\d+\.?\d*)(-?)$/);
    if (intMatch) {
      const whole = parseFloat(intMatch[1]);
      // Next token is a unicode fraction like "½"
      const unicodeNext = unicodeFracs[parts[1]?.trim()];
      if (unicodeNext !== undefined) return [whole + unicodeNext, 2];
      // Next token is a fraction like "1/2"
      const nextFrac = parts[1]?.match(/^(\d+)\/(\d+)$/);
      if (nextFrac) return [whole + parseInt(nextFrac[1]) / parseInt(nextFrac[2]), 2];
      // Next token is standalone "-" or "to" or "or" (range separator) — skip it and the number after
      if ((parts[1] === '-' || parts[1]?.toLowerCase() === 'to' || parts[1]?.toLowerCase() === 'or') && parts[2]?.match(/^\d/)) return [whole, 3];
      // Next token is range upper bound attached like "3-" then "4"
      if (intMatch[2] === '-' && parts[1]?.match(/^\d+\.?\d*$/)) return [whole, 2];
      // Next token is a plain number (upper bound, no separator)
      if (parts[1]?.match(/^\d+\.?\d*$/) && !UNITS.find(u => parts[1]?.toLowerCase() === u)) return [whole, 2];
      return [whole, 1];
    }

    return [null, 0];
  }

  const ingredients = (ld.recipeIngredient || []).map((raw: string) => {
    const trimmed = raw.trim();
    const parts = trimmed.split(/\s+/);

    const [qty, consumed] = parseQty(parts);
    let offset = consumed;

    const unitToken = parts[offset]?.toLowerCase().replace(/[.,;]$/, '');
    const matchedUnit = UNITS.find(u => unitToken === u);
    const hasUnit = qty !== null && !!matchedUnit;

    let nameOffset = hasUnit ? offset + 1 : offset;
    // Skip connector words like "of" between unit and name (e.g. "1 tsp of salt")
    if (parts[nameOffset]?.toLowerCase() === 'of') nameOffset++;
    const nameParts = parts.slice(nameOffset);
    const name = toTitleCase(nameParts.join(' ') || trimmed);

    return {
      quantity: qty,
      unit: hasUnit ? parts[offset] : null,
      name,
    };
  });

  // Handle flat steps, HowToStep objects, and nested HowToSection arrays
  function extractSteps(instructions: any[]): string[] {
    const steps: string[] = [];
    for (const item of instructions) {
      if (typeof item === 'string') {
        steps.push(decodeHtmlEntities(item));
      } else if (item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
        steps.push(...extractSteps(item.itemListElement));
      } else if (item.text) {
        steps.push(decodeHtmlEntities(item.text));
      }
    }
    return steps.filter(Boolean);
  }

  const steps = extractSteps(ld.recipeInstructions || []);

  const nutrition = ld.nutrition || {};
  function parseNutrient(val?: string, round = 1): number | null {
    if (!val) return null;
    const n = parseFloat(val);
    if (isNaN(n)) return null;
    return round === 0 ? Math.round(n) : Math.round(n * 10 ** round) / 10 ** round;
  }

  // Find best photo URL from various JSON-LD image formats
  let photo_url: string | null = null;
  if (ld.image) {
    if (typeof ld.image === 'string') {
      photo_url = ld.image;
    } else if (Array.isArray(ld.image)) {
      const first = ld.image[0];
      photo_url = typeof first === 'string' ? first : first?.url ?? null;
    } else if (typeof ld.image === 'object') {
      photo_url = ld.image.url ?? ld.image.contentUrl ?? null;
    }
  }

  function cleanRecipeName(raw: string): string {
    const fillerPrefix = /^(the\s+)?(best(\s+ever)?|ultimate|perfect|easiest|most\s+amazing|famous|favorite|favourite|homemade)\s+/i;
    const myPrefix = /^my\s+(best|favorite|favourite|homemade|easy|quick)\s+/i;
    let name = raw.trim();
    name = name.replace(fillerPrefix, '');
    name = name.replace(myPrefix, '');
    // Capitalize first letter after stripping
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function inferType(ld: any): 'cocktail' | 'food' {
    const haystack = [
      ld.name || '',
      ld.description || '',
      Array.isArray(ld.recipeCategory) ? ld.recipeCategory.join(' ') : (ld.recipeCategory || ''),
      Array.isArray(ld.recipeCuisine) ? ld.recipeCuisine.join(' ') : (ld.recipeCuisine || ''),
      Array.isArray(ld.keywords) ? ld.keywords.join(' ') : (ld.keywords || ''),
    ].join(' ').toLowerCase();
    if (/cocktail|mocktail|drink|beverage|spirit|liqueur|whiskey|whisky|bourbon|gin|vodka|rum|tequila|mezcal|vermouth|aperitif|digestif|martini|margarita|negroni|manhattan|daiquiri|old fashioned|highball|punch|spritz/.test(haystack)) {
      return 'cocktail';
    }
    return 'food';
  }

  function inferSubcategory(category: any): string | null {
    if (!category) return null;
    const val = (Array.isArray(category) ? category.join(' ') : String(category)).toLowerCase();
    if (/breakfast|brunch|morning/.test(val)) return 'breakfast';
    if (/dessert|sweet|cake|cookie|pie|pastry/.test(val)) return 'dessert';
    if (/side|salad|soup|appetizer|starter|snack/.test(val)) return 'side';
    if (/main|dinner|lunch|entree|entrée/.test(val)) return 'main';
    return null;
  }

  function parseServings(yield_: any): number | null {
    if (!yield_) return null;
    const s = Array.isArray(yield_) ? yield_[0] : yield_;
    const n = parseInt(String(s));
    return isNaN(n) ? null : n;
  }

  return {
    name: cleanRecipeName(decodeHtmlEntities(ld.name || '<UNKNOWN>')),
    type: inferType(ld),
    description: ld.description ? decodeHtmlEntities(ld.description) : null,
    prep_time: parseTime(ld.prepTime),
    cook_time: parseTime(ld.cookTime),
    servings: parseServings(ld.recipeYield),
    subcategory: inferSubcategory(ld.recipeCategory),
    glass_type: null,
    source: sourceUrl,
    photo_url,
    calories: parseNutrient(nutrition.calories, 0),
    carbs_g: parseNutrient(nutrition.carbohydrateContent),
    protein_g: parseNutrient(nutrition.proteinContent),
    fat_g: parseNutrient(nutrition.fatContent),
    fiber_g: parseNutrient(nutrition.fiberContent),
    sodium_mg: parseNutrient(nutrition.sodiumContent, 0),
    ingredients,
    steps,
    extracted_tags: ((): string[] => {
      const tags: string[] = [];
      if (ld.keywords) {
        const kw = Array.isArray(ld.keywords) ? ld.keywords : String(ld.keywords).split(',');
        tags.push(...kw.map((k: string) => k.trim()).filter((k: string) => k.length > 0 && k.length < 40));
      }
      return [...new Set(tags)].slice(0, 8);
    })(),
  };
}

function isYouTubeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'youtu.be' || hostname === 'm.youtube.com';
  } catch { return false; }
}

function extractYouTubeMeta(html: string): { title: string | null; description: string | null; thumbnail: string | null } {
  try {
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var |if\s*\(|<)/s);
    if (!match) return { title: null, description: null, thumbnail: null };
    const data = JSON.parse(match[1]);
    const details = data?.videoDetails;
    const title = details?.title ?? null;
    const description = details?.shortDescription ?? null;
    const thumbnails: any[] = details?.thumbnail?.thumbnails ?? [];
    const thumbnail = thumbnails.length ? thumbnails[thumbnails.length - 1].url : null;
    return { title, description, thumbnail };
  } catch {
    return { title: null, description: null, thumbnail: null };
  }
}

// POST /api/recipes/parse-text — parse a pasted recipe text using AI
router.post('/parse-text', async (req: Request, res: Response) => {
  try {
    const { text, typeHint } = req.body;
    if (!text?.trim()) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const unitInstruction = 'IMPORTANT: For each ingredient, preserve the unit EXACTLY as written in the source text. Do NOT convert or normalize units (e.g., if the text says "cup", use "cup" — not "oz"; if it says "pound", use "pound" — not "oz").';
    const userMessage = typeHint
      ? `Extract the recipe from this text. The type is: ${typeHint}. ${unitInstruction}\n\nRecipe text:\n${text.trim().slice(0, 20000)}`
      : `Extract the recipe from this text. Determine whether it is a cocktail/drink or food recipe and set the type field accordingly. ${unitInstruction}\n\nRecipe text:\n${text.trim().slice(0, 20000)}`;

    const recipeData = await runWithTools({ model: 'sonnet', prompt: userMessage, tool: extractRecipeTool });
    const recipe = recipeData as any;
    recipe.ingredients = titleCaseIngredients(recipe.ingredients ?? []);

    await estimateNutrition(recipe);
    try {
      const [tagRows] = await pool.execute<any[]>(
        'SELECT name FROM tag_definitions WHERE user_id = ?',
        [req.userId]
      );
      const availableTags = tagRows.map((r: any) => r.name);
      recipe.suggested_tags = await suggestTags(recipe, recipe.ingredients?.map((i: any) => i.name) ?? [], availableTags);
    } catch {
      recipe.suggested_tags = [];
    }

    res.json(recipe);
  } catch (err) {
    console.error('Parse text error:', err);
    res.status(500).json({ error: 'Failed to parse recipe text' });
  }
});

// POST /api/recipes/scrape
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, typeHint } = req.body;
    if (!url) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    console.log('Scraping URL:', url);

    // YouTube: extract description from embedded player response JSON
    if (isYouTubeUrl(url)) {
      // Force English by adding hl=en to the URL and setting the PREF cookie
      const ytUrl = new URL(url);
      ytUrl.searchParams.set('hl', 'en');
      const response = await fetch(ytUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'PREF=hl=en&gl=US; YSC=x; VISITOR_INFO1_LIVE=x',
        },
      });
      const html = await response.text();
      const { title, description, thumbnail } = extractYouTubeMeta(html);

      if (!description || description.trim().length < 50) {
        res.status(422).json({ error: 'No recipe found in the video description. Try pasting the description text manually.' });
        return;
      }

      const hint = typeHint ? `The recipe type is: ${typeHint}. ` : '';
      const userMessage = `${hint}Extract the recipe from this YouTube video description. Respond in English regardless of the description's language. Translate any non-English content. IMPORTANT: preserve each ingredient's unit EXACTLY as written — do NOT convert or normalize units. Video title: "${title || 'Unknown'}"\n\nDescription:\n${description.slice(0, 20000)}`;

      const recipeData = await runWithTools({ model: 'sonnet', prompt: userMessage, tool: extractRecipeTool });
      const recipe = recipeData as any;
      recipe.source = url;
      recipe.photo_url = thumbnail;
      recipe.ingredients = titleCaseIngredients(recipe.ingredients ?? []);

      await estimateNutrition(recipe);
      try {
        recipe.suggested_tags = await suggestTags(recipe, recipe.ingredients?.map((i: any) => i.name) ?? []);
      } catch {
        recipe.suggested_tags = [];
      }

      res.json(recipe);
      return;
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    const html = await response.text();
    // Detect bot-protection pages before attempting extraction
    const cfStrings = [
      'Enable JavaScript and cookies to continue',
      'cf-browser-verification',
      'Just a moment...',
      'Checking if the site connection is secure',
      'DDoS protection by Cloudflare',
      'Attention Required! | Cloudflare',
      'Please turn JavaScript on and reload the page',
    ];
    if (cfStrings.some(s => html.includes(s))) {
      res.status(422).json({ error: 'This site uses bot protection and cannot be scraped automatically. Copy and paste the recipe text instead.' });
      return;
    }

    // Try JSON-LD first — most recipe sites include this and it's perfectly structured
    const jsonLd = extractJsonLd(html);
    if (jsonLd) {
      console.log('Found JSON-LD recipe data');
      const recipe = parseJsonLd(jsonLd, url);
      const extractedTags: string[] = recipe.extracted_tags ?? [];
      delete recipe.extracted_tags;
      await estimateNutrition(recipe);
      try {
        recipe.suggested_tags = extractedTags.length
          ? extractedTags
          : await suggestTags(recipe, recipe.ingredients.map((i: any) => i.name));
      } catch {
        recipe.suggested_tags = [];
      }
      res.json(recipe);
      return;
    }

    // Fallback: send page text to AI
    console.log('No JSON-LD found, falling back to AI extraction');
    const $ = cheerio.load(html);
    $('script, style, nav, footer, aside, header, [role="banner"], [role="navigation"], [role="complementary"]').remove();
    // Prefer focused content areas over the full body to reduce token count
    const main = $('main, article').first();
    const text = (main.length ? main : $('body')).text().replace(/\s+/g, ' ').trim().slice(0, 15000);

    if (text.length < 200) {
      res.status(422).json({ error: 'No readable content found on this page. The site may require JavaScript to load content. Try copying and pasting the recipe text instead.' });
      return;
    }

    const userMessage = typeHint
      ? `Extract the recipe from this page. The type is: ${typeHint}. IMPORTANT: preserve each ingredient's unit EXACTLY as written — do NOT convert or normalize units.\n\nPage content:\n${text}`
      : `Extract the recipe from this page. Determine whether it is a cocktail/drink or food recipe and set the type field accordingly. IMPORTANT: preserve each ingredient's unit EXACTLY as written — do NOT convert or normalize units.\n\nPage content:\n${text}`;

    const recipeData = await runWithTools({ model: 'sonnet', prompt: userMessage, tool: extractRecipeTool });
    const recipe = recipeData as any;
    recipe.source = recipe.source || url;
    if (recipe.name) recipe.name = recipe.name.replace(/^(the\s+)?(best(\s+ever)?|ultimate|perfect|easiest|most\s+amazing|famous|favorite|favourite|homemade)\s+/i, '').replace(/^my\s+(best|favorite|favourite|homemade|easy|quick)\s+/i, '').trim();
    recipe.ingredients = titleCaseIngredients(recipe.ingredients ?? []);
    console.log('AI extracted:', recipe.name, '| ingredients:', recipe.ingredients?.length, '| steps:', recipe.steps?.length);

    // If AI couldn't find a recipe (JS-rendered page or missing content), tell the user to paste manually
    if ((!recipe.name || recipe.name === 'UNKNOWN') && (!recipe.ingredients?.length) && (!recipe.steps?.length)) {
      res.status(422).json({ error: 'No recipe found on this page. The site may require JavaScript to load content. Try copying and pasting the recipe text instead.' });
      return;
    }

    await estimateNutrition(recipe);
    try {
      recipe.suggested_tags = await suggestTags(recipe, recipe.ingredients?.map((i: any) => i.name) ?? []);
    } catch {
      recipe.suggested_tags = [];
    }

    res.json(recipe);
  } catch (err) {
    console.error('Scrape error:', err);
    res.status(500).json({ error: 'Failed to scrape or parse recipe' });
  }
});

export default router;

const express = require('express');

const router = express.Router();

const LLM_URL        = process.env.LLM_URL || 'http://localhost:8080';
const LLM_MODEL      = 'mlx-community/Qwen3.6-35B-A3B-4bit';
const CONCEPTS_MODEL = 'mlx-community/phi-4-4bit';
const NUM_PREDICT   = 6000;
const MODEL_TIMEOUT = 180_000;

// In-memory job store; entries expire after 15 minutes
const _jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of _jobs) {
    if (job.ts < cutoff) _jobs.delete(id);
  }
}, 60 * 1000);

// Rolling log of recently suggested concept titles (last 30 per type).
// Injected into concept prompts so the model is explicitly told not to repeat them.
const _recentTitles = { recipe: [], cocktail: [] };
const RECENT_TITLES_MAX = 30;
function recordTitles(titles, type) {
  const bucket = _recentTitles[type] || [];
  bucket.push(...titles);
  _recentTitles[type] = bucket.slice(-RECENT_TITLES_MAX);
}

function newJob() {
  const id = Math.random().toString(36).slice(2, 18);
  _jobs.set(id, { status: 'pending', tokens: [], ts: Date.now() });
  return id;
}

function updateJob(id, patch) {
  const job = _jobs.get(id);
  if (job) Object.assign(job, patch, { ts: Date.now() });
}

function safeModel(_m) {
  return LLM_MODEL;
}

function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Extracts the recipe JSON from model output, which may include thinking preamble.
// Collects ALL complete {…} objects via brace-depth matching, sorts by length
// descending, and returns the largest parseable one — the recipe is always
// the biggest object. Falls back to repairing the largest candidate if truncated.
function extractJson(text) {
  const s = stripThinking(text);
  try { return JSON.parse(s); } catch (_) {}

  // Collect every complete {…} block
  const candidates = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (esc)               { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"')         { inStr = !inStr; continue; }
      if (inStr)             continue;
      if (c === '{')         depth++;
      if (c === '}' && --depth === 0) { end = j; break; }
    }
    if (end !== -1) candidates.push(s.slice(i, end + 1));
  }

  // Largest parseable candidate is the recipe (not a tiny thinking fragment)
  candidates.sort((a, b) => b.length - a.length);
  for (const block of candidates) {
    try { return JSON.parse(block); } catch (_) {}
  }

  // Repair the largest candidate (truncated output)
  if (candidates.length > 0) {
    let block = candidates[0];
    if ((block.match(/"/g) || []).length % 2 !== 0) block += '"';
    const openArrays = (block.match(/\[/g) || []).length - (block.match(/\]/g) || []).length;
    const openBraces = (block.match(/\{/g) || []).length - (block.match(/\}/g) || []).length;
    for (let i = 0; i < openArrays; i++) block += ']';
    for (let i = 0; i < openBraces;  i++) block += '}';
    try { return JSON.parse(block); } catch (_) {}
  }

  throw new Error('Could not parse model output as JSON after repair attempts');
}

function buildPrompt(ingredients, type, cookTime, concept) {
  const label = type === 'cocktail' ? 'cocktail' : 'food recipe';
  const subcategoryNote = type === 'cocktail'
    ? 'Set subcategory to empty string "".'
    : 'Set subcategory to one of: breakfast, lunch, dinner, dessert.';

  const cookTimeNote = cookTime
    ? `\nTarget total cook + prep time: ${cookTime}. Adjust the recipe complexity accordingly.`
    : '';

  const metaFields = type === 'cocktail'
    ? ''
    : `\n  "servings": "4",\n  "prep_time": "10 min",\n  "cook_time": "20 min",`;

  let intro;
  if (type === 'cocktail') {
    intro = concept
      ? `Create a cocktail called "${concept.title}" — ${concept.tagline}. Choose 2–4 of these available ingredients that work harmoniously together`
      : `Create a well-balanced cocktail. From this list of available ingredients, choose only the 2–4 that work best together — do NOT use them all`;
  } else {
    intro = concept
      ? `Create a food recipe called "${concept.title}" — ${concept.tagline} — using`
      : `Create a food recipe using some of`;
  }

  const cocktailNote = type === 'cocktail'
    ? `\nA good cocktail uses a focused set of complementary spirits and mixers. Ignore ingredients that would clash or muddy the flavor. You may add common bar staples (simple syrup, soda water, ice, citrus, salt rim, etc.).
Use standard bar measurements: spirits are typically 1.5–2 oz, modifiers 0.5–0.75 oz, citrus juice 0.75–1 oz, syrups 0.5–0.75 oz, bitters in dashes (2–3 dashes). Never use cups or tablespoons for cocktail ingredients.

Flavor family rules — only combine spirits and mixers from compatible families:
- Whiskey/Bourbon/Rye: pairs with lemon, honey, ginger, mint, stone fruit, apple, peach, amaretto, coffee, angostura bitters. NEVER pair with blue curaçao, coconut, tropical liqueurs, melon, or pineapple.
- Tequila/Mezcal: pairs with lime, triple sec, Cointreau, grapefruit, jalapeño, agave, cucumber. Mezcal can take smoky/spiced additions.
- Gin: pairs with tonic, cucumber, elderflower, lemon, vermouth, citrus, fresh herbs. Avoid heavy sweet tropical flavors.
- Rum (white/gold): pairs with lime, mint, coconut, pineapple, tropical fruit, orgeat. Dark rum pairs with coffee, chocolate, spiced syrups.
- Vodka: the most neutral — pairs with citrus, cranberry, espresso, ginger beer, cucumber.
- Blue curaçao/orange liqueurs: pair with citrus-forward cocktails using vodka, rum, or tequila as the base. Never with whiskey or bourbon.
If the available ingredients span incompatible families, pick ONE family's ingredients and ignore the rest.`
    : `\nYou may supplement with common pantry staples (salt, pepper, oil, butter, water, vinegar, sugar, flour, etc.).

Seasoning rules — most generated recipes under-season. Follow these:
- Always include salt and pepper as explicit ingredients with amounts.
- Proteins: at least 1 tsp kosher salt per pound. Pasta water: 1 tbsp salt per 4 quarts. Vegetables: 1/2 tsp salt per pound before roasting or sautéing.
- Season at every stage (before cooking, during, and to taste at the end) — reflect this in the instructions.
- Acid finishers (lemon juice, vinegar) brighten flavor — add 1–2 tsp at the end of most savory dishes.

Measurement calibration for 4 servings — do not exceed these unless the recipe truly requires it:
- Cooking fat: 2–3 tbsp oil or butter for sautéing; 3–4 tbsp to roast a full sheet pan of vegetables. Never more than 1/4 cup unless it is a sauce or braise.
- Dried spices: 1/2–1 tsp each (up to 2 tsp for dominant spices like paprika or cumin).
- Fresh herbs: 2–3 tbsp chopped for finishing; 1/4 cup max.
- Garlic: 3–5 cloves typical; rarely more than 8.
- Liquids in braises/soups: enough to barely cover or come halfway up the protein — state in cups, not quarts, for home portions.
- Cheese: 1/2–1 cup grated for a pasta for 4; 1/4 cup for a topping.`;

  const ingredientExamples = type === 'cocktail'
    ? `    {"amount": "2", "unit": "oz", "name": "spirit name"},
    {"amount": "0.75", "unit": "oz", "name": "modifier or liqueur"},
    {"amount": "0.75", "unit": "oz", "name": "fresh citrus juice"},
    {"amount": "3", "unit": "dashes", "name": "bitters"},
    {"amount": "", "unit": "", "name": "garnish with no measurement"}`
    : `    {"amount": "2", "unit": "cups", "name": "ingredient name"},
    {"amount": "1", "unit": "tbsp", "name": "another ingredient"},
    {"amount": "", "unit": "", "name": "ingredient with no measurement"}`;

  return `You are a culinary expert. ${intro} these ingredients: ${ingredients.join(', ')}.${cookTimeNote}
${cocktailNote}

Return ONLY a valid JSON object in this exact structure — no text outside it:
{
  "title": "Recipe Name",
  "description": "One or two sentence enticing description.",
  "type": "${type === 'cocktail' ? 'cocktail' : 'recipe'}",
  "subcategory": "",${metaFields}
  "ingredients": [
${ingredientExamples}
  ],
  "instructions": [
    "First step, fully described.",
    "Second step, fully described.",
    "Continue until done."
  ],
  "notes": "Optional tips, variations, or serving suggestions."
}

${subcategoryNote}
Write clear, detailed instructions. Do not truncate — complete the full recipe.`;
}

async function runJob(jobId, ingredients, type, cookTime, model, concept) {
  const job = _jobs.get(jobId);
  try {
    updateJob(jobId, { status: 'running' });

    const llmRes = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: safeModel(model),
        messages: [{ role: 'user', content: buildPrompt(ingredients, type, cookTime, concept) }],
        stream: true,
        temperature: 0.35,
        max_tokens: NUM_PREDICT,
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT),
    });

    if (!llmRes.ok) throw new Error(`LLM returned HTTP ${llmRes.status}`);

    let contentAccum = '';
    let reasoningAccum = '';
    let done = false;
    const reader = llmRes.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') { if (trimmed === 'data: [DONE]') done = true; continue; }
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(trimmed.slice(6));
          const delta = chunk.choices?.[0]?.delta || {};
          const contentToken = delta.content || '';
          const reasoningToken = delta.reasoning || '';
          // Stream both for display; track separately for parsing
          if (reasoningToken) { reasoningAccum += reasoningToken; job.tokens.push(reasoningToken); }
          if (contentToken)   { contentAccum   += contentToken;   job.tokens.push(contentToken); }
          if (chunk.choices?.[0]?.finish_reason) { done = true; break; }
        } catch (_) {}
      }
    }

    // contentAccum holds the recipe JSON; reasoningAccum holds <think> tokens.
    // If contentAccum is empty the model ran out of tokens before generating output.
    if (!contentAccum.trim() && reasoningAccum.trim()) {
      throw new Error('The model spent too long thinking and ran out of room to write the recipe. Try again — it may succeed on a second attempt.');
    }
    const recipe = extractJson(contentAccum || reasoningAccum);
    updateJob(jobId, { status: 'done', result: recipe });
  } catch (err) {
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

// POST /api/suggest-recipe — start async SSE job
router.post('/', (req, res) => {
  const { ingredients, type, model, cookTime, concept } = req.body;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array required' });
  }
  const validType = type === 'cocktail' ? 'cocktail' : 'recipe';
  const jobId = newJob();
  runJob(jobId, ingredients.map(String), validType, cookTime || '', model, concept || null);
  res.json({ ok: true, job_id: jobId });
});

// GET /api/suggest-recipe/stream/:id — SSE stream of tokens in real time
router.get('/stream/:id', (req, res) => {
  const job = _jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let cursor = 0;

  function send(obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }

  function flush() {
    while (cursor < job.tokens.length) {
      const token = job.tokens[cursor++];
      if (token) send({ token });
    }
    if (job.status === 'done') { send({ done: true, recipe: job.result }); res.end(); return true; }
    if (job.status === 'error') { send({ error: job.error }); res.end(); return true; }
    return false;
  }

  if (flush()) return;
  const intervalId = setInterval(() => { if (flush()) clearInterval(intervalId); }, 80);
  req.on('close', () => clearInterval(intervalId));
});

// Critique generated concepts for compatibility issues.
// Returns the subset of concepts that pass, or the full list if critique fails.
async function critiqueConcepts(concepts, ingredients, type) {
  const isCocktail = type === 'cocktail';

  const rules = isCocktail
    ? `Mark each concept valid or invalid based on these hard rules:
- Whiskey/Bourbon/Rye NEVER pairs with: blue curaçao, triple sec, coconut, tropical liqueurs, rum, tequila
- Tequila/Mezcal NEVER pairs with: whiskey, bourbon, rye, rum
- Rum NEVER pairs with: whiskey, bourbon, rye, gin
- Blue curaçao/orange liqueurs NEVER pair with: whiskey, bourbon, rye
- Gin NEVER pairs with: rum, tequila, whiskey in the same drink`
    : `Mark each concept valid or invalid based on these rules:
- The concept must be achievable with the available ingredients (pantry staples like salt, oil, butter, garlic, flour are always available)
- The named dish style must match the ingredients (e.g. don't suggest "Thai curry" if there are no Thai aromatics or curry paste available)
- The concept must not require a key missing component that cannot be a pantry staple (e.g. a "pasta dish" needs pasta; a "stir fry" needs a protein or main vegetable)
- Concepts that are essentially identical to each other are invalid — this includes adjective-swapped titles like "Herb Garlic Chicken" vs "Garlic Herb Chicken", or same dish with a different cuisine adjective. Keep only the most distinct one`;

  const prompt = `You are a strict culinary expert reviewing recipe concepts.

Available ingredients: ${ingredients.join(', ')}

Concepts:
${concepts.map((c, i) => `${i}: "${c.title}" — ${c.tagline}`).join('\n')}

${rules}

Return ONLY a JSON object — no text outside it:
{"results": [{"index": 0, "valid": true}, {"index": 1, "valid": false}, {"index": 2, "valid": true}]}`;

  try {
    const llmRes = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONCEPTS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!llmRes.ok) return concepts;
    const json = await llmRes.json();
    const text = stripThinking((json.choices?.[0]?.message?.content || '').trim());
    const parsed = extractJson(text);
    const results = parsed.results || [];
    const valid = concepts.filter((_, i) => {
      const r = results.find((x) => x.index === i);
      return !r || r.valid !== false;
    });
    // If critique wiped everything (over-zealous), fall through to original list
    return valid.length > 0 ? valid : concepts;
  } catch (_) {
    return concepts;
  }
}

// POST /api/suggest-recipe/concepts — fast synchronous concept generation (no job store)
router.post('/concepts', async (req, res) => {
  const { ingredients, type, model: reqModel, cookTime } = req.body;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients required' });
  }

  const label = type === 'cocktail' ? 'cocktail' : 'food recipe';
  const cookTimeNote = cookTime ? `Preference: ${cookTime} total time.\n` : '';

  const cocktailConceptNote = type === 'cocktail'
    ? `Each concept should use only 2–4 of these ingredients that complement each other well — do NOT combine them all. Each concept should highlight a different spirit or flavor pairing from the list.
Stay within flavor families: whiskey/bourbon pairs with citrus, ginger, honey, stone fruit — NEVER with blue curaçao, coconut, or tropical liqueurs. Tequila pairs with lime, grapefruit, triple sec. Rum pairs with tropical fruit, mint, lime. Vodka is neutral. Blue curaçao belongs with citrus-forward vodka, rum, or tequila drinks only. If the list spans incompatible families, each concept should pick one family and ignore the rest.\n`
    : '';

  const recentTitles = (_recentTitles[type === 'cocktail' ? 'cocktail' : 'recipe'] || []).slice(-15);
  const avoidNote = recentTitles.length > 0
    ? `\nDo NOT suggest any of these recently generated ideas or close variations of them:\n${recentTitles.map((t) => `- ${t}`).join('\n')}\n`
    : '';

  const diversityNote = type === 'cocktail'
    ? `The 3 concepts must differ in both the base spirit AND the flavor profile (e.g. don't give 3 bourbon drinks). Each should feel like a distinct cocktail category (sour vs. highball vs. stirred, etc.).`
    : `The 3 concepts MUST differ across all three of these axes — no two concepts can share the same value on any axis:
1. Primary protein or main ingredient (e.g. chicken, beef, pasta, tofu, fish, eggs — pick 3 different ones)
2. Cuisine or flavor profile (e.g. Italian, Asian, Mexican, Mediterranean, American comfort, etc.)
3. Cooking method (e.g. roasted, stir-fried, braised, grilled, pan-seared, baked, simmered)
Avoid generic adjective-swapping like "Herb Garlic X" vs "Garlic Herb X" — these are the same dish.`;

  const prompt = `You are a culinary expert. Suggest 3 distinct ${label} concepts using some of these available ingredients: ${ingredients.join(', ')}.
${cookTimeNote}${cocktailConceptNote}${avoidNote}
${diversityNote}

Return ONLY a JSON object in this exact structure — no text outside:
{
  "concepts": [
    {"title": "Recipe Name", "tagline": "One enticing sentence describing the dish."},
    {"title": "Recipe Name 2", "tagline": "One enticing sentence."},
    {"title": "Recipe Name 3", "tagline": "One enticing sentence."}
  ]
}`;

  try {
    const llmRes = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONCEPTS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.85,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!llmRes.ok) throw new Error(`LLM returned HTTP ${llmRes.status}`);

    const json = await llmRes.json();
    const msg = json.choices?.[0]?.message || {};
    const raw = (msg.content || '').trim();
    const text = stripThinking(raw);

    let parsed;
    try { parsed = extractJson(text); }
    catch { throw new Error('Model response was not valid JSON'); }

    // Support both {concepts:[]} and bare [] responses
    let concepts = Array.isArray(parsed) ? parsed : parsed.concepts;
    if (!Array.isArray(concepts) || concepts.length === 0) {
      throw new Error('Model did not return a concepts array');
    }
    concepts = concepts.slice(0, 3);

    // Critique pass: filter out incompatible concepts
    const validType = type === 'cocktail' ? 'cocktail' : 'recipe';
    concepts = await critiqueConcepts(concepts, ingredients, validType);

    // If critique filtered any out, do one retry to fill back to 3
    if (concepts.length < 3) {
      const needed = 3 - concepts.length;
      const retryConceptNote = validType === 'cocktail' ? cocktailConceptNote : '';
      const retryPrompt = `You are a culinary expert. Suggest ${needed} distinct ${label} concept${needed > 1 ? 's' : ''} using some of these available ingredients: ${ingredients.join(', ')}.
${retryConceptNote}Each concept must be clearly achievable with the listed ingredients. Return ONLY a JSON object:
{"concepts": [{"title": "Name", "tagline": "One sentence."}]}`;
      try {
        const retryRes = await fetch(`${LLM_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: CONCEPTS_MODEL,
            messages: [{ role: 'user', content: retryPrompt }],
            stream: false,
            temperature: 0.65,
            max_tokens: 400,
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (retryRes.ok) {
          const retryJson = await retryRes.json();
          const retryText = stripThinking((retryJson.choices?.[0]?.message?.content || '').trim());
          const retryParsed = extractJson(retryText);
          const extras = Array.isArray(retryParsed) ? retryParsed : (retryParsed.concepts || []);
          const critiqued = await critiqueConcepts(extras.slice(0, needed), ingredients, validType);
          concepts = [...concepts, ...critiqued].slice(0, 3);
        }
      } catch (_) {}
    }

    const final = concepts.slice(0, 3);
    recordTitles(final.map((c) => c.title), type === 'cocktail' ? 'cocktail' : 'recipe');
    res.json({ concepts: final });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

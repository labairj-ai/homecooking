const express = require('express');

const router = express.Router();

const LLM_URL        = process.env.LLM_URL || 'http://localhost:8080';
const LLM_MODEL      = 'mlx-community/Qwen3.6-35B-A3B-4bit';
const CONCEPTS_MODEL = 'mlx-community/phi-4-4bit';
const NUM_PREDICT   = 2500;
const MODEL_TIMEOUT = 180_000;

// In-memory job store; entries expire after 15 minutes
const _jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of _jobs) {
    if (job.ts < cutoff) _jobs.delete(id);
  }
}, 60 * 1000);

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
    ? '\nA good cocktail uses a focused set of complementary spirits and mixers. Ignore ingredients that would clash or muddy the flavor. You may add common bar staples (simple syrup, soda water, ice, citrus, salt rim, etc.).'
    : '\nYou may supplement with common pantry staples (salt, pepper, oil, butter, water, vinegar, sugar, flour, etc.).';

  return `You are a culinary expert. ${intro} these ingredients: ${ingredients.join(', ')}.${cookTimeNote}
${cocktailNote}

Return ONLY a valid JSON object in this exact structure — no text outside it:
{
  "title": "Recipe Name",
  "description": "One or two sentence enticing description.",
  "type": "${type === 'cocktail' ? 'cocktail' : 'recipe'}",
  "subcategory": "",${metaFields}
  "ingredients": [
    {"amount": "2", "unit": "cups", "name": "ingredient name"},
    {"amount": "1", "unit": "tbsp", "name": "another ingredient"},
    {"amount": "", "unit": "", "name": "ingredient with no measurement"}
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

    // Prefer content tokens for parsing; fall back to reasoning (Qwen3 thinking mode)
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

// POST /api/suggest-recipe/concepts — fast synchronous concept generation (no job store)
router.post('/concepts', async (req, res) => {
  const { ingredients, type, model: reqModel, cookTime } = req.body;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients required' });
  }

  const label = type === 'cocktail' ? 'cocktail' : 'food recipe';
  const cookTimeNote = cookTime ? `Preference: ${cookTime} total time.\n` : '';

  const cocktailConceptNote = type === 'cocktail'
    ? `Each concept should use only 2–4 of these ingredients that complement each other well — do NOT combine them all. Each concept should highlight a different spirit or flavor pairing from the list.\n`
    : '';

  const prompt = `You are a culinary expert. Suggest 3 distinct ${label} concepts using some of these available ingredients: ${ingredients.join(', ')}.
${cookTimeNote}${cocktailConceptNote}
Return ONLY a JSON object in this exact structure — no text outside:
{
  "concepts": [
    {"title": "Recipe Name", "tagline": "One enticing sentence describing the dish."},
    {"title": "Recipe Name 2", "tagline": "One enticing sentence."},
    {"title": "Recipe Name 3", "tagline": "One enticing sentence."}
  ]
}
Make the 3 concepts meaningfully different from each other in style, technique, or flavor profile.`;

  try {
    const llmRes = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONCEPTS_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.65,
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
    const concepts = Array.isArray(parsed) ? parsed : parsed.concepts;
    if (!Array.isArray(concepts) || concepts.length === 0) {
      throw new Error('Model did not return a concepts array');
    }
    res.json({ concepts: concepts.slice(0, 3) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

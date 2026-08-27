const express = require('express');

const router = express.Router();

const LLM_URL   = process.env.LLM_URL   || 'http://localhost:8080';
const LLM_MODEL = 'mlx-community/Qwen3.6-35B-A3B-4bit';
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

// 4-strategy JSON extractor: handles preamble text, truncated output, unclosed brackets
function extractJson(text) {
  const s = text.trim();
  try { return JSON.parse(s); } catch (_) {}

  const match = s.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in model output');
  let block = match[0];

  try { return JSON.parse(block); } catch (_) {}

  // Repair truncated JSON: close open string, then arrays, then objects
  if ((block.match(/"/g) || []).length % 2 !== 0) block += '"';
  const openArrays  = (block.match(/\[/g) || []).length - (block.match(/\]/g) || []).length;
  const openBraces  = (block.match(/\{/g) || []).length - (block.match(/\}/g) || []).length;
  for (let i = 0; i < openArrays; i++) block += ']';
  for (let i = 0; i < openBraces;  i++) block += '}';

  try { return JSON.parse(block); } catch (_) {}
  throw new Error('Could not parse model output as JSON after repair attempts');
}

function buildPrompt(ingredients, type, cookTime, concept) {
  const label = type === 'cocktail' ? 'cocktail' : 'food recipe';
  const subcategoryNote = type === 'cocktail'
    ? 'Set subcategory to empty string "".'
    : 'Set subcategory to one of: breakfast, lunch, dinner, dessert.';

  const conceptIntro = concept
    ? `Create a ${label} called "${concept.title}" — ${concept.tagline} — using`
    : `Create a ${label} using some or all of`;

  const cookTimeNote = cookTime
    ? `\nTarget total cook + prep time: ${cookTime}. Adjust the recipe complexity accordingly.`
    : '';

  return `You are a culinary expert. ${conceptIntro} these ingredients: ${ingredients.join(', ')}.${cookTimeNote}

You may supplement with common pantry staples (salt, pepper, oil, butter, water, vinegar, sugar, flour, etc.).

Return ONLY a valid JSON object in this exact structure — no text outside it:
{
  "title": "Recipe Name",
  "description": "One or two sentence enticing description.",
  "type": "${type === 'cocktail' ? 'cocktail' : 'recipe'}",
  "subcategory": "",
  "servings": "4",
  "prep_time": "10 min",
  "cook_time": "20 min",
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

    let accumulated = '';
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
          const token = chunk.choices?.[0]?.delta?.content || '';
          if (token) {
            accumulated += token;
            job.tokens.push(token);
          }
          if (chunk.choices?.[0]?.finish_reason) { done = true; break; }
        } catch (_) {}
      }
    }

    const recipe = extractJson(accumulated);
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

  const prompt = `You are a culinary expert. Suggest 3 distinct ${label} concepts using some of these ingredients: ${ingredients.join(', ')}.
${cookTimeNote}
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
        model: safeModel(reqModel),
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.65,
        max_tokens: 350,
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!llmRes.ok) throw new Error(`LLM returned HTTP ${llmRes.status}`);

    const json = await llmRes.json();
    const text = (json.choices?.[0]?.message?.content || '').trim();

    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const m2 = text.match(/\{[\s\S]*\}/);
      if (m2) parsed = JSON.parse(m2[0]);
      else throw new Error('Model response was not valid JSON');
    }

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

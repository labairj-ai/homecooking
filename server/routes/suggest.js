const express = require('express');

const router = express.Router();

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
  // tokens[] is appended by runJob; SSE stream reads from it in real time
  _jobs.set(id, { status: 'pending', tokens: [], ts: Date.now() });
  return id;
}

function updateJob(id, patch) {
  const job = _jobs.get(id);
  if (job) Object.assign(job, patch, { ts: Date.now() });
}

function buildPrompt(ingredients, type) {
  const label = type === 'cocktail' ? 'cocktail' : 'food recipe';
  const subcategoryNote = type === 'cocktail'
    ? 'Set subcategory to empty string "".'
    : 'Set subcategory to one of: breakfast, lunch, dinner, dessert.';
  return `You are a culinary expert. Create a ${label} using some or all of these ingredients: ${ingredients.join(', ')}.

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

async function runJob(jobId, ingredients, type) {
  const job = _jobs.get(jobId);
  try {
    updateJob(jobId, { status: 'running' });

    const ollamaRes = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'phi4:14b',
        prompt: buildPrompt(ingredients, type),
        stream: true,
        format: 'json',
        options: { temperature: 0.45, num_predict: 1500 },
      }),
      signal: AbortSignal.timeout(360_000),
    });

    if (!ollamaRes.ok) throw new Error(`Ollama returned HTTP ${ollamaRes.status}`);

    let accumulated = '';
    let done = false;
    const reader = ollamaRes.body.getReader();
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
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed);
          const token = chunk.response || '';
          if (token) {
            accumulated += token;
            job.tokens.push(token); // SSE stream reads this array in real time
          }
          if (chunk.done) { done = true; break; }
        } catch (_) {}
      }
    }

    const recipe = JSON.parse(accumulated.trim());
    updateJob(jobId, { status: 'done', result: recipe });
  } catch (err) {
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

// POST /api/suggest-recipe — start async job, return job_id immediately
router.post('/', (req, res) => {
  const { ingredients, type } = req.body;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array required' });
  }
  const validType = type === 'cocktail' ? 'cocktail' : 'recipe';
  const jobId = newJob();
  runJob(jobId, ingredients.map(String), validType);
  res.json({ ok: true, job_id: jobId });
});

// GET /api/suggest-recipe/stream/:id — SSE stream of tokens in real time
// Sends { token } events as phi4 generates them, then { done, recipe } or { error }
router.get('/stream/:id', (req, res) => {
  const job = _jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/proxy buffering
  res.flushHeaders();

  let cursor = 0;

  function send(obj) {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  }

  function flush() {
    // Drain any tokens we haven't sent yet
    while (cursor < job.tokens.length) {
      const token = job.tokens[cursor++];
      if (token) send({ token });
    }
    if (job.status === 'done') {
      send({ done: true, recipe: job.result });
      res.end();
      return true;
    }
    if (job.status === 'error') {
      send({ error: job.error });
      res.end();
      return true;
    }
    return false;
  }

  // Check if job already finished before client connected
  if (flush()) return;

  // Poll tokens into SSE every 80ms (fast enough to feel real-time)
  const intervalId = setInterval(() => {
    if (flush()) clearInterval(intervalId);
  }, 80);

  req.on('close', () => clearInterval(intervalId));
});

module.exports = router;

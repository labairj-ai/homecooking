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
  _jobs.set(id, { status: 'pending', progress: 'Starting…', ts: Date.now() });
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
  try {
    updateJob(jobId, { status: 'running', progress: 'Connecting to phi4…' });

    const ollamaRes = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'phi4:14b',
        prompt: buildPrompt(ingredients, type),
        stream: true,
        format: 'json',
        options: { temperature: 0.45, num_predict: 2000 },
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!ollamaRes.ok) {
      throw new Error(`Ollama returned HTTP ${ollamaRes.status}`);
    }

    updateJob(jobId, { progress: 'Generating…' });

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
      lineBuffer = lines.pop(); // keep partial last line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed);
          accumulated += chunk.response || '';
          updateJob(jobId, { progress: `Generating… (${accumulated.length} chars)` });
          if (chunk.done) { done = true; break; }
        } catch (_) {}
      }
    }

    // Parse the accumulated JSON response
    const recipe = JSON.parse(accumulated.trim());
    updateJob(jobId, { status: 'done', result: recipe });
  } catch (err) {
    updateJob(jobId, { status: 'error', error: err.message });
  }
}

// POST /api/suggest-recipe — start async job
router.post('/', (req, res) => {
  const { ingredients, type } = req.body;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'ingredients array required' });
  }
  const validType = type === 'cocktail' ? 'cocktail' : 'recipe';
  const jobId = newJob();
  runJob(jobId, ingredients.map(String), validType); // fire and forget
  res.json({ ok: true, job_id: jobId });
});

// GET /api/suggest-recipe/job/:id — poll status
router.get('/job/:id', (req, res) => {
  const job = _jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job);
});

module.exports = router;

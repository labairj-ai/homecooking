const express = require('express');
const db = require('../db');

const router = express.Router({ mergeParams: true });

const LLM_URL   = process.env.LLM_URL   || 'http://localhost:8080';
const CHAT_MODEL = 'mlx-community/Qwen3.6-35B-A3B-4bit';

// In-memory job store; entries expire after 15 minutes
const _jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of _jobs) {
    if (job.ts < cutoff) _jobs.delete(id);
  }
}, 60 * 1000);

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSystemPrompt(recipe) {
  const ingLines = (recipe.ingredients || [])
    .map((i) => {
      const parts = [i.amount, i.unit, i.name].filter(Boolean);
      return `- ${parts.join(' ')}`;
    })
    .join('\n');

  const lines = [
    'You are a helpful cooking assistant. The user is cooking or has just cooked a specific recipe and wants guidance.',
    '',
    `RECIPE: ${recipe.title}`,
  ];
  if (recipe.description) lines.push(`DESCRIPTION: ${recipe.description}`);
  lines.push('', 'INGREDIENTS:', ingLines || '(none listed)', '', 'INSTRUCTIONS:');
  lines.push(stripHtml(recipe.instructions) || '(none listed)');
  const notes = stripHtml(recipe.notes);
  if (notes) lines.push('', 'NOTES:', notes);
  lines.push(
    '',
    'Answer questions about this recipe. Suggest substitutions, explain techniques, diagnose cooking problems the user describes, and recommend specific improvements (e.g. "reduce salt by ¼ tsp", "bake 5 extra minutes at the same temp"). Be concise and practical.',
  );

  return lines.join('\n');
}

async function runChat(jobId, systemPrompt, userMessages) {
  const job = _jobs.get(jobId);
  try {
    const messages = [{ role: 'system', content: systemPrompt }, ...userMessages];

    const llmRes = await fetch(`${LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        stream: true,
        temperature: 0.4,
        max_tokens: 1000,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!llmRes.ok) throw new Error(`LLM returned HTTP ${llmRes.status}`);

    const reader = llmRes.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let done = false;

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
          if (token) job.tokens.push(token);
          if (chunk.choices?.[0]?.finish_reason) { done = true; break; }
        } catch (_) {}
      }
    }

    job.done = true;
  } catch (err) {
    job.error = err.message;
    job.done = true;
  }
}

// POST /api/recipes/:id/chat — start streaming chat job
router.post('/', (req, res) => {
  const recipeId = req.params.id;
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  recipe.ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY order_idx')
    .all(recipeId);

  const jobId = Math.random().toString(36).slice(2, 18);
  _jobs.set(jobId, { tokens: [], done: false, error: null, ts: Date.now() });

  runChat(jobId, buildSystemPrompt(recipe), messages);

  res.json({ job_id: jobId });
});

// GET /api/recipes/:id/chat/stream/:jobId — SSE stream of response tokens
router.get('/stream/:jobId', (req, res) => {
  const job = _jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

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
    if (job.done) {
      if (job.error) send({ error: job.error });
      else send({ done: true });
      res.end();
      return true;
    }
    return false;
  }

  if (flush()) return;
  const intervalId = setInterval(() => { if (flush()) clearInterval(intervalId); }, 80);
  req.on('close', () => clearInterval(intervalId));
});

module.exports = router;

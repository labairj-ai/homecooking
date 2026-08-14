const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  },
});

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, file.mimetype === 'application/pdf' || IMAGE_MIMES.has(file.mimetype)),
});

// --- Async job store for image parsing (minicpm-v can take ~30-60s) ---
const _jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of _jobs) {
    if (job.ts < cutoff) _jobs.delete(id);
  }
}, 60 * 1000);

function newJob(filename) {
  const id = Math.random().toString(36).slice(2, 18);
  _jobs.set(id, { status: 'pending', progress: 'Starting…', filename, ts: Date.now() });
  return id;
}

function updateJob(id, patch) {
  const job = _jobs.get(id);
  if (job) Object.assign(job, patch, { ts: Date.now() });
}

const VISION_PROMPT = `You are a recipe parser. Look at this image and extract the recipe.

Return ONLY a JSON object — no markdown, no explanation, no code fences:
{
  "title": "Recipe name",
  "type": "recipe",
  "description": "One sentence description",
  "ingredients": [{"name": "flour", "amount": "2", "unit": "cups"}],
  "instructions": ["Step 1 text", "Step 2 text"],
  "notes": "Tips or variations"
}

Rules:
- type must be "recipe" or "cocktail"
- For ingredients missing amounts, use "" for amount and unit
- instructions is an array of plain-text step strings
- Use "" for any field you cannot determine from the image`;

async function runParseJob(jobId, filePath) {
  try {
    updateJob(jobId, { status: 'running', progress: 'Reading image…' });
    const imageData = fs.readFileSync(filePath).toString('base64');

    updateJob(jobId, { progress: 'Sending to minicpm-v…' });
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'minicpm-v',
        prompt: VISION_PROMPT,
        images: [imageData],
        stream: false,
        format: 'json',
        options: { temperature: 0.2, num_predict: 1500 },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);

    updateJob(jobId, { progress: 'Extracting recipe…' });
    const json = await res.json();
    const text = (json.response || '').trim();

    let recipe;
    try {
      recipe = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) recipe = JSON.parse(m[0]);
      else throw new Error('Model response was not valid JSON');
    }

    updateJob(jobId, { status: 'done', result: recipe });
  } catch (err) {
    // Delete the uploaded file on error — user will need to re-upload
    try { fs.unlinkSync(filePath); } catch (_) {}
    updateJob(jobId, { status: 'error', error: err.message, filename: null });
  }
}

// --- PDF heuristic text parsing (synchronous, no LLM needed) ---
const SECTION_RE = {
  ingredients:  /^(ingredients?|what you.{0,5}ll need)\s*:?\s*$/i,
  instructions: /^(instructions?|directions?|method|steps?|how to( make)?|preparation|prep)\s*:?\s*$/i,
  notes:        /^(notes?|tips?|serving suggestions?|variations?)\s*:?\s*$/i,
};

const ING_RE = /^([\d¼½¾⅓⅔⅛\s\/.-]+)?\s*(tsp|tbsp|teaspoons?|tablespoons?|cups?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|liters?|litres?|pinch|dash|splash|to taste)\.?\s+(.+)$/i;

function parseText(raw) {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let currentSection = 'header';
  const headerLines = [];
  const ingredients = [];
  const instructions = [];
  let notes = '';

  for (const line of lines) {
    const secMatch = Object.entries(SECTION_RE).find(([, re]) => re.test(line) && line.length < 50);
    if (secMatch) { currentSection = secMatch[0]; continue; }

    if (currentSection === 'header') { headerLines.push(line); continue; }

    if (currentSection === 'ingredients') {
      const m = line.match(ING_RE);
      if (m) ingredients.push({ amount: (m[1] || '').trim(), unit: (m[2] || '').trim(), name: m[3].trim() });
      else if (line.length > 2 && !/^(serves|yield|prep|cook|total|time)/i.test(line))
        ingredients.push({ amount: '', unit: '', name: line });
      continue;
    }

    if (currentSection === 'instructions') {
      const clean = line.replace(/^\d+[.)]\s*/, '').replace(/^[•·\-*]\s*/, '').trim();
      if (clean) instructions.push(clean);
      continue;
    }

    if (currentSection === 'notes') notes = notes ? `${notes} ${line}` : line;
  }

  if (!ingredients.length && !instructions.length) {
    for (const line of lines.slice(1)) {
      const m = line.match(ING_RE);
      if (m) ingredients.push({ amount: (m[1] || '').trim(), unit: (m[2] || '').trim(), name: m[3].trim() });
    }
  }

  return { title: headerLines[0] || '', type: 'recipe', description: headerLines.slice(1, 3).join(' '), ingredients, instructions, notes };
}

// POST /api/parse-recipe  (multipart/form-data, field: image)
// PDF  → synchronous heuristic parse, returns { filename: null, recipe } immediately
// Image → starts async minicpm-v job, returns { ok: true, job_id }
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = path.join(UPLOADS_DIR, req.file.filename);

  if (req.file.mimetype === 'application/pdf') {
    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      fs.unlink(filePath, () => {}); // clean up PDF after parsing
      res.json({ filename: null, recipe: parseText(data.text) });
    } catch (err) {
      fs.unlink(filePath, () => {});
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // Image file — kick off async Ollama job
  const jobId = newJob(req.file.filename);
  runParseJob(jobId, filePath); // fire and forget
  res.json({ ok: true, job_id: jobId });
});

// GET /api/parse-recipe/job/:id — poll image parse job status
router.get('/job/:id', (req, res) => {
  const job = _jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job);
});

module.exports = router;

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /jpeg|jpg|png|gif|webp|avif/.test(file.mimetype)),
});

const PROMPT = `You are a recipe parser. Look at this image and extract the recipe.

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

// POST /api/parse-recipe  (multipart/form-data, field: image)
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  }

  try {
    const imageData = fs.readFileSync(path.join(UPLOADS_DIR, req.file.filename)).toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageData } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    const text = aiJson.content[0].text.trim();

    let recipe;
    try {
      recipe = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) recipe = JSON.parse(match[0]);
      else throw new Error('Could not parse response as JSON');
    }

    res.json({ filename: req.file.filename, recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

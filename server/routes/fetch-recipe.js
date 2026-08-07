const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const ING_RE = /^([\d¼½¾⅓⅔⅛\s\/.-]+)?\s*(tsp|tbsp|teaspoons?|tablespoons?|cups?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|liters?|litres?|pinch|dash|splash|to taste)\.?\s+(.+)$/i;

function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parseIngredient(raw) {
  const text = stripHtml(raw).trim();
  const m = text.match(ING_RE);
  if (m) return { amount: (m[1] || '').trim(), unit: (m[2] || '').trim(), name: m[3].trim() };
  return { amount: '', unit: '', name: text };
}

function parseInstructions(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split('\n').map(stripHtml).filter(Boolean);
  const steps = [];
  for (const item of raw) {
    if (typeof item === 'string') { steps.push(stripHtml(item)); continue; }
    if (item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
      item.itemListElement.forEach(s => s.text && steps.push(stripHtml(s.text)));
      continue;
    }
    if (item.text) steps.push(stripHtml(item.text));
  }
  return steps.filter(Boolean);
}

function extractRecipeSchema(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean);

  for (const block of blocks) {
    const candidates = Array.isArray(block) ? block : (block['@graph'] ? block['@graph'] : [block]);
    const found = candidates.find(n => n['@type'] === 'Recipe' || (Array.isArray(n['@type']) && n['@type'].includes('Recipe')));
    if (found) return found;
  }
  return null;
}

// POST /api/fetch-recipe  { url }
router.post('/', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  let html;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (err) {
    return res.status(502).json({ error: `Could not fetch URL: ${err.message}` });
  }

  const schema = extractRecipeSchema(html);
  if (!schema) {
    return res.status(422).json({ error: 'No recipe data found on this page. The site may not support structured data.' });
  }

  const imageUrl = Array.isArray(schema.image)
    ? (schema.image[0]?.url || schema.image[0])
    : (schema.image?.url || schema.image || null);

  // Download recipe photo
  let filename = null;
  if (imageUrl && typeof imageUrl === 'string') {
    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
      if (imgRes.ok) {
        const ext = (imageUrl.match(/\.(jpe?g|png|webp)/i)?.[1] || 'jpg').replace('jpeg', 'jpg');
        filename = crypto.randomBytes(12).toString('hex') + '.' + ext;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
      }
    } catch {} // photo is optional
  }

  const recipe = {
    title: stripHtml(schema.name || ''),
    type: 'recipe',
    description: stripHtml(schema.description || ''),
    ingredients: (schema.recipeIngredient || []).map(parseIngredient),
    instructions: parseInstructions(schema.recipeInstructions),
    notes: [schema.recipeYield ? `Serves ${Array.isArray(schema.recipeYield) ? schema.recipeYield[0] : schema.recipeYield}` : ''].filter(Boolean).join('\n'),
  };

  res.json({ filename, recipe });
});

module.exports = router;

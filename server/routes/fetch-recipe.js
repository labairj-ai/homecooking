const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cheerio = require('cheerio');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const ING_RE = /^([\d¼½¾⅓⅔⅛\s\/.-]+)?\s*(tsp|tbsp|teaspoons?|tablespoons?|cups?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|liters?|litres?|pinch|dash|splash|to taste)\.?\s+(.+)$/i;

function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function cleanText(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function parseIngredient(raw) {
  const text = cleanText(stripHtml(raw));
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

function extractJsonLd(html) {
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

function extractHtmlScrape(html) {
  const $ = cheerio.load(html);

  // Title
  const title = cleanText($('h1').first().text()) || cleanText($('title').text().split('|')[0].split('-')[0]);

  // Description
  const description = cleanText($('meta[name="description"]').attr('content') || '');

  // Find section by heading text
  function sectionAfterHeading(keywords) {
    let result = null;
    $('h1, h2, h3, h4').each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (keywords.some(kw => text === kw || text.startsWith(kw))) {
        result = $(el);
        return false; // break
      }
    });
    return result;
  }

  // Ingredients
  const ingredients = [];
  const ingHeading = sectionAfterHeading(['ingredients', 'ingredient list']);
  if (ingHeading) {
    // Look for ul after heading (within next ~3 siblings or parent's next sibling)
    let ul = ingHeading.next('ul');
    if (!ul.length) ul = ingHeading.parent().next().find('ul').first();
    if (!ul.length) ul = ingHeading.nextAll('ul').first();

    ul.find('li').each((_, li) => {
      const text = cleanText($(li).text());
      if (text) ingredients.push(parseIngredient(text));
    });
  }

  // Instructions — try list items first, then step headings
  const instructions = [];
  const instHeading = sectionAfterHeading(['instructions', 'directions', 'method', 'steps', 'preparation']);
  if (instHeading) {
    let ol = instHeading.next('ol, ul');
    if (!ol.length) ol = instHeading.parent().next().find('ol, ul').first();
    if (!ol.length) ol = instHeading.nextAll('ol, ul').first();

    if (ol.length) {
      ol.find('li').each((_, li) => {
        const text = cleanText($(li).text());
        if (text) instructions.push(text);
      });
    }
  }

  // Fallback: collect step headings (Step 1, Step 2...) and their following text
  if (!instructions.length) {
    $('h2, h3, h4').each((_, el) => {
      const text = $(el).text().trim();
      if (/^step\s*\d+/i.test(text)) {
        // Get the next sibling paragraph(s) text
        let content = '';
        let next = $(el).next();
        while (next.length && !next.is('h1,h2,h3,h4')) {
          const t = cleanText(next.text());
          if (t) content += (content ? ' ' : '') + t;
          next = next.next();
        }
        if (content) instructions.push(content);
      }
    });
  }

  return { title, description, ingredients, instructions, notes: '', type: 'recipe' };
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

  // Try JSON-LD first, fall back to HTML scraping
  const schema = extractJsonLd(html);
  let recipe;

  if (schema) {
    const imageUrl = Array.isArray(schema.image)
      ? (schema.image[0]?.url || schema.image[0])
      : (schema.image?.url || schema.image || null);

    recipe = {
      title: stripHtml(schema.name || ''),
      type: 'recipe',
      description: stripHtml(schema.description || ''),
      ingredients: (schema.recipeIngredient || []).map(parseIngredient),
      instructions: parseInstructions(schema.recipeInstructions),
      notes: schema.recipeYield ? `Serves ${Array.isArray(schema.recipeYield) ? schema.recipeYield[0] : schema.recipeYield}` : '',
      _imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
    };
  } else {
    recipe = extractHtmlScrape(html);
  }

  if (!recipe.title && !recipe.ingredients.length) {
    return res.status(422).json({ error: 'Could not extract recipe from this page. Try a different recipe site or use the photo/PDF import.' });
  }

  // Download recipe photo
  let filename = null;
  const ogImage = !schema ? cheerio.load(html)('meta[property="og:image"]').attr('content') : null;
  const imageUrl = recipe._imageUrl || ogImage || null;
  delete recipe._imageUrl;

  if (imageUrl && typeof imageUrl === 'string') {
    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
      if (imgRes.ok) {
        const ext = (imageUrl.match(/\.(jpe?g|png|webp)/i)?.[1] || 'jpg').replace('jpeg', 'jpg');
        filename = crypto.randomBytes(12).toString('hex') + '.' + ext;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
      }
    } catch {}
  }

  res.json({ filename, recipe });
});

module.exports = router;

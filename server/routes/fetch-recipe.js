const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cheerio = require('cheerio');

let playwright = null;
try { playwright = require('playwright'); } catch (_) {}

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const ING_RE = /^([\d¼½¾⅓⅔⅛\s\/.-]+)?\s*(tsp|tbsp|teaspoons?|tablespoons?|cups?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|liters?|litres?|pinch|dash|splash|to taste)\.?\s+(.+)$/i;

const SECTION_RE = {
  ingredients:  /^(ingredients?|what you.{0,5}ll need)\s*:?\s*$/i,
  instructions: /^(instructions?|directions?|method|steps?|how to( make)?|preparation|prep)\s*:?\s*$/i,
};

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

  const title = cleanText($('h1').first().text()) || cleanText($('title').text().split('|')[0].split('-')[0]);
  const description = cleanText($('meta[name="description"]').attr('content') || '');

  function sectionAfterHeading(keywords) {
    let result = null;
    $('h1, h2, h3, h4').each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (keywords.some(kw => text === kw || text.startsWith(kw))) {
        result = $(el);
        return false;
      }
    });
    return result;
  }

  function findListNear(heading) {
    let el = heading.next('ul, ol');
    if (el.length) return el;
    el = heading.parent().next('ul, ol');
    if (el.length) return el;
    el = heading.parent().next().find('ul, ol').first();
    if (el.length) return el;
    el = heading.nextAll('ul, ol').first();
    if (el.length) return el;
    let parent = heading.parent().parent();
    for (let i = 0; i < 2; i++) {
      const ns = parent.next();
      if (ns.is('ul, ol')) return ns;
      const found = ns.find('ul, ol').first();
      if (found.length) return found;
      parent = parent.parent();
    }
    return $();
  }

  const ingredients = [];
  const ingHeading = sectionAfterHeading(['ingredients', 'ingredient list']);
  if (ingHeading) {
    const ul = findListNear(ingHeading);
    ul.find('li').each((_, li) => {
      const text = cleanText($(li).text());
      if (text) ingredients.push(parseIngredient(text));
    });
  }

  const instructions = [];
  const instHeading = sectionAfterHeading(['instructions', 'directions', 'method', 'steps', 'preparation']);
  if (instHeading) {
    const ol = findListNear(instHeading);
    if (ol.length) {
      ol.find('li').each((_, li) => {
        const text = cleanText($(li).text());
        if (text) instructions.push(text);
      });
    }
  }

  if (!instructions.length) {
    $('h2, h3, h4').each((_, el) => {
      if (!/^step\s*\d+/i.test($(el).text().trim())) return;
      let content = cleanText($(el).next('p, div').text());
      if (!content) content = cleanText($(el).parent().next('p, div').text());
      if (content) instructions.push(content);
    });
  }

  return { title, description, ingredients, instructions, notes: '', type: 'recipe' };
}

// Parse markdown/plain text returned by Jina Reader
function extractFromText(text, jinaTitle) {
  const lines = text.split('\n').map(l => l.replace(/^#{1,4}\s+/, '').replace(/^[*_]{1,2}(.+)[*_]{1,2}$/, '$1').trim()).filter(Boolean);
  let currentSection = 'header';
  const headerLines = [];
  const ingredients = [];
  const instructions = [];

  for (const line of lines) {
    const secMatch = Object.entries(SECTION_RE).find(([, re]) => re.test(line) && line.length < 60);
    if (secMatch) { currentSection = secMatch[0]; continue; }

    if (currentSection === 'header') { headerLines.push(line); continue; }

    if (currentSection === 'ingredients') {
      const clean = line.replace(/^[-*•·]\s*/, '').trim();
      if (clean && !/^(serves|yield|prep|cook|total|time|course|cuisine|calories)/i.test(clean))
        ingredients.push(parseIngredient(clean));
      continue;
    }

    if (currentSection === 'instructions') {
      const clean = line.replace(/^\d+[.)]\s*/, '').replace(/^[-*•·]\s*/, '').trim();
      if (clean && clean.length > 5) instructions.push(clean);
    }
  }

  const title = jinaTitle || headerLines[0] || '';
  const description = headerLines.slice(1, 3).join(' ');
  return { title, description, ingredients, instructions, notes: '', type: 'recipe' };
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'DNT': '1',
  'Upgrade-Insecure-Requests': '1',
};

async function tryDirectFetch(url) {
  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

const BLOCKED_RE = /security.?check|just.?a.?moment|access.?denied|verif(y|ication)|captcha|cloudflare|please.?wait|ddos.?protection|bot.?detect|human.?check|vercel.?security/i;

function isBlockedPage(title, content) {
  if (BLOCKED_RE.test(title)) return true;
  if (content.length < 800 && BLOCKED_RE.test(content)) return true;
  return false;
}

// Playwright: real headless browser, passes JS challenges
async function fetchWithBrowser(url) {
  if (!playwright) throw new Error('playwright not installed');
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    return await page.content();
  } finally {
    await browser.close();
  }
}

// Jina Reader: renders the page server-side, bypasses most bot blocks
async function tryJinaFetch(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const response = await fetch(jinaUrl, {
    headers: {
      'Accept': 'application/json',
      'X-Return-Format': 'markdown',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Jina HTTP ${response.status}`);
  const json = await response.json();
  return { title: json.data?.title || '', content: json.data?.content || '' };
}

// POST /api/fetch-recipe  { url }
router.post('/', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  // --- Try direct fetch + JSON-LD/HTML parse ---
  let html = null;
  try {
    html = await tryDirectFetch(url);
  } catch (_) {
    // fall through to Jina
  }

  if (html) {
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

    if (recipe.title || recipe.ingredients.length) {
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

      return res.json({ filename, recipe });
    }
    // Direct fetch worked but extraction failed — fall through to Jina for better text
  }

  // --- Fallback 1: Jina Reader ---
  let jinaData;
  try {
    jinaData = await tryJinaFetch(url);
  } catch (_) {
    jinaData = null;
  }

  if (jinaData && !isBlockedPage(jinaData.title, jinaData.content)) {
    const recipe = extractFromText(jinaData.content, jinaData.title);
    if (recipe.title || recipe.ingredients.length) {
      return res.json({ filename: null, recipe });
    }
  }

  // --- Fallback 2: Playwright (real browser, handles JS challenges) ---
  let browserHtml = null;
  try {
    browserHtml = await fetchWithBrowser(url);
  } catch (_) {
    browserHtml = null;
  }

  if (browserHtml) {
    const schema = extractJsonLd(browserHtml);
    let recipe;
    if (schema) {
      recipe = {
        title: stripHtml(schema.name || ''),
        type: 'recipe',
        description: stripHtml(schema.description || ''),
        ingredients: (schema.recipeIngredient || []).map(parseIngredient),
        instructions: parseInstructions(schema.recipeInstructions),
        notes: schema.recipeYield ? `Serves ${Array.isArray(schema.recipeYield) ? schema.recipeYield[0] : schema.recipeYield}` : '',
      };
    } else {
      recipe = extractHtmlScrape(browserHtml);
    }
    if (recipe.title || recipe.ingredients.length) {
      return res.json({ filename: null, recipe });
    }
  }

  return res.status(422).json({ error: 'Could not extract recipe from this page. Try a different recipe site or use the photo/PDF import.' });
});

module.exports = router;

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse/lib/pdf-parse');

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
  fileFilter: (_req, file, cb) =>
    cb(null, /jpeg|jpg|png|gif|webp|avif|pdf/.test(file.mimetype.replace('application/', ''))),
});

// Section header patterns
const SECTION_RE = {
  ingredients:  /^(ingredients?|what you.{0,5}ll need|you.{0,5}ll need)\s*:?\s*$/i,
  instructions: /^(instructions?|directions?|method|steps?|how to( make)?|preparation|prep)\s*:?\s*$/i,
  notes:        /^(notes?|tips?|serving suggestions?|variations?)\s*:?\s*$/i,
};

// Amount + optional unit + ingredient name
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

    if (currentSection === 'header') {
      headerLines.push(line);
      continue;
    }

    if (currentSection === 'ingredients') {
      const m = line.match(ING_RE);
      if (m) {
        ingredients.push({ amount: (m[1] || '').trim(), unit: (m[2] || '').trim(), name: m[3].trim() });
      } else if (line.length > 2 && !/^(serves|yield|prep|cook|total|time)/i.test(line)) {
        ingredients.push({ amount: '', unit: '', name: line });
      }
      continue;
    }

    if (currentSection === 'instructions') {
      const clean = line.replace(/^\d+[.)]\s*/, '').replace(/^[•·\-*]\s*/, '').trim();
      if (clean) instructions.push(clean);
      continue;
    }

    if (currentSection === 'notes') {
      notes = notes ? `${notes} ${line}` : line;
    }
  }

  // Fallback: heuristic ingredient detection if no sections found
  if (!ingredients.length && !instructions.length) {
    for (const line of lines.slice(1)) {
      const m = line.match(ING_RE);
      if (m) ingredients.push({ amount: (m[1] || '').trim(), unit: (m[2] || '').trim(), name: m[3].trim() });
    }
  }

  return {
    title: headerLines[0] || '',
    type: 'recipe',
    description: headerLines.slice(1, 3).join(' '),
    ingredients,
    instructions,
    notes,
  };
}

async function extractText(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  // Image: use tesseract OCR
  const worker = await createWorker('eng', 1, {
    cachePath: path.join(__dirname, '..', '..', '.tesseract-cache'),
    logger: () => {},
  });
  try {
    const { data: { text } } = await worker.recognize(filePath);
    return text;
  } finally {
    await worker.terminate();
  }
}

// POST /api/parse-recipe  (multipart/form-data, field: image)
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = path.join(UPLOADS_DIR, req.file.filename);
  try {
    const text = await extractText(filePath, req.file.mimetype);
    const recipe = parseText(text);
    // PDFs don't become the recipe photo, so only return filename for images
    const isPdf = req.file.mimetype === 'application/pdf';
    res.json({ filename: isPdf ? null : req.file.filename, recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

function attachRelated(recipe) {
  recipe.ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY order_idx, id')
    .all(recipe.id);
  recipe.tags = db
    .prepare('SELECT tag FROM tags WHERE recipe_id = ?')
    .all(recipe.id)
    .map((r) => r.tag);
  return recipe;
}

// GET /api/recipes  (optional ?type=recipe|cocktail)
router.get('/', (req, res) => {
  const { type } = req.query;
  const rows = type
    ? db.prepare('SELECT * FROM recipes WHERE type = ? ORDER BY title COLLATE NOCASE').all(type)
    : db.prepare('SELECT * FROM recipes ORDER BY title COLLATE NOCASE').all();
  res.json(rows.map(attachRelated));
});

// GET /api/recipes/search?q=bourbon,lime
router.get('/search', (req, res) => {
  const terms = (req.query.q || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  if (!terms.length) {
    return res.json([]);
  }

  // Find recipes that contain ALL queried ingredient terms
  const placeholders = terms.map(() => 'LOWER(i.name) LIKE ?').join(' AND ');
  const params = terms.map((t) => `%${t}%`);

  const rows = db
    .prepare(
      `SELECT DISTINCT r.* FROM recipes r
       JOIN ingredients i ON i.recipe_id = r.id
       WHERE ${placeholders}
       ORDER BY r.title COLLATE NOCASE`
    )
    .all(...params);

  res.json(rows.map(attachRelated));
});

// GET /api/recipes/:id
router.get('/:id', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  res.json(attachRelated(recipe));
});

// PATCH /api/recipes/:id/favorite
router.patch('/:id/favorite', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  const newVal = recipe.is_favorite ? 0 : 1;
  db.prepare(`UPDATE recipes SET is_favorite = ?, updated_at = datetime('now') WHERE id = ?`).run(newVal, req.params.id);
  res.json({ id: recipe.id, is_favorite: newVal });
});

function clampFocal(val, fallback = 50) {
  return Math.min(100, Math.max(0, Math.round(Number(val) || fallback)));
}

// POST /api/recipes
router.post('/', (req, res) => {
  const { title, type, subcategory, description, instructions, notes, image_path, is_favorite = 0, focal_x = 50, focal_y = 50, ingredients = [], tags = [] } = req.body;

  if (!title || !type) return res.status(400).json({ error: 'title and type are required' });

  const insert = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO recipes (title, type, subcategory, description, instructions, notes, image_path, is_favorite, focal_x, focal_y)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(title, type, subcategory || null, description || null, instructions || null, notes || null, image_path || null, is_favorite ? 1 : 0, clampFocal(focal_x), clampFocal(focal_y));

    const id = lastInsertRowid;

    const insertIng = db.prepare(
      'INSERT INTO ingredients (recipe_id, name, amount, unit, order_idx, step_group) VALUES (?, ?, ?, ?, ?, ?)'
    );
    ingredients.forEach((ing, idx) => {
      insertIng.run(id, ing.name, ing.amount || null, ing.unit || null, idx, ing.step_group || null);
    });

    const insertTag = db.prepare('INSERT INTO tags (recipe_id, tag) VALUES (?, ?)');
    tags.forEach((tag) => insertTag.run(id, tag));

    return db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  });

  const recipe = insert();
  res.status(201).json(attachRelated(recipe));
});

// PUT /api/recipes/:id
router.put('/:id', (req, res) => {
  const { title, type, subcategory, description, instructions, notes, image_path, is_favorite, focal_x, focal_y, ingredients = [], tags = [] } = req.body;
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const update = db.transaction(() => {
    // If image changed and old image exists, delete old file
    if (image_path !== undefined && existing.image_path && existing.image_path !== image_path) {
      const oldFile = path.join(__dirname, '..', '..', 'uploads', existing.image_path);
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }

    db.prepare(
      `UPDATE recipes SET title=?, type=?, subcategory=?, description=?, instructions=?, notes=?, image_path=?,
       is_favorite=?, focal_x=?, focal_y=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      title ?? existing.title,
      type ?? existing.type,
      subcategory !== undefined ? (subcategory || null) : existing.subcategory,
      description !== undefined ? description : existing.description,
      instructions !== undefined ? instructions : existing.instructions,
      notes !== undefined ? notes : existing.notes,
      image_path !== undefined ? image_path : existing.image_path,
      is_favorite !== undefined ? (is_favorite ? 1 : 0) : existing.is_favorite,
      focal_x !== undefined ? clampFocal(focal_x) : (existing.focal_x ?? 50),
      focal_y !== undefined ? clampFocal(focal_y) : (existing.focal_y ?? 50),
      id
    );

    db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(id);
    const insertIng = db.prepare(
      'INSERT INTO ingredients (recipe_id, name, amount, unit, order_idx, step_group) VALUES (?, ?, ?, ?, ?, ?)'
    );
    ingredients.forEach((ing, idx) => {
      insertIng.run(id, ing.name, ing.amount || null, ing.unit || null, idx, ing.step_group || null);
    });

    db.prepare('DELETE FROM tags WHERE recipe_id = ?').run(id);
    const insertTag = db.prepare('INSERT INTO tags (recipe_id, tag) VALUES (?, ?)');
    tags.forEach((tag) => insertTag.run(id, tag));
  });

  update();
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  res.json(attachRelated(recipe));
});

// DELETE /api/recipes/:id
router.delete('/:id', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });

  if (recipe.image_path) {
    const file = path.join(__dirname, '..', '..', 'uploads', recipe.image_path);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

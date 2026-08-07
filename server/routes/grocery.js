const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/grocery
router.get('/', (_req, res) => {
  const items = db.prepare(
    `SELECT * FROM grocery_items
     ORDER BY checked ASC, (recipe_title IS NULL) DESC, recipe_title ASC, created_at ASC`
  ).all();
  res.json(items);
});

// POST /api/grocery  { items: [{name, amount?, unit?, recipe_id?, recipe_title?}] }
router.post('/', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items array required' });
  }
  const insert = db.prepare(
    'INSERT INTO grocery_items (name, amount, unit, recipe_id, recipe_title) VALUES (?, ?, ?, ?, ?)'
  );
  const added = db.transaction(() =>
    items
      .filter((i) => i.name?.trim())
      .map((i) => {
        const { lastInsertRowid } = insert.run(
          i.name.trim(),
          i.amount?.trim() || null,
          i.unit?.trim() || null,
          i.recipe_id || null,
          i.recipe_title || null
        );
        return db.prepare('SELECT * FROM grocery_items WHERE id = ?').get(lastInsertRowid);
      })
  );
  res.status(201).json(added());
});

// PATCH /api/grocery/:id/check — toggle checked
router.patch('/:id/check', (req, res) => {
  const item = db.prepare('SELECT * FROM grocery_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const newVal = item.checked ? 0 : 1;
  db.prepare('UPDATE grocery_items SET checked = ? WHERE id = ?').run(newVal, item.id);
  res.json({ ...item, checked: newVal });
});

// DELETE /api/grocery/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM grocery_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/grocery?all=true clears all; default clears checked only
router.delete('/', (req, res) => {
  if (req.query.all === 'true') {
    db.prepare('DELETE FROM grocery_items').run();
  } else {
    db.prepare('DELETE FROM grocery_items WHERE checked = 1').run();
  }
  res.json({ ok: true });
});

module.exports = router;

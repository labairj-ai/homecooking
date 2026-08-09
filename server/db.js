const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'homecooking.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Legacy migration: add subcategory to existing DBs (no-op if already present)
try { db.exec(`ALTER TABLE recipes ADD COLUMN subcategory TEXT`); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('recipe','cocktail')),
    subcategory TEXT,
    description TEXT,
    instructions TEXT,
    notes       TEXT,
    image_path  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ingredients (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    amount    TEXT,
    unit      TEXT,
    order_idx INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tags (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag       TEXT NOT NULL
  );
`);

// Versioned migrations using SQLite user_version pragma
const userVersion = db.pragma('user_version', { simple: true });

if (userVersion < 1) {
  // Add is_favorite column and expand type CHECK to include 'drink'.
  // SQLite can't alter CHECK constraints in place, so we recreate the table.
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE recipes_new (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('recipe','cocktail','drink')),
      subcategory TEXT,
      description TEXT,
      instructions TEXT,
      notes       TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      image_path  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO recipes_new
      (id, title, type, subcategory, description, instructions, notes, image_path, created_at, updated_at, is_favorite)
      SELECT id, title, type, subcategory, description, instructions, notes, image_path, created_at, updated_at, 0
      FROM recipes;
    DROP TABLE recipes;
    ALTER TABLE recipes_new RENAME TO recipes;
  `);
  db.pragma('foreign_keys = ON');
  db.pragma('user_version = 1');
}

if (userVersion < 2) {
  db.exec(`ALTER TABLE recipes ADD COLUMN focal_x INTEGER NOT NULL DEFAULT 50`);
  db.exec(`ALTER TABLE recipes ADD COLUMN focal_y INTEGER NOT NULL DEFAULT 50`);
  db.pragma('user_version = 2');
}

if (userVersion < 3) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS grocery_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      amount        TEXT,
      unit          TEXT,
      recipe_id     INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      recipe_title  TEXT,
      checked       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.pragma('user_version = 3');
}

if (userVersion < 4) {
  db.exec(`ALTER TABLE ingredients ADD COLUMN step_group TEXT`);
  db.pragma('user_version = 4');
}

module.exports = db;

# Homecooking

Personal recipe and drink manager split into two siloed sections: **My Kitchen** for recipes and cocktails, and **My Cellar** for wine, beer, and spirits.

## Features

### My Kitchen (`/`)
- **Recipes & Cocktails** — separate types with subcategories (Breakfast, Lunch, Dinner, Dessert)
- **Ingredient search** — find recipes that contain all queried ingredients
- **Rich text editor** — TipTap-powered instructions and notes with formatting
- **Ingredients** — amounts, units (including time units: sec/min/hr), and names with optional **Flow step labels**; rows are reorderable with ↑/↓ buttons
- **Flow Table view** — toggle on any recipe detail page to see a matrix layout: ingredients as rows, cooking steps as columns, with merged cells showing which ingredients combine at each step (mirrors the visual "table recipe" format). The recipe description appears as a full-width prep header row. Step labels are case-insensitive and deduplicated; the step field offers a datalist dropdown of existing steps to prevent naming drift.
- **Cook Mode** — full-screen step-by-step overlay with Wake Lock (keeps screen on)
- **Grocery List** — add all ingredients from any recipe with one tap; manual add; checkbox/clear
- **Quick Capture** — import recipes from a URL, PDF scan, or photo via AI parsing

### My Cellar (`/cellar`)
- **Wine, Beer & Spirits** — bottle/drink entries with subcategory filters
- **Favorites** — star/unstar drinks; filter to favorites only
- **Tasting Notes** — rich text notes per drink

### Shared
- **Photo support** — upload a photo per entry; click the preview to set a **focal point** (x/y %) that controls which part of the photo shows on cards and the detail hero image
- **Tags** — freeform tags with keyboard-friendly input
- **Mobile nav** — fixed bottom tab bar on small screens (Kitchen / Cellar / Add), top nav on desktop
- **Favicon** — branded SVG pan+egg icon (`/favicon.svg`)

## Stack

- **Frontend**: React 18 + React Router + Vite
- **Backend**: Express.js + better-sqlite3
- **Image uploads**: Multer (stored in `/uploads/`, 20 MB max)

## Dev setup

```bash
npm install
npm run dev
```

Runs the Express server and Vite dev server concurrently. App opens on the port shown in the terminal.

## Deploy

```bash
npm run deploy
```

Builds the client, rsyncs to the optiplex server, installs deps, and restarts the systemd service.

## Data

SQLite database at `homecooking.db` (auto-created on first run, versioned migrations via `PRAGMA user_version`). Uploaded images stored in `uploads/`.

| Migration | Change |
|---|---|
| v1 | Added `is_favorite`, expanded `type` to include `drink` |
| v2 | Added `focal_x`, `focal_y` to recipes |
| v3 | Added `grocery_items` table |
| v4 | Added `step_group TEXT` to `ingredients` (flow table feature) |

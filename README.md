# Homecooking

Personal recipe and drink manager split into two siloed sections: **My Kitchen** for recipes and cocktails, and **My Cellar** for wine, beer, and spirits.

## Features

### My Kitchen (`/`)
- **Recipes & Cocktails** — separate types with subcategories (Breakfast, Lunch, Dinner, Sides, Dessert)
- **Grouped "All" view** — selecting the All tab organizes cards into labeled sections (Recipes → Sides → Desserts → Cocktails) in tab order; individual tabs still show a flat grid
- **Recipe reordering** — hover any card to reveal ▲▼ buttons (top-left corner; always visible on touch); clicking moves the recipe one position up or down within its section; order persists in the database
- **Ingredient search** — find recipes that contain all queried ingredients
- **Rich text editor** — TipTap-powered instructions and notes with formatting
- **Ingredients** — amounts, units (including time units: sec/min/hr), and names with optional **Flow step labels**; rows are reorderable via drag-and-drop (desktop mouse and mobile touch)
- **Flow Table view** — toggle on any recipe detail page to see a matrix layout: ingredients as rows, cooking steps as columns, with merged cells showing which ingredients combine at each step
- **Cook Mode** — full-screen step-by-step overlay with Wake Lock (keeps screen on)
- **Grocery List** — add all ingredients from any recipe with one tap; manual add; paste a comma- or newline-separated list; checkbox/clear; swipe-delete with 5-second undo toast
- **Quick Capture** — import recipes from a URL, scanned photo (via `qwen2.5-vl:7b` vision AI on Ollama), or PDF
- **Ask AI** — recipe-aware chat panel on every recipe detail page; streaming tokens with animated thinking indicator; powered by `Qwen3.6-35B-A3B-4bit` (MLX)

### ✨ What Can I Make? (`/suggest`)
Enter ingredients you have on hand and a local LLM generates recipe ideas.

- **Concept picker** — generates 3 title+tagline ideas via `phi-4-4bit`; pick before committing to the full generation
- **From My Bar** — button below the ingredient input loads your cellar spirits as selectable chips; tap to add them as ingredients for cocktail suggestions
- **Real-time streaming** — tokens appear as the model generates, including Qwen3 reasoning tokens
- **Models** — `phi-4-4bit` (MLX) for concepts; `Qwen3.6-35B-A3B-4bit` (MLX) for full recipes; 6000-token budget to accommodate Qwen3 thinking + full recipe JSON
- **Cook time constraint** — Any / < 30 min / 30–60 min / 1+ hour
- **Try Another** — during streaming goes back to concept cards; New Concepts fetches a fresh set
- **Save to My Kitchen / Try It** — one-click save or stage in the Try It queue
- **Resilient generation** — largest-JSON extraction handles Qwen3 thinking preamble; truncated output repair; 90-second SSE watchdog; auto-retry; 3-retry POST with backoff

### My Cellar (`/cellar`)
- **Wine, Beer & Spirits** — bottle/drink entries with subcategory filters
- **Cocktail Queue** — cocktails in the Try It queue appear at the top of the Cellar page with promote-to-Kitchen and delete actions (separate from the food recipe Try It page)
- **Spirits import** — "Import spirits list" panel: paste names one per line to bulk-add spirits to My Bar; each entry becomes a `drink/spirits` record available for cocktail suggestions
- **Favorites** — star/unstar drinks; filter to favorites only
- **Tasting Notes** — rich text notes per drink

### 🧪 Try It Queue (`/tryit`)
Staging area for **food recipes only** — cocktails have their own queue in My Cellar.
- Promote to My Kitchen once tested or delete if not a keeper
- Import from URL (direct fetch → Jina Reader → Playwright fallback chain), PDF, or AI generation
- Banner on home page shows pending recipe count

### Shared
- **Photo support** — upload a photo per entry; click the preview to set a **focal point** that controls cropping on cards and detail hero
- **Tags** — freeform tags with keyboard-friendly input
- **Mobile nav** — bottom tab bar on small screens; top nav on desktop
- **Favicon** — branded SVG pan+egg icon

## Stack

- **Frontend**: React 18 + React Router + Vite
- **Backend**: Express.js + better-sqlite3
- **Image uploads**: Multer (stored in `/uploads/`, 20 MB max)
- **AI — recipe generation & chat**: MLX OpenAI-compatible server (`mlx-community/Qwen3.6-35B-A3B-4bit` for recipe generation and Ask AI chat; `mlx-community/phi-4-4bit` for concept suggestions). Set `LLM_URL` env var (default `http://localhost:8080`).
- **AI — image parsing**: [Ollama](https://ollama.com) — `qwen2.5-vl:7b` for photo Quick Capture. Set `OLLAMA_URL` (default `http://localhost:11434`).
- **URL import**: direct fetch with browser headers → [Jina Reader](https://jina.ai/reader/) markdown fallback → Playwright headless Chromium fallback for JS-challenge sites

## Dev setup

```bash
npm install
npm run dev
```

Runs the Express server and Vite dev server concurrently.

AI features require:
- **Recipe generation & Ask AI**: MLX server running `Qwen3.6-35B-A3B-4bit` and `phi-4-4bit`. Set `LLM_URL`.
- **Photo Quick Capture**: Ollama with `qwen2.5-vl:7b` pulled. Set `OLLAMA_URL` if not on localhost.

## Deploy

```bash
npm run deploy
```

Builds the client, rsyncs to the home server, installs deps (including Playwright Chromium on first run), and restarts the systemd service.

## Data

SQLite database at `homecooking.db` (auto-created on first run, versioned migrations via `PRAGMA user_version`). Uploaded images stored in `uploads/`. Both are gitignored and backed up nightly to a private `homecooking-data` repo via systemd timer.

| Migration | Change |
|---|---|
| v1 | Added `is_favorite`, expanded `type` to include `drink` |
| v2 | Added `focal_x`, `focal_y` to recipes |
| v3 | Added `grocery_items` table |
| v4 | Added `step_group TEXT` to `ingredients` (flow table feature) |
| v5 | Added `is_trial INTEGER` to `recipes` (Try It queue) |
| v6 | Added `sort_order INTEGER DEFAULT 0` to `recipes` (manual reordering) |

# Homecooking

Personal recipe and drink manager split into two siloed sections: **My Kitchen** for recipes and cocktails, and **My Cellar** for wine, beer, and spirits.

## Features

### My Kitchen (`/`)
- **Recipes & Cocktails** — separate types with subcategories (Breakfast, Lunch, Dinner, Dessert)
- **Ingredient search** — find recipes that contain all queried ingredients
- **Rich text editor** — TipTap-powered instructions and notes with formatting
- **Ingredients** — amounts, units (including time units: sec/min/hr), and names with optional **Flow step labels**; rows are reorderable via drag-and-drop (desktop mouse and mobile touch)
- **Flow Table view** — toggle on any recipe detail page to see a matrix layout: ingredients as rows, cooking steps as columns, with merged cells showing which ingredients combine at each step. Step labels are case-insensitive and deduplicated; the step field offers a datalist dropdown of existing steps to prevent naming drift.
- **Cook Mode** — full-screen step-by-step overlay with Wake Lock (keeps screen on)
- **Grocery List** — add all ingredients from any recipe with one tap; manual add; checkbox/clear
- **Quick Capture** — import recipes from a URL, scanned photo (via `minicpm-v` vision AI), or PDF

### ✨ What Can I Make? (`/suggest`)
Enter ingredients you have on hand and a local LLM (`phi4:14b`) generates a complete recipe or cocktail suggestion.

- **Real-time streaming** — tokens appear as phi4 generates them in a live text panel with a blinking cursor
- **Food or cocktail** — two buttons let you choose which direction to take the ingredients
- **Try Another** — cancels the current generation and immediately fires a new request for a fresh suggestion
- **Save to My Kitchen** — one-click save that populates the full recipe (title, description, ingredients, instructions, notes) directly into the app
- **Connection resilient** — 3-retry POST on network error; SSE stream reconnects on interruption; 6-minute server-side timeout for slow CPU inference

### My Cellar (`/cellar`)
- **Wine, Beer & Spirits** — bottle/drink entries with subcategory filters
- **Favorites** — star/unstar drinks; filter to favorites only
- **Tasting Notes** — rich text notes per drink

### Shared
- **Photo support** — upload a photo per entry; click the preview to set a **focal point** (x/y %) that controls which part of the photo shows on cards and the detail hero image
- **Tags** — freeform tags with keyboard-friendly input
- **Mobile nav** — fixed bottom tab bar on small screens (Kitchen / Cellar / List / Suggest), top nav on desktop
- **Favicon** — branded SVG pan+egg icon (`/favicon.svg`)

## Stack

- **Frontend**: React 18 + React Router + Vite
- **Backend**: Express.js + better-sqlite3
- **Image uploads**: Multer (stored in `/uploads/`, 20 MB max)
- **AI**: [Ollama](https://ollama.com) running locally on the host — `phi4:14b` for recipe generation, `minicpm-v` for image parsing

## Dev setup

```bash
npm install
npm run dev
```

Runs the Express server and Vite dev server concurrently. App opens on the port shown in the terminal.

AI features (`/suggest`, photo Quick Capture) require Ollama running on `localhost:11434` with `phi4:14b` and `minicpm-v` pulled.

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

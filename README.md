# Homecooking

Personal recipe and drink manager split into two siloed sections: **My Kitchen** for recipes and cocktails, and **My Cellar** for wine, beer, and spirits.

## Features

### My Kitchen (`/`)
- **Recipes & Cocktails** — separate types with subcategories (Breakfast, Lunch, Dinner, Sides, Dessert)
- **Ingredient search** — find recipes that contain all queried ingredients
- **Rich text editor** — TipTap-powered instructions and notes with formatting
- **Ingredients** — amounts, units (including time units: sec/min/hr), and names with optional **Flow step labels**; rows are reorderable via drag-and-drop (desktop mouse and mobile touch)
- **Flow Table view** — toggle on any recipe detail page to see a matrix layout: ingredients as rows, cooking steps as columns, with merged cells showing which ingredients combine at each step. Step labels are case-insensitive and deduplicated; the step field offers a datalist dropdown of existing steps to prevent naming drift.
- **Cook Mode** — full-screen step-by-step overlay with Wake Lock (keeps screen on)
- **Grocery List** — add all ingredients from any recipe with one tap; manual add; checkbox/clear; swipe-delete with 5-second undo toast
- **Quick Capture** — import recipes from a URL, scanned photo (via `qwen2.5-vl:7b` vision AI), or PDF
- **Ask AI** — recipe-aware chat panel on every recipe detail page; ask substitution questions, describe what went wrong, or get specific improvement suggestions; powered by `llama3.3:70b` with the recipe's ingredients and instructions injected as context; streaming tokens appear in real time; chat is ephemeral (resets on close)

### ✨ What Can I Make? (`/suggest`)
Enter ingredients you have on hand, pick your options, and a local LLM generates recipe ideas.

- **Concept picker** — clicking Food or Cocktail first generates 3 short title+tagline ideas to choose from; pick the one that sounds right before committing to the full generation
- **Real-time streaming** — tokens appear as the model generates them in a live text panel with a blinking cursor
- **Model** — `llama3.3:70b` via Ollama (runs on a dedicated always-on Apple Silicon machine)
- **Cook time constraint** — pill chips (Any / < 30 min / 30–60 min / 1+ hour) added to the prompt as a soft constraint
- **Try Another** — during streaming goes back to the concept cards to pick a different idea; New Concepts fetches a fresh set of 3
- **Save to My Kitchen / Try It** — one-click save goes live immediately, or stage it in the Try It queue to test first
- **Resilient generation** — 4-strategy JSON repair recovers truncated model output; 90-second SSE watchdog prevents silent hangs; auto-retry once on stream error; model-aware timeouts (phi4: 10 min, qwen: 3 min); 3-retry POST with backoff for job start

### My Cellar (`/cellar`)
- **Wine, Beer & Spirits** — bottle/drink entries with subcategory filters
- **Favorites** — star/unstar drinks; filter to favorites only
- **Tasting Notes** — rich text notes per drink

### Shared
- **Photo support** — upload a photo per entry; click the preview to set a **focal point** (x/y %) that controls which part of the photo shows on cards and the detail hero image
- **Tags** — freeform tags with keyboard-friendly input
- **Try It queue** (`/tryit`) — staging area for recipes; promote to My Kitchen once tested or delete if not a keeper; banner on home page shows queue count; includes URL import (paste any recipe URL to scrape and add directly to the queue)
- **Mobile nav** — bottom tab bar on small screens (Kitchen / Cellar / List / Suggest / Try It) pinned via flex layout with `100svh`, top nav on desktop
- **Favicon** — branded SVG pan+egg icon (`/favicon.svg`)

## Stack

- **Frontend**: React 18 + React Router + Vite
- **Backend**: Express.js + better-sqlite3
- **Image uploads**: Multer (stored in `/uploads/`, 20 MB max)
- **AI**: [Ollama](https://ollama.com) — `llama3.3:70b` for recipe generation and chat, `qwen2.5-vl:7b` for image parsing. The server reads `OLLAMA_URL` from the environment (default `http://localhost:11434`); in production the systemd unit points this to a dedicated always-on machine (Mac Studio M1 Max 64 GB over Tailscale)

## Dev setup

```bash
npm install
npm run dev
```

Runs the Express server and Vite dev server concurrently. App opens on the port shown in the terminal.

AI features (`/suggest`, photo Quick Capture) require Ollama running with `llama3.3:70b` and `qwen2.5-vl:7b` pulled. In dev, Ollama defaults to `localhost:11434`; set `OLLAMA_URL` in the environment to point elsewhere.

## Deploy

```bash
npm run deploy
```

Builds the client, rsyncs to the home server, installs deps, and restarts the systemd service.

## Data

SQLite database at `homecooking.db` (auto-created on first run, versioned migrations via `PRAGMA user_version`). Uploaded images stored in `uploads/`.

| Migration | Change |
|---|---|
| v1 | Added `is_favorite`, expanded `type` to include `drink` |
| v2 | Added `focal_x`, `focal_y` to recipes |
| v3 | Added `grocery_items` table |
| v4 | Added `step_group TEXT` to `ingredients` (flow table feature) |
| v5 | Added `is_trial INTEGER` to `recipes` (Try It queue) |

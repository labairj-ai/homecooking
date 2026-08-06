# Homecooking

Personal recipe and drink manager split into two siloed sections: **My Kitchen** for recipes and cocktails, and **My Cellar** for wine, beer, and spirits.

## Features

### My Kitchen (`/`)
- **Recipes & Cocktails** — separate types with subcategories (Breakfast, Lunch, Dinner, Dessert)
- **Ingredient search** — find recipes that contain all queried ingredients
- **Rich text editor** — TipTap-powered instructions and notes with formatting
- **Ingredients** — amounts, units, and names

### My Cellar (`/cellar`)
- **Wine, Beer & Spirits** — bottle/drink entries with subcategory filters
- **Favorites** — star/unstar drinks; filter to favorites only
- **Tasting Notes** — rich text notes per drink

### Shared
- **Photo support** — upload a photo per entry; click the preview to set a **focal point** (x/y %) that controls which part of the photo shows on cards and the detail hero image
- **Tags** — freeform tags with keyboard-friendly input
- **Mobile nav** — fixed bottom tab bar on small screens (Kitchen / Cellar / Add), top nav on desktop

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

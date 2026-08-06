# Homecooking

Personal recipe and cocktail manager. Browse, add, and edit recipes, cocktails, and drinks with photos, ingredients, rich-text instructions, and tags.

## Features

- **Recipes, Cocktails & Drinks** — separate types with subcategories (Breakfast, Lunch, Dinner, Dessert / Wine, Beer, Spirits)
- **Photo support** — upload photos per recipe; click the preview to set a focal point controlling which part of the photo shows on cards
- **Rich text editor** — TipTap-powered instructions and notes with formatting
- **Ingredients** — amounts, units, and names; drinks skip the ingredient list
- **Tags** — freeform tags with keyboard-friendly input
- **Favorites** — star/unstar drinks
- **Ingredient search** — find recipes that contain all queried ingredients

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

## Data

SQLite database at `homecooking.db` (auto-created on first run). Uploaded images stored in `uploads/`.

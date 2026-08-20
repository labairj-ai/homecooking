const BASE = '/api';

async function json(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  listRecipes: (type, trial = false) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (trial) params.set('trial', '1');
    const qs = params.toString();
    return fetch(`${BASE}/recipes${qs ? `?${qs}` : ''}`).then(json);
  },

  promoteRecipe: (id) =>
    fetch(`${BASE}/recipes/${id}/promote`, { method: 'PATCH' }).then(json),

  searchRecipes: (q) =>
    fetch(`${BASE}/recipes/search?q=${encodeURIComponent(q)}`).then(json),

  getRecipe: (id) => fetch(`${BASE}/recipes/${id}`).then(json),

  createRecipe: (data) =>
    fetch(`${BASE}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  updateRecipe: (id, data) =>
    fetch(`${BASE}/recipes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  deleteRecipe: (id) =>
    fetch(`${BASE}/recipes/${id}`, { method: 'DELETE' }).then(json),

  toggleFavorite: (id) =>
    fetch(`${BASE}/recipes/${id}/favorite`, { method: 'PATCH' }).then(json),

  uploadImage: (file) => {
    const form = new FormData();
    form.append('image', file);
    return fetch(`${BASE}/upload`, { method: 'POST', body: form }).then(json);
  },

  parseRecipe: (file) => {
    const form = new FormData();
    form.append('image', file);
    return fetch(`${BASE}/parse-recipe`, { method: 'POST', body: form }).then(json);
  },

  fetchRecipeFromUrl: (url) =>
    fetch(`${BASE}/fetch-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).then(json),

  listGrocery: () => fetch(`${BASE}/grocery`).then(json),

  addGroceryItems: (items) =>
    fetch(`${BASE}/grocery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }).then(json),

  toggleGroceryItem: (id) =>
    fetch(`${BASE}/grocery/${id}/check`, { method: 'PATCH' }).then(json),

  deleteGroceryItem: (id) =>
    fetch(`${BASE}/grocery/${id}`, { method: 'DELETE' }).then(json),

  clearGrocery: (all = false) =>
    fetch(`${BASE}/grocery${all ? '?all=true' : ''}`, { method: 'DELETE' }).then(json),

  parseRecipeJob: (jobId) =>
    fetch(`${BASE}/parse-recipe/job/${jobId}`).then(json),

  suggestRecipe: (ingredients, type, model, cookTime, concept) =>
    fetch(`${BASE}/suggest-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients, type, model, cookTime, concept }),
    }).then(json),

  suggestConcepts: (ingredients, type, model, cookTime) =>
    fetch(`${BASE}/suggest-recipe/concepts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients, type, model, cookTime }),
    }).then(json),

  startChat: (id, messages) =>
    fetch(`${BASE}/recipes/${id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    }).then(json),

  chatStreamUrl: (id, jobId) => `${BASE}/recipes/${id}/chat/stream/${jobId}`,
};

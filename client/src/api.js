const BASE = '/api';

async function json(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  listRecipes: (type) =>
    fetch(type ? `${BASE}/recipes?type=${type}` : `${BASE}/recipes`).then(json),

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

  uploadImage: (file) => {
    const form = new FormData();
    form.append('image', file);
    return fetch(`${BASE}/upload`, { method: 'POST', body: form }).then(json);
  },
};

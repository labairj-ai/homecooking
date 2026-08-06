import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import RecipeCard from '../components/RecipeCard';
import './Home.css';

const SUBCATEGORIES = [
  { label: 'All', value: '' },
  { label: '🍷 Wine', value: 'wine' },
  { label: '🍺 Beer', value: 'beer' },
  { label: '🥃 Spirits', value: 'spirits' },
];

export default function Cellar() {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subFilter, setSubFilter] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDrinks(await api.listRecipes('drink'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggleFavorite(id) {
    const { is_favorite } = await api.toggleFavorite(id);
    setDrinks((prev) => prev.map((r) => r.id === id ? { ...r, is_favorite } : r));
  }

  const displayed = drinks.filter((r) => {
    if (subFilter && r.subcategory !== subFilter) return false;
    if (favOnly && !r.is_favorite) return false;
    return true;
  });

  return (
    <div className="home">
      <div className="home-header">
        <h1>My Cellar</h1>
        <p className="home-subtitle">Wine, beer &amp; spirits</p>
      </div>

      <div className="filter-tabs">
        {SUBCATEGORIES.map((s) => (
          <button
            key={s.value}
            className={`filter-tab ${subFilter === s.value ? 'active' : ''}`}
            onClick={() => setSubFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
        <button
          className={`filter-tab fav-filter-tab ${favOnly ? 'active' : ''}`}
          onClick={() => setFavOnly((v) => !v)}
        >
          ★ Favorites
        </button>
      </div>

      {loading && <div className="state-msg">Loading…</div>}
      {error && <div className="state-msg error">Error: {error}</div>}
      {!loading && !error && displayed.length === 0 && (
        <div className="state-msg">No drinks yet — add one!</div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className="recipe-grid">
          {displayed.map((r) => (
            <RecipeCard key={r.id} recipe={r} onToggleFavorite={handleToggleFavorite} />
          ))}
        </div>
      )}
    </div>
  );
}

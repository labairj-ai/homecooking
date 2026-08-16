import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import RecipeCard from '../components/RecipeCard';
import './Home.css';

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Recipes', value: 'recipe' },
  { label: 'Sides', value: 'sides' },
  { label: 'Desserts', value: 'dessert' },
  { label: 'Cocktails', value: 'cocktail' },
];

export default function Home() {
  const [recipes, setRecipes] = useState([]);
  const [trialCount, setTrialCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [searchTerms, setSearchTerms] = useState([]);
  const [termDraft, setTermDraft] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, trials] = await Promise.all([
        searchTerms.length > 0
          ? api.searchRecipes(searchTerms.join(','))
          : api.listRecipes(filter === 'sides' || filter === 'dessert' ? 'recipe' : filter),
        api.listRecipes('', true),
      ]);
      setRecipes(data);
      setTrialCount(trials.length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, searchTerms]);

  useEffect(() => { load(); }, [load]);

  function addTerm(e) {
    e.preventDefault();
    const t = termDraft.trim();
    if (t && !searchTerms.includes(t)) {
      setSearchTerms((prev) => [...prev, t]);
    }
    setTermDraft('');
  }

  function removeTerm(t) {
    setSearchTerms((prev) => prev.filter((x) => x !== t));
  }

  function handleSearchKey(e) {
    if (e.key === 'Enter') addTerm(e);
    if (e.key === 'Backspace' && termDraft === '' && searchTerms.length > 0) {
      setSearchTerms((prev) => prev.slice(0, -1));
    }
  }

  async function handleToggleFavorite(id) {
    const { is_favorite } = await api.toggleFavorite(id);
    setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, is_favorite } : r));
  }

  const displayed = searchTerms.length > 0
    ? recipes.filter((r) => r.type !== 'drink')
    : recipes.filter((r) => {
        if (r.type === 'drink') return false;
        if (filter === 'sides') return r.type === 'recipe' && r.subcategory === 'sides';
        if (filter === 'dessert') return r.type === 'recipe' && r.subcategory === 'dessert';
        if (filter && r.type !== filter) return false;
        return true;
      });

  return (
    <div className="home">
      <div className="home-header">
        <h1>My Kitchen</h1>
        <p className="home-subtitle">Recipes &amp; cocktails</p>
      </div>

      {trialCount > 0 && (
        <Link to="/tryit" className="tryit-banner">
          🧪 {trialCount} recipe{trialCount !== 1 ? 's' : ''} in your Try It queue →
        </Link>
      )}

      <div className="search-bar">
        <div className="search-input-wrap">
          {searchTerms.map((t) => (
            <span key={t} className="search-chip">
              {t}
              <button type="button" className="search-chip-remove" onClick={() => removeTerm(t)}>×</button>
            </span>
          ))}
          <input
            value={termDraft}
            onChange={(e) => setTermDraft(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder={searchTerms.length ? 'Add another ingredient…' : 'Search by ingredient… (press Enter to add)'}
            style={{ border: 'none', outline: 'none', flex: 1, minWidth: 180, padding: '0.4rem 0.2rem', background: 'transparent' }}
          />
        </div>
        {searchTerms.length > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setSearchTerms([])}>
            Clear
          </button>
        )}
      </div>

      {searchTerms.length === 0 && (
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`filter-tab ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="state-msg">Loading…</div>}
      {error && <div className="state-msg error">Error: {error}</div>}
      {!loading && !error && displayed.length === 0 && (
        <div className="state-msg">
          {searchTerms.length > 0
            ? `No recipes found with: ${searchTerms.join(', ')}`
            : 'No recipes yet — add one!'}
        </div>
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

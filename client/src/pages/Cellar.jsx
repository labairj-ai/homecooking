import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import RecipeCard from '../components/RecipeCard';
import TypeBadge from '../components/TypeBadge';
import './Home.css';
import './Cellar.css';

const SUBCATEGORIES = [
  { label: 'All', value: '' },
  { label: '🍷 Wine', value: 'wine' },
  { label: '🍺 Beer', value: 'beer' },
  { label: '🥃 Spirits', value: 'spirits' },
];

export default function Cellar() {
  const [drinks, setDrinks] = useState([]);
  const [cocktailQueue, setCocktailQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subFilter, setSubFilter] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [error, setError] = useState(null);

  // Cocktail queue actions
  const [promoting, setPromoting] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Spirits import panel
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [drinksData, cocktailsData] = await Promise.all([
        api.listRecipes('drink'),
        api.listRecipes('cocktail', true),
      ]);
      setDrinks(drinksData);
      setCocktailQueue(cocktailsData);
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

  async function handlePromoteCocktail(id) {
    setPromoting(id);
    try {
      await api.promoteRecipe(id);
      setCocktailQueue((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert('Failed to move to kitchen: ' + e.message);
    } finally {
      setPromoting(null);
    }
  }

  async function handleDeleteCocktail(recipe) {
    if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return;
    setDeleting(recipe.id);
    try {
      await api.deleteRecipe(recipe.id);
      setCocktailQueue((prev) => prev.filter((r) => r.id !== recipe.id));
    } catch (e) {
      alert('Delete failed: ' + e.message);
      setDeleting(null);
    }
  }

  async function handleImportSpirits() {
    const names = importText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    setImporting(true);
    try {
      for (const name of names) {
        await api.createRecipe({
          title: name,
          type: 'drink',
          subcategory: 'spirits',
          description: '',
          instructions: '',
          notes: '',
          image_path: null,
          is_trial: 0,
          ingredients: [],
          tags: [],
        });
      }
      setImportText('');
      setShowImport(false);
      await load();
    } catch (e) {
      alert('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
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

      {/* Cocktail try-it queue */}
      {cocktailQueue.length > 0 && (
        <div className="cellar-queue-section">
          <h2 className="cellar-queue-title">🍸 Cocktail Queue</h2>
          <p className="cellar-queue-subtitle">Cocktails waiting to be tested — move to My Kitchen once approved.</p>
          <div className="tryit-list">
            {cocktailQueue.map((recipe) => (
              <div key={recipe.id} className="tryit-card">
                <Link to={`/recipe/${recipe.id}`} className="tryit-card-link">
                  <div className="tryit-thumb">
                    {recipe.image_path ? (
                      <img
                        src={`/uploads/${recipe.image_path}`}
                        alt={recipe.title}
                        style={{ objectPosition: `${recipe.focal_x ?? 50}% ${recipe.focal_y ?? 50}%` }}
                      />
                    ) : (
                      <div className="tryit-thumb-placeholder">🍸</div>
                    )}
                  </div>
                  <div className="tryit-info">
                    <div className="tryit-meta">
                      <TypeBadge type="cocktail" />
                    </div>
                    <h3 className="tryit-title">{recipe.title}</h3>
                    {recipe.description && (
                      <p className="tryit-desc">{recipe.description}</p>
                    )}
                  </div>
                </Link>
                <div className="tryit-actions">
                  <button
                    className="btn-promote"
                    onClick={() => handlePromoteCocktail(recipe.id)}
                    disabled={promoting === recipe.id || deleting === recipe.id}
                  >
                    {promoting === recipe.id ? 'Moving…' : '✓ Move to Kitchen'}
                  </button>
                  <button
                    className="btn-danger tryit-delete-btn"
                    onClick={() => handleDeleteCocktail(recipe)}
                    disabled={promoting === recipe.id || deleting === recipe.id}
                  >
                    {deleting === recipe.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spirits import */}
      <div className="cellar-import-bar">
        <button
          className="btn-secondary cellar-import-toggle"
          onClick={() => setShowImport((v) => !v)}
        >
          📋 {showImport ? 'Hide import' : 'Import spirits list'}
        </button>
      </div>

      {showImport && (
        <div className="cellar-import-panel">
          <p className="cellar-import-label">Paste spirit names, one per line:</p>
          <textarea
            className="cellar-import-textarea"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={7}
            placeholder={'Bulleit Bourbon\nTanqueray Gin\nGrey Goose Vodka\nAperol\nCampari'}
            disabled={importing}
          />
          <div className="cellar-import-actions">
            <button
              className="btn-primary"
              onClick={handleImportSpirits}
              disabled={importing || !importText.trim()}
            >
              {importing ? 'Adding…' : 'Add to My Bar'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowImport(false); setImportText(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

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

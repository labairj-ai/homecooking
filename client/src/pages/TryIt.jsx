import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import TypeBadge from '../components/TypeBadge';
import './TryIt.css';

const PLACEHOLDERS = { cocktail: '🍸', drink: '🥂', recipe: '🍽️' };

export default function TryIt() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [promoting, setPromoting] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfImportError, setPdfImportError] = useState(null);
  const pdfFileRef = useRef();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listRecipes('', true);
      setRecipes(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handlePromote(id) {
    setPromoting(id);
    try {
      await api.promoteRecipe(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert('Failed to move to kitchen: ' + e.message);
    } finally {
      setPromoting(null);
    }
  }

  async function handleDelete(recipe) {
    if (!confirm(`Delete "${recipe.title}"? This cannot be undone.`)) return;
    setDeleting(recipe.id);
    try {
      await api.deleteRecipe(recipe.id);
      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
    } catch (e) {
      alert('Delete failed: ' + e.message);
      setDeleting(null);
    }
  }

  async function handleImportPdf(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPdfImporting(true);
    setPdfImportError(null);
    try {
      const result = await api.parseRecipe(file);
      if (!result.recipe) throw new Error(result.error || 'Could not parse PDF');
      const { recipe } = result;
      const instructions = recipe.instructions?.length
        ? `<ol>${recipe.instructions.map((s) => `<li>${s}</li>`).join('')}</ol>`
        : '';
      const saved = await api.createRecipe({
        title: recipe.title || 'Untitled Recipe',
        type: ['recipe', 'cocktail', 'drink'].includes(recipe.type) ? recipe.type : 'recipe',
        description: recipe.description || '',
        instructions,
        notes: recipe.notes || '',
        image_path: null,
        is_trial: 1,
        ingredients: (recipe.ingredients || []).filter((i) => i.name?.trim()),
        tags: [],
      });
      setRecipes((prev) => [saved, ...prev]);
    } catch (e) {
      setPdfImportError(e.message);
    } finally {
      setPdfImporting(false);
      if (pdfFileRef.current) pdfFileRef.current.value = '';
    }
  }

  async function handleImportUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    setImporting(true);
    setImportError(null);
    try {
      const { filename, recipe } = await api.fetchRecipeFromUrl(url);
      const instructions = recipe.instructions?.length
        ? `<ol>${recipe.instructions.map((s) => `<li>${s}</li>`).join('')}</ol>`
        : '';
      const saved = await api.createRecipe({
        title: recipe.title,
        type: ['recipe', 'cocktail', 'drink'].includes(recipe.type) ? recipe.type : 'recipe',
        description: recipe.description || '',
        instructions,
        notes: recipe.notes || '',
        image_path: filename || null,
        is_trial: 1,
        ingredients: (recipe.ingredients || []).filter((i) => i.name?.trim()),
        tags: [],
      });
      setRecipes((prev) => [saved, ...prev]);
      setUrlDraft('');
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="tryit">
      <div className="tryit-header">
        <h1>Try It Queue</h1>
        <p className="tryit-subtitle">
          Recipes waiting to be tested — move to My Kitchen once approved, or delete if not a keeper.
        </p>
      </div>

      <div className="tryit-import">
        <div className="tryit-import-row">
          <input
            className="tryit-import-input"
            placeholder="Paste a recipe URL to add to queue…"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleImportUrl(); }}
            disabled={importing}
          />
          <button
            className="tryit-import-btn"
            onClick={handleImportUrl}
            disabled={importing || !urlDraft.trim()}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
        {importError && <p className="tryit-import-error">Error: {importError}</p>}
        <div className="tryit-import-pdf-row">
          <label
            htmlFor="tryit-pdf-file"
            className={`tryit-pdf-btn${pdfImporting ? ' tryit-pdf-btn--loading' : ''}`}
          >
            {pdfImporting ? 'Importing PDF…' : '📄 Import PDF'}
          </label>
          <span className="tryit-pdf-hint">Upload a recipe PDF to parse and add to queue</span>
          <input
            id="tryit-pdf-file"
            type="file"
            accept=".pdf,application/pdf"
            ref={pdfFileRef}
            onChange={handleImportPdf}
            style={{ display: 'none' }}
            disabled={pdfImporting}
          />
        </div>
        {pdfImportError && <p className="tryit-import-error">Error: {pdfImportError}</p>}
      </div>

      {loading && <div className="state-msg">Loading…</div>}
      {error && <div className="state-msg error">Error: {error}</div>}

      {!loading && !error && recipes.length === 0 && (
        <div className="tryit-empty">
          <p>No recipes in the queue.</p>
          <p>Use <Link to="/suggest">✨ Suggest</Link> to generate a recipe and save it here first.</p>
        </div>
      )}

      {!loading && !error && recipes.length > 0 && (
        <div className="tryit-list">
          {recipes.map((recipe) => (
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
                    <div className="tryit-thumb-placeholder">
                      {PLACEHOLDERS[recipe.type] ?? '🍽️'}
                    </div>
                  )}
                </div>
                <div className="tryit-info">
                  <div className="tryit-meta">
                    <TypeBadge type={recipe.type} />
                    {recipe.subcategory && (
                      <span className="subcategory-badge">{recipe.subcategory}</span>
                    )}
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
                  onClick={() => handlePromote(recipe.id)}
                  disabled={promoting === recipe.id || deleting === recipe.id}
                >
                  {promoting === recipe.id ? 'Moving…' : '✓ Move to Kitchen'}
                </button>
                <button
                  className="btn-danger tryit-delete-btn"
                  onClick={() => handleDelete(recipe)}
                  disabled={promoting === recipe.id || deleting === recipe.id}
                >
                  {deleting === recipe.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

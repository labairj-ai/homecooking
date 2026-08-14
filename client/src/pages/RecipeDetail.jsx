import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import TypeBadge from '../components/TypeBadge';
import CookMode from '../components/CookMode';
import FlowTable from '../components/FlowTable';
import './RecipeDetail.css';

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const [shared, setShared] = useState(false);
  const [ingView, setIngView] = useState(() => localStorage.getItem(`ingView-${id}`) || 'list');

  function setView(v) {
    setIngView(v);
    localStorage.setItem(`ingView-${id}`, v);
  }

  async function handleToggleFavorite() {
    const { is_favorite } = await api.toggleFavorite(id);
    setRecipe((r) => ({ ...r, is_favorite }));
  }

  useEffect(() => {
    api.getRecipe(id)
      .then(setRecipe)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddToList = useCallback(async () => {
    const items = (recipe?.ingredients || [])
      .filter((i) => i.name && i.step_group?.trim().toLowerCase() !== 'bake')
      .map((i) => ({ name: i.name, amount: i.amount || null, unit: i.unit || null, recipe_id: recipe.id, recipe_title: recipe.title }));
    if (!items.length) return;
    await api.addGroceryItems(items);
    setAddedToList(true);
    setTimeout(() => setAddedToList(false), 3000);
  }, [recipe]);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: recipe.title, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2500);
  }

  async function handlePromote() {
    setPromoting(true);
    try {
      await api.promoteRecipe(id);
      navigate('/');
    } catch (e) {
      alert('Failed to move to kitchen: ' + e.message);
      setPromoting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this recipe? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.deleteRecipe(id);
      navigate(recipe?.is_trial ? '/tryit' : '/');
    } catch (e) {
      alert('Delete failed: ' + e.message);
      setDeleting(false);
    }
  }

  if (loading) return <div className="state-msg">Loading…</div>;
  if (error) return <div className="state-msg error">Error: {error}</div>;
  if (!recipe) return null;

  return (
    <div className="detail">
      {recipe.image_path && (
        <div className="detail-hero">
          <img
            src={`/uploads/${recipe.image_path}`}
            alt={recipe.title}
            style={{ objectPosition: `${recipe.focal_x ?? 50}% ${recipe.focal_y ?? 50}%` }}
          />
        </div>
      )}

      <div className="detail-content">
        <div className="detail-top">
          <div className="detail-meta">
            {recipe.is_trial ? <span className="trial-badge">🧪 Try It</span> : null}
            <TypeBadge type={recipe.type} />
            {recipe.subcategory && (
              <span className="subcategory-badge">{recipe.subcategory}</span>
            )}
            {recipe.tags?.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
          <div className="detail-actions">
            {recipe.is_trial ? (
              <button
                className="btn-promote"
                onClick={handlePromote}
                disabled={promoting || deleting}
                style={{ padding: '0.45rem 1.1rem', borderRadius: 8, border: '1.5px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {promoting ? 'Moving…' : '✓ Move to Kitchen'}
              </button>
            ) : null}
            {recipe.type === 'drink' && (
              <button
                type="button"
                className={`fav-toggle-btn ${recipe.is_favorite ? 'fav-toggle-btn--on' : ''}`}
                onClick={handleToggleFavorite}
                title={recipe.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {recipe.is_favorite ? '★' : '☆'}
              </button>
            )}
            <button
              className={`btn-share${shared ? ' btn-share--done' : ''}`}
              onClick={handleShare}
              title="Copy link to share"
            >
              {shared ? '✓ Copied!' : '↗ Share'}
            </button>
            <Link to={`/edit/${recipe.id}`} className="btn-secondary" style={{ padding: '0.45rem 1rem', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.875rem', fontWeight: 500 }}>
              Edit
            </Link>
            <button className="btn-danger" onClick={handleDelete} disabled={deleting} style={{ padding: '0.45rem 1rem', borderRadius: 8 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

        <h1 className="detail-title">{recipe.title}</h1>

        {recipe.description && (
          <p className="detail-desc">{recipe.description}</p>
        )}

        {recipe.ingredients?.length > 0 && (() => {
          const hasFlow = recipe.ingredients.some((i) => i.step_group);
          return (
            <section className="detail-section">
              <div className="section-header">
                <h2>Ingredients</h2>
                <div className="ing-section-actions">
                  {hasFlow && (
                    <div className="ing-view-toggle">
                      <button
                        className={`ing-view-btn${ingView === 'list' ? ' ing-view-btn--active' : ''}`}
                        onClick={() => setView('list')}
                      >List</button>
                      <button
                        className={`ing-view-btn${ingView === 'flow' ? ' ing-view-btn--active' : ''}`}
                        onClick={() => setView('flow')}
                      >Flow</button>
                    </div>
                  )}
                  <button
                    className={`btn-add-list${addedToList ? ' btn-add-list--done' : ''}`}
                    onClick={handleAddToList}
                  >
                    {addedToList ? '✓ Added to list' : '+ Grocery list'}
                  </button>
                </div>
              </div>
              {ingView === 'flow' && hasFlow ? (
                <FlowTable ingredients={recipe.ingredients} description={recipe.description} />
              ) : (
                <ul className="ingredients-list">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="ingredient-row">
                      <span className="ing-amount">
                        {[ing.amount, ing.unit].filter(Boolean).join(' ')}
                      </span>
                      <span className="ing-name">{ing.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })()}

        {recipe.instructions && (
          <section className="detail-section">
            <div className="section-header">
              <h2>Instructions</h2>
              <button className="btn-cook" onClick={() => setCookMode(true)}>▶ Cook Mode</button>
            </div>
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: recipe.instructions }} />
          </section>
        )}

        {recipe.notes && (
          <section className="detail-section notes-section">
            <h2>{recipe.type === 'drink' ? 'Tasting Notes' : 'Notes'}</h2>
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: recipe.notes }} />
          </section>
        )}

        <Link to={recipe.is_trial ? '/tryit' : '/'} className="back-link">
          {recipe.is_trial ? '← Back to Try It queue' : '← Back to all recipes'}
        </Link>
      </div>
      {cookMode && (
        <CookMode
          instructions={recipe.instructions}
          title={recipe.title}
          onClose={() => setCookMode(false)}
        />
      )}
    </div>
  );
}

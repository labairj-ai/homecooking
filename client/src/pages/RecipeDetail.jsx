import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import TypeBadge from '../components/TypeBadge';
import './RecipeDetail.css';

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    if (!confirm('Delete this recipe? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.deleteRecipe(id);
      navigate('/');
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
          <img src={`/uploads/${recipe.image_path}`} alt={recipe.title} />
        </div>
      )}

      <div className="detail-content">
        <div className="detail-top">
          <div className="detail-meta">
            <TypeBadge type={recipe.type} />
            {recipe.subcategory && (
              <span className="subcategory-badge">{recipe.subcategory}</span>
            )}
            {recipe.tags?.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
          <div className="detail-actions">
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

        {recipe.ingredients?.length > 0 && (
          <section className="detail-section">
            <h2>Ingredients</h2>
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
          </section>
        )}

        {recipe.instructions && (
          <section className="detail-section">
            <h2>Instructions</h2>
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: recipe.instructions }} />
          </section>
        )}

        {recipe.notes && (
          <section className="detail-section notes-section">
            <h2>{recipe.type === 'drink' ? 'Tasting Notes' : 'Notes'}</h2>
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: recipe.notes }} />
          </section>
        )}

        <Link to="/" className="back-link">← Back to all recipes</Link>
      </div>
    </div>
  );
}

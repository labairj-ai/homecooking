import { Link } from 'react-router-dom';
import TypeBadge from './TypeBadge';
import './RecipeCard.css';

const PLACEHOLDERS = { cocktail: '🍸', drink: '🥂', recipe: '🍽️' };

export default function RecipeCard({ recipe, onToggleFavorite }) {
  const previewIngredients = recipe.ingredients.slice(0, 3);
  const more = recipe.ingredients.length - previewIngredients.length;
  const isDrink = recipe.type === 'drink';

  function handleFavClick(e) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.(recipe.id);
  }

  return (
    <Link to={`/recipe/${recipe.id}`} className="recipe-card">
      <div className="card-image">
        {recipe.image_path ? (
          <img src={`/uploads/${recipe.image_path}`} alt={recipe.title} />
        ) : (
          <div className="card-image-placeholder">
            {PLACEHOLDERS[recipe.type] ?? '🍽️'}
          </div>
        )}
        {isDrink && (
          <button
            type="button"
            className={`fav-btn ${recipe.is_favorite ? 'fav-btn--on' : ''}`}
            onClick={handleFavClick}
            title={recipe.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {recipe.is_favorite ? '★' : '☆'}
          </button>
        )}
      </div>
      <div className="card-body">
        <div className="card-header">
          <TypeBadge type={recipe.type} />
          {recipe.subcategory && (
            <span className="subcategory-badge">{recipe.subcategory}</span>
          )}
        </div>
        <h3 className="card-title">{recipe.title}</h3>
        {recipe.description && (
          <p className="card-desc">{recipe.description}</p>
        )}
        {previewIngredients.length > 0 && (
          <div className="card-ingredients">
            {previewIngredients.map((ing, i) => (
              <span key={i} className="ingredient-chip">{ing.name}</span>
            ))}
            {more > 0 && <span className="ingredient-chip muted">+{more} more</span>}
          </div>
        )}
        {recipe.tags?.length > 0 && (
          <div className="card-tags">
            {recipe.tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

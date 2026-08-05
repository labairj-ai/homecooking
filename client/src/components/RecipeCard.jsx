import { Link } from 'react-router-dom';
import TypeBadge from './TypeBadge';
import './RecipeCard.css';

export default function RecipeCard({ recipe }) {
  const previewIngredients = recipe.ingredients.slice(0, 3);
  const more = recipe.ingredients.length - previewIngredients.length;

  return (
    <Link to={`/recipe/${recipe.id}`} className="recipe-card">
      <div className="card-image">
        {recipe.image_path ? (
          <img src={`/uploads/${recipe.image_path}`} alt={recipe.title} />
        ) : (
          <div className="card-image-placeholder">
            {recipe.type === 'cocktail' ? '🍸' : '🍽️'}
          </div>
        )}
      </div>
      <div className="card-body">
        <div className="card-header">
          <TypeBadge type={recipe.type} />
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

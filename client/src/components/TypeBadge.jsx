import './TypeBadge.css';

export default function TypeBadge({ type }) {
  return (
    <span className={`type-badge type-badge--${type}`}>
      {type === 'cocktail' ? '🍸 Cocktail' : '🍽️ Recipe'}
    </span>
  );
}

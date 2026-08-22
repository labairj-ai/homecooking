import './TypeBadge.css';

export default function TypeBadge({ type }) {
  const label = type === 'cocktail' ? '🍸 Cocktail' : type === 'drink' ? '🥂 Bottle' : '🍽️ Recipe';
  return (
    <span className={`type-badge type-badge--${type}`}>{label}</span>
  );
}

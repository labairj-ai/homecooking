import { Link } from 'react-router-dom';
import './Nav.css';

export default function Nav() {
  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">
        <span className="nav-logo">🍳</span>
        <span>Home Cooking</span>
      </Link>
      <Link to="/add" className="btn-primary" style={{ padding: '0.5rem 1.1rem', borderRadius: 8 }}>
        + Add Recipe
      </Link>
    </nav>
  );
}

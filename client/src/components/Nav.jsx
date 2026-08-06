import { Link, useLocation } from 'react-router-dom';
import './Nav.css';

export default function Nav() {
  const { pathname } = useLocation();
  const inCellar = pathname.startsWith('/cellar');

  return (
    <>
      <nav className="nav">
        <Link to="/" className="nav-brand">
          <span className="nav-logo">🍳</span>
          <span>Home Cooking</span>
        </Link>
        <div className="nav-links">
          <Link to="/" className={`nav-link ${!inCellar ? 'active' : ''}`}>My Kitchen</Link>
          <Link to="/cellar" className={`nav-link ${inCellar ? 'active' : ''}`}>My Cellar</Link>
        </div>
        <Link
          to={inCellar ? '/cellar/add' : '/add'}
          className="btn-primary nav-add-btn"
          style={{ padding: '0.5rem 1.1rem', borderRadius: 8 }}
        >
          {inCellar ? '+ Add to Cellar' : '+ Add Recipe'}
        </Link>
      </nav>

      <nav className="nav-mobile-bottom" aria-label="Main navigation">
        <Link to="/" className={`nav-mobile-tab ${!inCellar ? 'active' : ''}`}>
          <span className="nav-mobile-icon">🍳</span>
          <span className="nav-mobile-label">Kitchen</span>
        </Link>
        <Link to="/cellar" className={`nav-mobile-tab ${inCellar ? 'active' : ''}`}>
          <span className="nav-mobile-icon">🍷</span>
          <span className="nav-mobile-label">Cellar</span>
        </Link>
        <Link to={inCellar ? '/cellar/add' : '/add'} className="nav-mobile-tab">
          <span className="nav-mobile-icon">＋</span>
          <span className="nav-mobile-label">{inCellar ? 'Add Drink' : 'Add Recipe'}</span>
        </Link>
      </nav>
    </>
  );
}

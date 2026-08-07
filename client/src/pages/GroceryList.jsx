import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import './GroceryList.css';

export default function GroceryList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() =>
    api.listGrocery().then(setItems).finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setAdding(true);
    try {
      const added = await api.addGroceryItems([{ name }]);
      setItems((prev) => [...added, ...prev]);
      setDraft('');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id) {
    const updated = await api.toggleGroceryItem(id);
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }

  async function handleDelete(id) {
    await api.deleteGroceryItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleClearChecked() {
    await api.clearGrocery(false);
    setItems((prev) => prev.filter((i) => !i.checked));
  }

  async function handleClearAll() {
    await api.clearGrocery(true);
    setItems([]);
  }

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  // Group unchecked by recipe (null recipe_title = manual)
  const manual = unchecked.filter((i) => !i.recipe_title);
  const byRecipe = {};
  unchecked.filter((i) => i.recipe_title).forEach((i) => {
    (byRecipe[i.recipe_title] = byRecipe[i.recipe_title] || []).push(i);
  });

  if (loading) return <div className="state-msg">Loading…</div>;

  return (
    <div className="grocery-page">
      <div className="grocery-header">
        <div>
          <h1>Grocery List</h1>
          {items.length > 0 && (
            <p className="grocery-subtitle">
              {unchecked.length} item{unchecked.length !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>
        <div className="grocery-header-actions">
          {checked.length > 0 && (
            <button className="btn-secondary grocery-clear-btn" onClick={handleClearChecked}>
              Clear checked
            </button>
          )}
          {items.length > 0 && (
            <button className="btn-secondary grocery-clear-btn" onClick={handleClearAll}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <form className="grocery-add-form" onSubmit={handleAdd}>
        <input
          className="grocery-add-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add item…"
          disabled={adding}
        />
        <button type="submit" className="btn-primary" disabled={adding || !draft.trim()}>
          Add
        </button>
      </form>

      {items.length === 0 && (
        <div className="grocery-empty">
          <p>Your list is empty.</p>
          <p className="grocery-empty-hint">Add items above, or use "Add to grocery list" on any recipe.</p>
        </div>
      )}

      {manual.length > 0 && (
        <section className="grocery-group">
          <GroceryItems items={manual} onToggle={handleToggle} onDelete={handleDelete} />
        </section>
      )}

      {Object.entries(byRecipe).map(([title, groupItems]) => (
        <section key={title} className="grocery-group">
          <div className="grocery-group-header">{title}</div>
          <GroceryItems items={groupItems} onToggle={handleToggle} onDelete={handleDelete} />
        </section>
      ))}

      {checked.length > 0 && (
        <section className="grocery-group grocery-group--checked">
          <div className="grocery-group-header grocery-group-header--checked">Checked off</div>
          <GroceryItems items={checked} onToggle={handleToggle} onDelete={handleDelete} checked />
        </section>
      )}
    </div>
  );
}

function GroceryItems({ items, onToggle, onDelete, checked = false }) {
  return (
    <ul className="grocery-list">
      {items.map((item) => (
        <li key={item.id} className={`grocery-item${checked ? ' grocery-item--checked' : ''}`}>
          <button
            className={`grocery-check${item.checked ? ' grocery-check--done' : ''}`}
            onClick={() => onToggle(item.id)}
            aria-label={item.checked ? 'Uncheck' : 'Check'}
          >
            {item.checked ? '✓' : ''}
          </button>
          <span className="grocery-name">
            {[item.amount, item.unit].filter(Boolean).join(' ')}
            {(item.amount || item.unit) ? ' ' : ''}
            {item.name}
          </span>
          <button
            className="grocery-delete"
            onClick={() => onDelete(item.id)}
            aria-label="Remove"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

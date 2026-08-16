import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import './GroceryList.css';

const UNDO_DELAY = 5000;

export default function GroceryList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // { item } — for toast UI
  const pendingDeleteRef = useRef(null);
  const undoTimerRef = useRef(null);

  const load = useCallback(() =>
    api.listGrocery().then(setItems).finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (pendingDeleteRef.current) api.deleteGroceryItem(pendingDeleteRef.current.item.id);
    };
  }, []);

  async function flushPending() {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    await api.deleteGroceryItem(pending.item.id);
  }

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
    await flushPending();
    const item = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    const entry = { item };
    pendingDeleteRef.current = entry;
    setPendingDelete(entry);
    undoTimerRef.current = setTimeout(async () => {
      await api.deleteGroceryItem(id);
      pendingDeleteRef.current = null;
      setPendingDelete(null);
      undoTimerRef.current = null;
    }, UNDO_DELAY);
  }

  async function handleUndo() {
    if (!pendingDeleteRef.current) return;
    clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    const data = await api.listGrocery();
    setItems(data);
  }

  async function handleClearChecked() {
    await flushPending();
    await api.clearGrocery(false);
    setItems((prev) => prev.filter((i) => !i.checked));
  }

  async function handleClearAll() {
    await flushPending();
    await api.clearGrocery(true);
    setItems([]);
  }

  async function handleAddFromRecipe(recipe) {
    const newItems = await api.addGroceryItems(
      recipe.ingredients
        .filter((i) => i.name)
        .map((i) => ({ name: i.name, amount: i.amount || null, unit: i.unit || null, recipe_id: recipe.id, recipe_title: recipe.title }))
    );
    setItems((prev) => [...prev, ...newItems]);
  }

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
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
        </div>
      </div>

      <div className="grocery-toolbar">
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
        <button className="btn-from-recipe" onClick={() => setPickerOpen(true)}>
          + From recipe
        </button>
        {items.length > 0 && (
          <button className="btn-clear-list" onClick={handleClearAll}>
            Clear
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="grocery-empty">
          <p>Your list is empty.</p>
          <p className="grocery-empty-hint">Type an item above or click "+ From recipe" to pull in ingredients.</p>
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

      {pickerOpen && (
        <RecipePicker
          onAdd={handleAddFromRecipe}
          onClose={() => setPickerOpen(false)}
          addedTitles={Object.keys(byRecipe)}
        />
      )}

      {pendingDelete && (
        <div className="undo-toast" key={pendingDelete.item.id}>
          <span className="undo-toast-msg">
            {pendingDelete.item.name} removed
          </span>
          <button className="undo-btn" onClick={handleUndo}>Undo</button>
          <div className="undo-toast-progress" />
        </div>
      )}
    </div>
  );
}

function RecipePicker({ onAdd, onClose, addedTitles }) {
  const [recipes, setRecipes] = useState([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(new Set(addedTitles));
  const inputRef = useRef();

  useEffect(() => {
    api.listRecipes().then((all) => setRecipes(all.filter((r) => r.type !== 'drink' && r.ingredients?.length)));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = recipes.filter((r) =>
    !query || r.title.toLowerCase().includes(query.toLowerCase())
  );

  async function handlePick(recipe) {
    if (adding) return;
    setAdding(recipe.id);
    try {
      await onAdd(recipe);
      setAdded((prev) => new Set([...prev, recipe.title]));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="picker-top">
          <h2>Add from recipe</h2>
          <button className="picker-close" onClick={onClose}>×</button>
        </div>
        <input
          ref={inputRef}
          className="picker-search"
          placeholder="Search recipes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="picker-list">
          {filtered.length === 0 && (
            <li className="picker-empty">No recipes with ingredients found.</li>
          )}
          {filtered.map((r) => {
            const isAdded = added.has(r.title);
            const isAdding = adding === r.id;
            return (
              <li key={r.id}>
                <button
                  className={`picker-item${isAdded ? ' picker-item--added' : ''}`}
                  onClick={() => handlePick(r)}
                  disabled={isAdding}
                >
                  <span className="picker-item-title">{r.title}</span>
                  <span className="picker-item-count">
                    {isAdding ? '…' : isAdded ? '✓ Added' : `${r.ingredients.length} items`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
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

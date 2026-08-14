import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './SuggestRecipe.css';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function stepsToHtml(steps) {
  const items = steps.map((s) => `<li><p>${s}</p></li>`).join('');
  return `<ol>${items}</ol>`;
}

export default function SuggestRecipe() {
  const navigate = useNavigate();
  const [ingredients, setIngredients] = useState([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [progress, setProgress] = useState('');
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(false);

  function addIngredient(e) {
    e.preventDefault();
    const t = draft.trim();
    if (t && !ingredients.includes(t)) setIngredients((prev) => [...prev, t]);
    setDraft('');
  }

  function removeIngredient(t) {
    setIngredients((prev) => prev.filter((x) => x !== t));
  }

  function handleKey(e) {
    if (e.key === 'Enter') addIngredient(e);
    if (e.key === 'Backspace' && draft === '' && ingredients.length > 0)
      setIngredients((prev) => prev.slice(0, -1));
  }

  async function suggest(type) {
    if (ingredients.length === 0) return;
    abortRef.current = false;
    setState('loading');
    setError(null);
    setRecipe(null);
    setProgress('Starting…');

    try {
      // 3 retries on initial POST — mirrors investment dashboard pattern
      let jobData;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            setProgress(`Network error — retrying (${attempt}/2)…`);
            await sleep(1500 * attempt);
          }
          jobData = await api.suggestRecipe(ingredients, type);
          break;
        } catch (_) {
          if (attempt === 2) throw new Error('Server unreachable after 3 attempts');
        }
      }

      if (!jobData.ok) throw new Error(jobData.error || 'Failed to start generation');

      // Poll until done; on poll failure keep retrying (don't abort)
      while (!abortRef.current) {
        await sleep(1200);
        let dp;
        try {
          dp = await api.getSuggestJob(jobData.job_id);
        } catch (_) {
          setProgress((prev) => prev + '\n[reconnecting…]');
          continue;
        }
        if (dp.status === 'error') throw new Error(dp.error || 'AI generation failed');
        if (dp.progress) setProgress(dp.progress);
        if (dp.status === 'done') {
          setRecipe(dp.result);
          setState('done');
          return;
        }
      }
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }

  async function save() {
    if (!recipe) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.createRecipe({
        title: recipe.title || 'Untitled',
        type: recipe.type === 'cocktail' ? 'cocktail' : 'recipe',
        subcategory: recipe.subcategory || '',
        description: recipe.description || '',
        instructions: Array.isArray(recipe.instructions)
          ? stepsToHtml(recipe.instructions)
          : recipe.instructions || '',
        notes: recipe.notes || '',
        ingredients: (recipe.ingredients || []).map((ing, i) => ({
          name: ing.name || '',
          amount: ing.amount || '',
          unit: ing.unit || '',
          step_group: '',
          order_idx: i,
        })),
        tags: [],
      });
      navigate(`/recipe/${saved.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  function reset() {
    abortRef.current = true;
    setState('idle');
    setRecipe(null);
    setError(null);
    setProgress('');
  }

  return (
    <div className="suggest">
      <div className="suggest-header">
        <h1>What Can I Make?</h1>
        <p className="suggest-subtitle">
          Enter ingredients you have on hand and phi4 will craft a recipe or cocktail
        </p>
      </div>

      <div className="suggest-input-section">
        <div className="search-bar">
          <div className="search-input-wrap">
            {ingredients.map((t) => (
              <span key={t} className="search-chip">
                {t}
                <button
                  type="button"
                  className="search-chip-remove"
                  onClick={() => removeIngredient(t)}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                ingredients.length
                  ? 'Add another ingredient…'
                  : 'Type an ingredient and press Enter…'
              }
              disabled={state === 'loading'}
              style={{
                border: 'none',
                outline: 'none',
                flex: 1,
                minWidth: 180,
                padding: '0.4rem 0.2rem',
                background: 'transparent',
              }}
            />
          </div>
          {ingredients.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIngredients([])}
              disabled={state === 'loading'}
            >
              Clear
            </button>
          )}
        </div>

        <div className="suggest-buttons">
          <button
            className="suggest-btn suggest-btn--food"
            disabled={ingredients.length === 0 || state === 'loading'}
            onClick={() => suggest('recipe')}
          >
            🍽️ Suggest Food Recipe
          </button>
          <button
            className="suggest-btn suggest-btn--cocktail"
            disabled={ingredients.length === 0 || state === 'loading'}
            onClick={() => suggest('cocktail')}
          >
            🍹 Suggest Cocktail
          </button>
        </div>
      </div>

      {state === 'loading' && (
        <div className="suggest-loading">
          <div className="suggest-spinner" />
          <p className="suggest-progress-text">{progress}</p>
          <p className="suggest-model-note">phi4:14b · running locally · 30–90 sec</p>
        </div>
      )}

      {state === 'error' && (
        <div className="suggest-error-box">
          <p>⚠ {error}</p>
          <button className="btn-secondary" onClick={reset}>Try Again</button>
        </div>
      )}

      {state === 'done' && recipe && (
        <div className="suggest-result">
          <div className="suggest-result-header">
            <h2 className="suggest-result-title">{recipe.title}</h2>
            {recipe.description && (
              <p className="suggest-result-desc">{recipe.description}</p>
            )}
            <div className="suggest-result-meta">
              {recipe.servings && <span>Serves {recipe.servings}</span>}
              {recipe.prep_time && <span>Prep {recipe.prep_time}</span>}
              {recipe.cook_time && <span>Cook {recipe.cook_time}</span>}
            </div>
          </div>

          {recipe.ingredients?.length > 0 && (
            <div className="suggest-section">
              <h3>Ingredients</h3>
              <ul className="suggest-ing-list">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>
                    {[ing.amount, ing.unit, ing.name].filter(Boolean).join(' ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.instructions?.length > 0 && (
            <div className="suggest-section">
              <h3>Instructions</h3>
              <ol className="suggest-steps">
                {recipe.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {recipe.notes && (
            <div className="suggest-section">
              <h3>Notes</h3>
              <p className="suggest-notes">{recipe.notes}</p>
            </div>
          )}

          <div className="suggest-result-actions">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : '✓ Save to My Kitchen'}
            </button>
            <button className="btn-secondary" onClick={reset}>
              🔄 Try Another
            </button>
          </div>

          {error && <p className="suggest-inline-error">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}

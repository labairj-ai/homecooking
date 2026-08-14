import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './SuggestRecipe.css';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function stepsToHtml(steps) {
  return `<ol>${steps.map((s) => `<li><p>${s}</p></li>`).join('')}</ol>`;
}

export default function SuggestRecipe() {
  const navigate = useNavigate();
  const [ingredients, setIngredients] = useState([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState('idle'); // idle | streaming | done | error
  const [streamText, setStreamText] = useState('');
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const abortCtrlRef = useRef(null);
  const streamEndRef = useRef(null);

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

    // Cancel any in-flight stream before starting a new one
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setState('streaming');
    setStreamText('');
    setError(null);
    setRecipe(null);

    try {
      // 3 retries on initial POST
      let jobData;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            setStreamText(`Network error — retrying (${attempt}/2)…`);
            await sleep(1500 * attempt);
          }
          jobData = await api.suggestRecipe(ingredients, type);
          break;
        } catch (_) {
          if (attempt === 2) throw new Error('Server unreachable after 3 attempts');
        }
      }

      if (!jobData.ok) throw new Error(jobData.error || 'Failed to start generation');

      // Open SSE stream — tokens arrive in real time as phi4 generates them
      const response = await fetch(`/api/suggest-recipe/stream/${jobData.job_id}`, {
        signal: ctrl.signal,
      });
      if (!response.ok) throw new Error(`Stream error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          const data = JSON.parse(dataStr);

          if (data.token) {
            fullText += data.token;
            setStreamText(fullText);
            // Auto-scroll to bottom as tokens arrive
            streamEndRef.current?.scrollIntoView({ block: 'nearest' });
          }
          if (data.error) throw new Error(data.error);
          if (data.done) {
            setRecipe(data.recipe);
            setState('done');
            return;
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // user clicked Stop — stay idle
      setError(err.message);
      setState('error');
    }
  }

  function handleStop() {
    abortCtrlRef.current?.abort();
    setState('idle');
    setStreamText('');
    setError(null);
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
    abortCtrlRef.current?.abort();
    setState('idle');
    setRecipe(null);
    setStreamText('');
    setError(null);
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
              disabled={state === 'streaming'}
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
              disabled={state === 'streaming'}
            >
              Clear
            </button>
          )}
        </div>

        <div className="suggest-buttons">
          <button
            className="suggest-btn suggest-btn--food"
            disabled={ingredients.length === 0 || state === 'streaming'}
            onClick={() => suggest('recipe')}
          >
            🍽️ Suggest Food Recipe
          </button>
          <button
            className="suggest-btn suggest-btn--cocktail"
            disabled={ingredients.length === 0 || state === 'streaming'}
            onClick={() => suggest('cocktail')}
          >
            🍹 Suggest Cocktail
          </button>
        </div>
      </div>

      {state === 'streaming' && (
        <div className="suggest-stream-box">
          <div className="suggest-stream-header">
            <div className="suggest-spinner" />
            <span className="suggest-stream-label">phi4 is crafting your recipe…</span>
            <button className="suggest-stop-btn" onClick={handleStop}>
              ✕ Stop &amp; Try Another
            </button>
          </div>
          {streamText && (
            <pre className="suggest-stream-text">
              {streamText}
              <span className="suggest-cursor" />
            </pre>
          )}
          <p className="suggest-model-note">phi4:14b · running locally on CPU · 1–5 min</p>
          <div ref={streamEndRef} />
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

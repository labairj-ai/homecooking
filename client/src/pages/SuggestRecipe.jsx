import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './SuggestRecipe.css';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function stepsToHtml(steps) {
  return `<ol>${steps.map((s) => `<li><p>${s}</p></li>`).join('')}</ol>`;
}

const COOK_TIMES = [
  { label: 'Any time', value: '' },
  { label: '< 30 min', value: '< 30 min' },
  { label: '30–60 min', value: '30–60 min' },
  { label: '1+ hour', value: '1+ hour' },
];

const MODELS = [
  { label: '⚡ Fast', sub: 'qwen2.5:7b', value: 'qwen2.5:7b' },
  { label: '✦ Best', sub: 'phi4:14b', value: 'phi4:14b' },
];

export default function SuggestRecipe() {
  const navigate = useNavigate();

  // Ingredient input
  const [ingredients, setIngredients] = useState([]);
  const [draft, setDraft] = useState('');

  // Options
  const [cookTime, setCookTime] = useState('');
  const [model, setModel] = useState('phi4:14b');

  // State machine: idle | concepts-loading | concepts | streaming | done | error
  const [state, setState] = useState('idle');
  const [concepts, setConcepts] = useState(null);
  const [streamText, setStreamText] = useState('');
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const abortCtrlRef = useRef(null);
  const currentTypeRef = useRef(null);
  const streamEndRef = useRef(null);

  // --- Ingredient input ---
  function addIngredient(e) {
    e.preventDefault();
    const t = draft.trim();
    if (t && !ingredients.includes(t)) setIngredients((prev) => [...prev, t]);
    setDraft('');
  }
  function removeIngredient(t) { setIngredients((prev) => prev.filter((x) => x !== t)); }
  function handleKey(e) {
    if (e.key === 'Enter') addIngredient(e);
    if (e.key === 'Backspace' && draft === '' && ingredients.length > 0)
      setIngredients((prev) => prev.slice(0, -1));
  }

  // --- Concept generation ---
  async function getConceptSuggestions(type) {
    abortCtrlRef.current?.abort();
    currentTypeRef.current = type;
    setState('concepts-loading');
    setError(null);
    setConcepts(null);

    try {
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await sleep(1500 * attempt);
          result = await api.suggestConcepts(ingredients, type, model, cookTime);
          break;
        } catch (_) {
          if (attempt === 2) throw new Error('Server unreachable after 3 attempts');
        }
      }
      if (!result.concepts?.length) throw new Error('No concepts returned');
      setConcepts(result.concepts);
      setState('concepts');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }

  // --- Full recipe generation ---
  async function suggest(type, concept = null) {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;
    currentTypeRef.current = type;

    setState('streaming');
    setStreamText('');
    setError(null);
    setRecipe(null);

    try {
      let jobData;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            setStreamText(`Network error — retrying (${attempt}/2)…`);
            await sleep(1500 * attempt);
          }
          jobData = await api.suggestRecipe(ingredients, type, model, cookTime, concept);
          break;
        } catch (_) {
          if (attempt === 2) throw new Error('Server unreachable after 3 attempts');
        }
      }

      if (!jobData.ok) throw new Error(jobData.error || 'Failed to start generation');

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
        sseBuffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          const data = JSON.parse(dataStr);
          if (data.token) {
            fullText += data.token;
            setStreamText(fullText);
            streamEndRef.current?.scrollIntoView({ block: 'nearest' });
          }
          if (data.error) throw new Error(data.error);
          if (data.done) { setRecipe(data.recipe); setState('done'); return; }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setState('error');
    }
  }

  function selectConcept(concept) {
    suggest(currentTypeRef.current, concept);
  }

  // "Try Another" during streaming → back to same concept cards
  function handleStop() {
    abortCtrlRef.current?.abort();
    setState('concepts');
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
    setConcepts(null);
    setError(null);
  }

  const busy = state === 'concepts-loading' || state === 'streaming';
  const typeLabel = currentTypeRef.current === 'cocktail' ? 'cocktail' : 'food recipe';

  return (
    <div className="suggest">
      <div className="suggest-header">
        <h1>What Can I Make?</h1>
        <p className="suggest-subtitle">
          Enter ingredients you have on hand and get recipe ideas
        </p>
      </div>

      {/* Options: model + cook time — always visible */}
      <div className="suggest-options">
        <div className="suggest-option-row">
          <span className="suggest-option-label">Model</span>
          <div className="model-toggle">
            {MODELS.map((m) => (
              <button
                key={m.value}
                className={`model-toggle-btn${model === m.value ? ' active' : ''}`}
                onClick={() => setModel(m.value)}
                disabled={busy}
              >
                {m.label} <span className="model-toggle-sub">{m.sub}</span>
              </button>
            ))}
          </div>
          <span className="model-toggle-note">
            {model === 'qwen2.5:7b' ? '~30 sec' : '1–5 min'}
          </span>
        </div>

        <div className="suggest-option-row">
          <span className="suggest-option-label">Cook time</span>
          <div className="cooktime-tabs">
            {COOK_TIMES.map((ct) => (
              <button
                key={ct.value}
                className={`filter-tab${cookTime === ct.value ? ' active' : ''}`}
                onClick={() => setCookTime(ct.value)}
                disabled={busy}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ingredient input */}
      <div className="suggest-input-section">
        <div className="search-bar">
          <div className="search-input-wrap">
            {ingredients.map((t) => (
              <span key={t} className="search-chip">
                {t}
                <button type="button" className="search-chip-remove" onClick={() => removeIngredient(t)}>×</button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder={ingredients.length ? 'Add another ingredient…' : 'Type an ingredient and press Enter…'}
              disabled={busy}
              style={{ border: 'none', outline: 'none', flex: 1, minWidth: 180, padding: '0.4rem 0.2rem', background: 'transparent' }}
            />
          </div>
          {ingredients.length > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setIngredients([])} disabled={busy}>
              Clear
            </button>
          )}
        </div>

        {/* Main action buttons — show in idle and concepts states */}
        {(state === 'idle' || state === 'concepts') && (
          <div className="suggest-buttons">
            <button
              className="suggest-btn suggest-btn--food"
              disabled={ingredients.length === 0}
              onClick={() => getConceptSuggestions('recipe')}
            >
              🍽️ Suggest Food Recipe
            </button>
            <button
              className="suggest-btn suggest-btn--cocktail"
              disabled={ingredients.length === 0}
              onClick={() => getConceptSuggestions('cocktail')}
            >
              🍹 Suggest Cocktail
            </button>
          </div>
        )}
      </div>

      {/* Concepts loading */}
      {state === 'concepts-loading' && (
        <div className="suggest-stream-box">
          <div className="suggest-stream-header">
            <div className="suggest-spinner" />
            <span className="suggest-stream-label">
              Finding {typeLabel} ideas with {model}…
            </span>
          </div>
          <p className="suggest-model-note">Generating 3 concepts to choose from</p>
        </div>
      )}

      {/* Concept cards */}
      {state === 'concepts' && concepts && (
        <div className="suggest-concepts">
          <div className="concepts-header">
            <span className="concepts-title">
              3 {typeLabel} ideas — pick one to generate
            </span>
            <button className="btn-secondary" onClick={() => getConceptSuggestions(currentTypeRef.current)}>
              🔄 New concepts
            </button>
          </div>
          <div className="concept-cards">
            {concepts.map((c, i) => (
              <button key={i} className="concept-card" onClick={() => selectConcept(c)}>
                <div className="concept-card-title">{c.title}</div>
                <div className="concept-card-tagline">{c.tagline}</div>
                <div className="concept-card-arrow">Generate full recipe →</div>
              </button>
            ))}
          </div>
          <button className="btn-link" onClick={reset}>← Start over</button>
        </div>
      )}

      {/* Streaming */}
      {state === 'streaming' && (
        <div className="suggest-stream-box">
          <div className="suggest-stream-header">
            <div className="suggest-spinner" />
            <span className="suggest-stream-label">phi4 is crafting your recipe…</span>
            <button className="suggest-stop-btn" onClick={handleStop}>
              🔄 Try Another
            </button>
          </div>
          {streamText && (
            <pre className="suggest-stream-text">
              {streamText}
              <span className="suggest-cursor" />
            </pre>
          )}
          <p className="suggest-model-note">{model} · running locally on CPU · {model === 'qwen2.5:7b' ? '~30 sec' : '1–5 min'}</p>
          <div ref={streamEndRef} />
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="suggest-error-box">
          <p>⚠ {error}</p>
          <button className="btn-secondary" onClick={reset}>Try Again</button>
        </div>
      )}

      {/* Done — formatted recipe */}
      {state === 'done' && recipe && (
        <div className="suggest-result">
          <div className="suggest-result-header">
            <h2 className="suggest-result-title">{recipe.title}</h2>
            {recipe.description && <p className="suggest-result-desc">{recipe.description}</p>}
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
                  <li key={i}>{[ing.amount, ing.unit, ing.name].filter(Boolean).join(' ')}</li>
                ))}
              </ul>
            </div>
          )}

          {recipe.instructions?.length > 0 && (
            <div className="suggest-section">
              <h3>Instructions</h3>
              <ol className="suggest-steps">
                {recipe.instructions.map((step, i) => <li key={i}>{step}</li>)}
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
            <button className="btn-secondary" onClick={() => setState('concepts')}>
              ← Back to concepts
            </button>
            <button className="btn-link" onClick={reset}>Start over</button>
          </div>
          {error && <p className="suggest-inline-error">⚠ {error}</p>}
        </div>
      )}
    </div>
  );
}

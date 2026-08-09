import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../api';
import RichEditor from '../components/RichEditor';
import './AddEdit.css';

const EMPTY_ING = () => ({ name: '', amount: '', unit: '', step_group: '' });

const UNITS = [
  '', 'tsp', 'tbsp', 'cup', 'oz', 'fl oz', 'lb', 'g', 'kg', 'ml', 'L',
  'pinch', 'dash', 'splash', 'to taste',
  'whole', 'slice', 'clove', 'can', 'bunch', 'sprig', 'piece',
  'sec', 'min', 'hr',
];

export default function AddEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isEdit = Boolean(id);
  const isCellar = pathname.startsWith('/cellar');
  const defaultType = isCellar ? 'drink' : 'recipe';

  const [form, setForm] = useState({
    title: '',
    type: defaultType,
    subcategory: '',
    description: '',
    instructions: '',
    notes: '',
    image_path: null,
    is_favorite: false,
    focal_x: 50,
    focal_y: 50,
  });
  const [ingredients, setIngredients] = useState([EMPTY_ING()]);
  const [showSteps, setShowSteps] = useState(false);
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [urlDraft, setUrlDraft] = useState('');
  const fileRef = useRef();
  const pdfFileRef = useRef();

  useEffect(() => {
    if (!isEdit) return;
    api.getRecipe(id).then((recipe) => {
      setForm({
        title: recipe.title,
        type: recipe.type,
        subcategory: recipe.subcategory || '',
        description: recipe.description || '',
        instructions: recipe.instructions || '',
        notes: recipe.notes || '',
        image_path: recipe.image_path || null,
        is_favorite: Boolean(recipe.is_favorite),
        focal_x: recipe.focal_x ?? 50,
        focal_y: recipe.focal_y ?? 50,
      });
      const ings = recipe.ingredients.length ? recipe.ingredients : [EMPTY_ING()];
      setIngredients(ings);
      if (ings.some((i) => i.step_group)) setShowSteps(true);
      setTags(recipe.tags || []);
      if (recipe.image_path) setImagePreview(`/uploads/${recipe.image_path}`);
    });
  }, [id, isEdit]);

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function setIng(idx, key, val) {
    setIngredients((prev) => prev.map((ing, i) => (i === idx ? { ...ing, [key]: val } : ing)));
  }

  function addIng() { setIngredients((prev) => [...prev, EMPTY_ING()]); }

  function removeIng(idx) {
    setIngredients((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  function addTag(e) {
    if (e) e.preventDefault();
    const t = tagDraft.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagDraft('');
  }

  function handleTagKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { filename } = await api.uploadImage(file);
      setField('image_path', filename);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    setField('image_path', null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFocalClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setField('focal_x', Math.min(100, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 100))));
    setField('focal_y', Math.min(100, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 100))));
  }

  function applyParsedRecipe({ filename, recipe }) {
    setForm((f) => ({
      ...f,
      title: recipe.title || f.title,
      type: ['recipe', 'cocktail', 'drink'].includes(recipe.type) ? recipe.type : f.type,
      description: recipe.description || f.description,
      instructions: recipe.instructions?.length
        ? `<ol>${recipe.instructions.map((s) => `<li>${s}</li>`).join('')}</ol>`
        : f.instructions,
      notes: recipe.notes || f.notes,
      image_path: filename || f.image_path,
    }));
    if (recipe.ingredients?.length) {
      const valid = recipe.ingredients.filter((i) => i.name?.trim());
      if (valid.length) setIngredients(valid.map((i) => ({ name: i.name, amount: i.amount || '', unit: i.unit || '', step_group: i.step_group || '' })));
    }
    if (filename) setImagePreview(`/uploads/${filename}`);
  }

  async function handleFetchUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    setFetching(true);
    setParseError(null);
    try {
      const result = await api.fetchRecipeFromUrl(url);
      applyParsedRecipe(result);
      setUrlDraft('');
    } catch (err) {
      setParseError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function handleParsePdf(e) {
    const file = e.target.files[0];
    if (!file) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await api.parseRecipe(file);
      applyParsedRecipe(result);
    } catch (err) {
      setParseError(err.message);
    } finally {
      setParsing(false);
      if (pdfFileRef.current) pdfFileRef.current.value = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError('Title is required.');
    const validIngs = ingredients.filter((ing) => ing.name.trim());
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, ingredients: validIngs, tags };
      const saved = isEdit
        ? await api.updateRecipe(id, payload)
        : await api.createRecipe(payload);
      navigate(`/recipe/${saved.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="addedit">
      <div className="addedit-header">
        <Link to={isEdit ? `/recipe/${id}` : (isCellar ? '/cellar' : '/')} className="back-link">← Back</Link>
        <h1>{isEdit ? 'Edit' : (isCellar ? 'Add to Cellar' : 'Add New Recipe')}</h1>
      </div>

      <form onSubmit={handleSubmit} className="addedit-form">
        {!isEdit && (
          <div className="parse-banner">
            <div className="parse-url-row">
              <input
                className="parse-url-input"
                placeholder="Paste a recipe URL to import…"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFetchUrl(); } }}
                disabled={fetching || parsing}
              />
              <button
                type="button"
                className={`btn-parse${fetching ? ' btn-parse--loading' : ''}`}
                onClick={handleFetchUrl}
                disabled={fetching || parsing || !urlDraft.trim()}
              >
                {fetching ? '⏳' : 'Import'}
              </button>
            </div>
            <div className="parse-or">
              <label htmlFor="parse-file" className={`btn-parse-secondary${parsing ? ' btn-parse--loading' : ''}`}>
                {parsing ? '⏳ Parsing…' : '📄 Import PDF'}
              </label>
              <span className="parse-hint">Upload a PDF recipe to extract text</span>
            </div>
            <input
              id="parse-file"
              type="file"
              accept=".pdf,application/pdf"
              ref={pdfFileRef}
              onChange={handleParsePdf}
              style={{ display: 'none' }}
              disabled={parsing || fetching}
            />
            {parseError && <p className="parse-error">Error: {parseError}</p>}
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-row form-row--2">
          <div className="form-field">
            <label>Title *</label>
            <input
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="e.g. Spaghetti Bolognese"
              required
            />
          </div>
          <div className="form-field">
            <label>Type *</label>
            <select value={form.type} onChange={(e) => { setField('type', e.target.value); setField('subcategory', ''); }}>
              <option value="recipe">🍽️ Recipe</option>
              <option value="cocktail">🍸 Cocktail</option>
              <option value="drink">🥂 Drink</option>
            </select>
          </div>
        </div>

        {form.type === 'recipe' && (
          <div className="form-field">
            <label>Category</label>
            <select value={form.subcategory} onChange={(e) => setField('subcategory', e.target.value)}>
              <option value="">— select category —</option>
              <option value="breakfast">🍳 Breakfast</option>
              <option value="lunch">🥗 Lunch</option>
              <option value="dinner">🍲 Dinner</option>
              <option value="dessert">🍰 Dessert</option>
            </select>
          </div>
        )}

        {form.type === 'drink' && (
          <div className="form-field">
            <label>Category</label>
            <select value={form.subcategory} onChange={(e) => setField('subcategory', e.target.value)}>
              <option value="">— select category —</option>
              <option value="wine">🍷 Wine</option>
              <option value="beer">🍺 Beer</option>
              <option value="spirits">🥃 Spirits</option>
            </select>
          </div>
        )}

        <div className="form-field">
          <label>Description</label>
          <input
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Short description (optional)"
          />
        </div>

        <div className="form-field">
          <label>Photo</label>
          <div className="image-upload-area">
            {imagePreview ? (
              <div className="image-preview-wrap">
                <div className="image-preview" onClick={handleFocalClick}>
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ objectPosition: `${form.focal_x}% ${form.focal_y}%` }}
                  />
                  <div className="focal-dot" style={{ left: `${form.focal_x}%`, top: `${form.focal_y}%` }} />
                  <button type="button" className="remove-image" onClick={(e) => { e.stopPropagation(); removeImage(); }}>×</button>
                </div>
                <div className="image-preview-actions">
                  <label htmlFor="image-file" className="change-photo-btn">
                    {uploading ? 'Uploading…' : 'Change photo'}
                  </label>
                  <p className="focal-hint">Click image to set focal point</p>
                </div>
              </div>
            ) : (
              <label className="image-upload-btn" htmlFor="image-file">
                {uploading ? 'Uploading…' : '+ Upload Photo'}
              </label>
            )}
            <input
              id="image-file"
              type="file"
              accept="image/*"
              ref={fileRef}
              onChange={handleImageChange}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </div>
        </div>

        {form.type !== 'drink' && (
          <div className="form-field">
            <div className="ing-label-row">
              <label>Ingredients</label>
              <button
                type="button"
                className={`btn-flow-toggle${showSteps ? ' btn-flow-toggle--on' : ''}`}
                onClick={() => setShowSteps((s) => !s)}
                title="Add flow step labels to group ingredients by cooking step"
              >
                {showSteps ? 'Hide steps' : '+ Flow steps'}
              </button>
            </div>
            <div className="ingredients-editor">
              {showSteps && (
                <div className="ing-row ing-row-header">
                  <span className="ing-col-label">Amount</span>
                  <span className="ing-col-label">Unit</span>
                  <span className="ing-col-label">Name</span>
                  <span className="ing-col-label">Step</span>
                  <span />
                </div>
              )}
              {ingredients.map((ing, idx) => (
                <div key={idx} className={`ing-row${showSteps ? ' ing-row--with-steps' : ''}`}>
                  <input
                    className="ing-input ing-amount"
                    value={ing.amount}
                    onChange={(e) => setIng(idx, 'amount', e.target.value)}
                    placeholder="Amount"
                  />
                  <select
                    className="ing-input ing-unit"
                    value={ing.unit}
                    onChange={(e) => setIng(idx, 'unit', e.target.value)}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u || '— unit —'}</option>
                    ))}
                  </select>
                  <input
                    className="ing-input ing-name"
                    value={ing.name}
                    onChange={(e) => setIng(idx, 'name', e.target.value)}
                    placeholder="Ingredient name *"
                  />
                  {showSteps && (
                    <input
                      className="ing-input ing-step"
                      value={ing.step_group || ''}
                      onChange={(e) => setIng(idx, 'step_group', e.target.value)}
                      placeholder="e.g. Melt"
                    />
                  )}
                  <button
                    type="button"
                    className="btn-icon ing-remove"
                    onClick={() => removeIng(idx)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn-secondary add-ing-btn" onClick={addIng}>
                + Add Ingredient
              </button>
            </div>
          </div>
        )}

        {form.type !== 'drink' && (
          <div className="form-field">
            <label>Instructions</label>
            <RichEditor
              value={form.instructions}
              onChange={(val) => setField('instructions', val)}
              placeholder="Step-by-step instructions…"
            />
          </div>
        )}

        <div className="form-field">
          <label>{form.type === 'drink' ? 'Tasting Notes' : 'Notes'}</label>
          <RichEditor
            value={form.notes}
            onChange={(val) => setField('notes', val)}
            placeholder={form.type === 'drink' ? 'Aroma, flavor, finish…' : 'Tips, substitutions, personal notes…'}
          />
        </div>

        {form.type === 'drink' && (
          <div className="form-field form-field--inline">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_favorite}
                onChange={(e) => setField('is_favorite', e.target.checked)}
              />
              Mark as Favorite ★
            </label>
          </div>
        )}

        <div className="form-field">
          <label>Tags</label>
          <div className="tags-input">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
                <button type="button" onClick={() => setTags((t) => t.filter((x) => x !== tag))}>×</button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={handleTagKey}
              placeholder="Add tag (Enter)…"
              style={{ border: 'none', outline: 'none', flex: 1, minWidth: 120, padding: '0.3rem 0', background: 'transparent' }}
            />
          </div>
        </div>

        <div className="form-actions">
          <Link to={isEdit ? `/recipe/${id}` : (isCellar ? '/cellar' : '/')} className="btn-secondary" style={{ padding: '0.6rem 1.4rem', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.9rem', fontWeight: 500 }}>
            Cancel
          </Link>
          <button type="submit" className="btn-primary" style={{ padding: '0.6rem 1.8rem', borderRadius: 8, fontSize: '0.9rem' }} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : (isCellar ? 'Add to Cellar' : 'Add Recipe')}
          </button>
        </div>
      </form>
    </div>
  );
}

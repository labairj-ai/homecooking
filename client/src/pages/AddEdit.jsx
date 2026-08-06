import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import RichEditor from '../components/RichEditor';
import './AddEdit.css';

const EMPTY_ING = () => ({ name: '', amount: '', unit: '' });

const UNITS = [
  '', 'tsp', 'tbsp', 'cup', 'oz', 'fl oz', 'lb', 'g', 'kg', 'ml', 'L',
  'pinch', 'dash', 'splash', 'to taste',
  'whole', 'slice', 'clove', 'can', 'bunch', 'sprig', 'piece',
];

export default function AddEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    title: '',
    type: 'recipe',
    subcategory: '',
    description: '',
    instructions: '',
    notes: '',
    image_path: null,
    is_favorite: false,
  });
  const [ingredients, setIngredients] = useState([EMPTY_ING()]);
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef();

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
      });
      setIngredients(recipe.ingredients.length ? recipe.ingredients : [EMPTY_ING()]);
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
        <Link to={isEdit ? `/recipe/${id}` : '/'} className="back-link">← Back</Link>
        <h1>{isEdit ? 'Edit Recipe' : 'Add New Recipe'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="addedit-form">
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
              <div className="image-preview">
                <img src={imagePreview} alt="Preview" />
                <button type="button" className="remove-image" onClick={removeImage}>×</button>
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
            <label>Ingredients</label>
            <div className="ingredients-editor">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="ing-row">
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
          <Link to={isEdit ? `/recipe/${id}` : '/'} className="btn-secondary" style={{ padding: '0.6rem 1.4rem', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.9rem', fontWeight: 500 }}>
            Cancel
          </Link>
          <button type="submit" className="btn-primary" style={{ padding: '0.6rem 1.8rem', borderRadius: 8, fontSize: '0.9rem' }} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Recipe'}
          </button>
        </div>
      </form>
    </div>
  );
}

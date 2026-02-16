const API = '';

let allStyles = [];
let deleteTargetId = null;
let generatedPrompts = { standard: '', removebg: '' };
let generatedBgPrompts = { standard: '', removebg: '' };
let currentPromptMode = 'standard';

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadStyles();
  loadRefImage();
  loadPreviewMode();

  // Click thumbnail to upload
  document.getElementById('preview-ref-thumb').addEventListener('click', () => {
    document.getElementById('preview-ref-file').click();
  });

  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('form-prompt').addEventListener('input', showPreviewSection);

  // Drag & drop on upload zone
  const zone = document.getElementById('upload-zone');
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--primary)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = '';
    if (e.dataTransfer.files.length) {
      document.getElementById('form-image-file').files = e.dataTransfer.files;
      handleFileSelect({ target: { files: e.dataTransfer.files } });
    }
  });
});

// --- API Calls ---

async function loadStyles() {
  try {
    const res = await fetch(`${API}/api/styles`);
    allStyles = await res.json();
    renderStyles(allStyles);
    updateStats();
  } catch (err) {
    showToast('Erreur de chargement des styles', 'error');
  }
}

async function createStyle(data) {
  const res = await fetch(`${API}/api/styles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

async function updateStyle(id, data) {
  const res = await fetch(`${API}/api/styles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

async function deleteStyle(id) {
  const res = await fetch(`${API}/api/styles/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

async function buildApi() {
  try {
    const res = await fetch(`${API}/api/build`, { method: 'POST' });
    const data = await res.json();
    showToast(data.message, 'success');
  } catch {
    showToast('Erreur lors du rebuild', 'error');
  }
}

async function pushToCDN() {
  const btn = document.getElementById('push-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Publication...';

  try {
    const res = await fetch(`${API}/api/push`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Publier sur CDN';
  }
}

async function generateAllPreviews() {
  const btn = document.getElementById('generate-all-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Génération en cours...';

  const referenceImage = localStorage.getItem('preview-ref-image') || '';
  const mode = localStorage.getItem('preview-mode') || 'direct';

  if (!referenceImage && mode === 'direct') {
    showToast('Veuillez d\'abord définir une image de référence', 'error');
    btn.disabled = false;
    btn.textContent = '🖼️ Générer tous les previews';
    return;
  }

  showToast('Génération de tous les previews en cours... Cela peut prendre plusieurs minutes.', 'success');

  try {
    const body = { mode };
    if (referenceImage) body.reference_image = referenceImage;

    const res = await fetch(`${API}/api/generate-all-previews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    await loadStyles();
    showToast(`${data.message}`, 'success');
    if (data.errors && data.errors.length > 0) {
      console.error('Preview generation errors:', data.errors);
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🖼️ Générer tous les previews';
  }
}

// --- Rendering ---

function renderStyles(styles) {
  const grid = document.getElementById('styles-grid');
  const empty = document.getElementById('empty-state');

  if (styles.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  grid.style.display = '';
  empty.style.display = 'none';

  grid.innerHTML = styles.map((s) => {
    const displayImage = s.preview_image || s.image;
    return `
    <div class="style-card" data-id="${s.id}">
      ${displayImage
        ? `<img class="card-image" src="${displayImage}" alt="${s.title}" onerror="this.outerHTML='<div class=\'card-image-placeholder\'>🎨</div>'">`
        : '<div class="card-image-placeholder">🎨</div>'}
      <div class="card-body">
        <div class="card-header">
          <span class="card-title">${esc(s.title)}</span>
          <div class="card-actions">
            <button class="btn-icon" onclick="openModal('${s.id}')" title="Modifier">✏️</button>
            <button class="btn-icon danger" onclick="openDeleteModal('${s.id}', '${esc(s.title)}')" title="Supprimer">🗑️</button>
          </div>
        </div>
        ${(s.description_fr || s.description) ? `<p class="card-description">${esc(s.description_fr || s.description)}</p>` : ''}
        <div class="card-tags">
          ${(s.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;}).join('');
}

function updateStats() {
  document.getElementById('stat-total').textContent = allStyles.length;
  const allTags = new Set(allStyles.flatMap((s) => s.tags || []));
  document.getElementById('stat-tags').textContent = allTags.size;
}

function handleSearch(e) {
  const q = e.target.value.toLowerCase().trim();
  if (!q) return renderStyles(allStyles);

  const filtered = allStyles.filter((s) =>
    s.title.toLowerCase().includes(q) ||
    (s.description_en || s.description || '').toLowerCase().includes(q) ||
    (s.description_fr || '').toLowerCase().includes(q) ||
    (s.prompt || '').toLowerCase().includes(q) ||
    (s.tags || []).some((t) => t.toLowerCase().includes(q))
  );
  renderStyles(filtered);
}

// --- Modal ---

function openModal(editId) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const submitBtn = document.getElementById('form-submit-btn');
  const form = document.getElementById('style-form');

  form.reset();
  resetUploadPreview();
  resetPreviewSection();
  document.getElementById('form-editing-id').value = '';
  document.getElementById('form-preview-image').value = '';
  switchImageTab('upload');
  resetGeneratedPrompts();

  if (editId) {
    const style = allStyles.find((s) => s.id === editId);
    if (!style) return;

    titleEl.textContent = 'Modifier le style';
    submitBtn.textContent = 'Enregistrer';
    document.getElementById('form-editing-id').value = style.id;
    document.getElementById('form-title').value = style.title;
    document.getElementById('form-description-fr').value = style.description_fr || style.description || '';
    document.getElementById('form-description-en').value = style.description_en || '';
    switchDescLang('fr');
    document.getElementById('form-prompt').value = style.prompt || '';
    document.getElementById('form-background-prompt').value = style.background_prompt || '';
    document.getElementById('form-tags').value = (style.tags || []).join(', ');
    document.getElementById('form-preview-image').value = style.preview_image || '';
    if (style.image) {
      switchImageTab('url');
      document.getElementById('form-image-url').value = style.image;
      updateUrlPreview();
      if (style.image.startsWith('images/')) {
        document.getElementById('analyze-url-btn').style.display = '';
      }
    }
    showPreviewSection();
  } else {
    titleEl.textContent = 'Nouveau style';
    submitBtn.textContent = 'Créer le style';
  }

  overlay.classList.add('open');
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-overlay').classList.remove('open');
}

function switchDescLang(lang) {
  document.getElementById('form-description-en').style.display = lang === 'en' ? '' : 'none';
  document.getElementById('form-description-fr').style.display = lang === 'fr' ? '' : 'none';
  document.getElementById('desc-tab-en').classList.toggle('active', lang === 'en');
  document.getElementById('desc-tab-fr').classList.toggle('active', lang === 'fr');
}

function switchImageTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.getElementById('tab-upload').style.display = tab === 'upload' ? '' : 'none';
  document.getElementById('tab-url').style.display = tab === 'url' ? '' : 'none';
  event.target ? event.target.classList.add('active') :
    document.querySelector(`.tab:${tab === 'upload' ? 'first' : 'last'}-child`).classList.add('active');
  if (tab === 'url') updateUrlPreview();
}

function updateUrlPreview() {
  const url = document.getElementById('form-image-url').value.trim();
  const preview = document.getElementById('url-image-preview');
  const img = preview.querySelector('img');
  if (url) {
    img.src = url;
    preview.style.display = '';
  } else {
    preview.style.display = 'none';
    img.src = '';
  }
}

let selectedFile = null;

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;

  const preview = document.getElementById('upload-preview');
  const reader = new FileReader();
  reader.onload = (ev) => {
    preview.innerHTML = `<img src="${ev.target.result}" alt="Preview"><span>${file.name} (${(file.size / 1024).toFixed(1)} Ko)</span>`;
  };
  reader.readAsDataURL(file);

  document.getElementById('analyze-btn').style.display = '';
}

function resetUploadPreview() {
  selectedFile = null;
  document.getElementById('upload-preview').innerHTML = '<span class="upload-icon">📁</span><span>Cliquer ou glisser une image</span>';
  const statusEl = document.getElementById('upload-status');
  statusEl.style.display = 'none';
  statusEl.className = 'upload-status';
  statusEl.textContent = '';
  document.getElementById('analyze-btn').style.display = 'none';
  document.getElementById('analyze-url-btn').style.display = 'none';
}

async function handleSubmit(e) {
  e.preventDefault();

  const editingId = document.getElementById('form-editing-id').value;
  const title = document.getElementById('form-title').value.trim();
  const description_en = document.getElementById('form-description-en').value.trim();
  const description_fr = document.getElementById('form-description-fr').value.trim();
  const description = description_fr;
  const prompt = document.getElementById('form-prompt').value.trim();
  const background_prompt = document.getElementById('form-background-prompt').value.trim();
  const tagsRaw = document.getElementById('form-tags').value;
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

  let image = document.getElementById('form-image-url').value.trim();

  const submitBtn = document.getElementById('form-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Chargement...';

  try {
    // Upload file if selected
    if (selectedFile && document.getElementById('tab-upload').style.display !== 'none') {
      const statusEl = document.getElementById('upload-status');
      statusEl.style.display = 'block';
      statusEl.className = 'upload-status uploading';
      statusEl.textContent = '⏳ Upload en cours...';

      const result = await uploadImage(selectedFile);
      image = result.url;

      statusEl.className = 'upload-status success';
      statusEl.textContent = `✔ ${result.filename}`;
    }

    // Auto-detect variables from prompt
    const varMatches = [...prompt.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const variables = [...new Set(varMatches)];
    const preview_image = document.getElementById('form-preview-image').value.trim();
    const data = { title, description, description_en, description_fr, prompt, background_prompt, image, preview_image, tags, variables: variables.length > 0 ? variables : undefined };

    if (editingId) {
      await updateStyle(editingId, data);
      showToast(`Style "${title}" mis à jour`, 'success');
    } else {
      await createStyle(data);
      showToast(`Style "${title}" créé`, 'success');
    }

    closeModal();
    await loadStyles();
  } catch (err) {
    showToast(err.message, 'error');

    const statusEl = document.getElementById('upload-status');
    if (statusEl.style.display === 'block') {
      statusEl.className = 'upload-status error';
      statusEl.textContent = `✖ ${err.message}`;
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Enregistrer' : 'Créer le style';
  }
}

// --- AI Analyze ---

async function analyzeImage() {
  const imageUrl = document.getElementById('form-image-url').value.trim();
  const useExisting = !selectedFile && imageUrl && imageUrl.startsWith('images/');

  if (!selectedFile && !useExisting) return showToast('Sélectionnez d\'abord une image', 'error');

  // Disable both buttons
  const btn = document.getElementById('analyze-btn');
  const urlBtn = document.getElementById('analyze-url-btn');
  const activeBtn = useExisting ? urlBtn : btn;
  activeBtn.disabled = true;
  activeBtn.innerHTML = '<span class="spinner"></span> Analyse en cours...';

  try {
    let res;
    if (useExisting) {
      const formData = new FormData();
      formData.append('image_path', imageUrl);
      res = await fetch(`${API}/api/analyze`, { method: 'POST', body: formData });
    } else {
      const formData = new FormData();
      formData.append('image', selectedFile);
      res = await fetch(`${API}/api/analyze`, { method: 'POST', body: formData });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const data = await res.json();

    if (data.title) document.getElementById('form-title').value = data.title;
    document.getElementById('form-description-en').value = data.description_en || '';
    document.getElementById('form-description-fr').value = data.description_fr || '';
    if (data.tags && data.tags.length) document.getElementById('form-tags').value = data.tags.join(', ');

    // Store both prompt versions
    generatedPrompts.standard = data.prompt || '';
    generatedPrompts.removebg = data.prompt_removebg || '';
    generatedBgPrompts.standard = data.background_prompt || '';
    generatedBgPrompts.removebg = data.background_prompt_removebg || '';

    // Display the current mode
    switchPromptMode(currentPromptMode);

    showToast('Champs remplis automatiquement par l\'IA', 'success');
    showPreviewSection();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    activeBtn.disabled = false;
    activeBtn.innerHTML = '🤖 Auto-remplir avec IA';
  }
}

// --- AI Preview ---

function showPreviewSection() {
  const prompt = document.getElementById('form-prompt').value.trim();
  const section = document.getElementById('preview-section');
  section.style.display = prompt ? '' : 'none';
}

function loadRefImage() {
  const saved = localStorage.getItem('preview-ref-image') || '';
  updateRefThumb(saved);
}

function switchPreviewMode(mode) {
  localStorage.setItem('preview-mode', mode);
  document.getElementById('mode-tab-direct').classList.toggle('active', mode === 'direct');
  document.getElementById('mode-tab-vlm').classList.toggle('active', mode === 'vlm');
  document.getElementById('preview-mode-hint').textContent = mode === 'direct'
    ? 'img2img'
    : 'VLM → text-to-image';
}

function loadPreviewMode() {
  const mode = localStorage.getItem('preview-mode') || 'direct';
  switchPreviewMode(mode);
}

function saveRefImage() {
  // No longer needed - ref image is only set via file upload
}

function updateRefThumb(src) {
  const thumb = document.getElementById('preview-ref-thumb');
  if (src) {
    thumb.innerHTML = `<img src="${src}" alt="ref" onerror="this.parentElement.innerHTML='?'">`;
  } else {
    thumb.innerHTML = '?';
  }
}

async function handleRefFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const result = await uploadImage(file);
    localStorage.setItem('preview-ref-image', result.url);
    updateRefThumb(result.url);
    showToast('Image de référence uploadée', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function generatePreview() {
  const prompt = document.getElementById('form-prompt').value.trim();
  if (!prompt) return showToast('Remplissez d\'abord le prompt', 'error');

  const btn = document.getElementById('generate-preview-btn');
  const loading = document.getElementById('preview-loading');
  const container = document.getElementById('preview-container');
  const referenceImage = localStorage.getItem('preview-ref-image') || '';
  const styleId = document.getElementById('form-editing-id').value;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Génération...';
  loading.style.display = 'flex';
  container.style.display = 'none';

  const mode = localStorage.getItem('preview-mode') || 'direct';

  try {
    const body = { prompt, mode };
    if (referenceImage) body.reference_image = referenceImage;
    if (styleId) body.style_id = styleId;

    const res = await fetch(`${API}/api/generate-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }

    const data = await res.json();
    const img = document.getElementById('preview-image');
    img.src = data.url;
    document.getElementById('form-preview-image').value = data.url;
    container.style.display = '';
    showToast('Aperçu généré et enregistré', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🖼️ Générer un aperçu';
    loading.style.display = 'none';
  }
}

function usePreviewAsImage() {
  const previewSrc = document.getElementById('preview-image').src;
  if (!previewSrc) return;

  // Extract relative path (images/preview-xxx.webp) from the full URL
  const url = new URL(previewSrc);
  const relativePath = url.pathname.replace(/^\//, '');

  document.getElementById('form-preview-image').value = relativePath;
  showToast('Image de preview définie', 'success');
}

function resetPreviewSection() {
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('preview-container').style.display = 'none';
  document.getElementById('preview-loading').style.display = 'none';
  document.getElementById('preview-image').src = '';
}

// --- Delete Modal ---

function openDeleteModal(id, title) {
  deleteTargetId = id;
  document.getElementById('delete-message').textContent = `Supprimer le style "${title}" ? Cette action est irréversible.`;
  document.getElementById('delete-overlay').style.display = 'flex';
}

function closeDeleteModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('delete-overlay').style.display = 'none';
  deleteTargetId = null;
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  const btn = document.getElementById('delete-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Suppression...';

  try {
    const result = await deleteStyle(deleteTargetId);
    showToast(result.message, 'success');
    closeDeleteModal();
    await loadStyles();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Supprimer';
  }
}

// --- Prompt Mode Toggle ---

function switchPromptMode(mode) {
  currentPromptMode = mode;
  document.getElementById('prompt-tab-standard').classList.toggle('active', mode === 'standard');
  document.getElementById('prompt-tab-removebg').classList.toggle('active', mode === 'removebg');
  document.getElementById('bg-prompt-tab-standard').classList.toggle('active', mode === 'standard');
  document.getElementById('bg-prompt-tab-removebg').classList.toggle('active', mode === 'removebg');

  if (generatedPrompts.standard || generatedPrompts.removebg) {
    document.getElementById('form-prompt').value = mode === 'removebg' ? generatedPrompts.removebg : generatedPrompts.standard;
    document.getElementById('form-background-prompt').value = mode === 'removebg' ? generatedBgPrompts.removebg : generatedBgPrompts.standard;
  }
}

function resetGeneratedPrompts() {
  generatedPrompts = { standard: '', removebg: '' };
  generatedBgPrompts = { standard: '', removebg: '' };
  currentPromptMode = 'standard';
  document.getElementById('prompt-tab-standard').classList.add('active');
  document.getElementById('prompt-tab-removebg').classList.remove('active');
  document.getElementById('bg-prompt-tab-standard').classList.add('active');
  document.getElementById('bg-prompt-tab-removebg').classList.remove('active');
}

// --- Toast ---

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.className = 'toast', 3000);
}

// --- Helpers ---

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function highlightVars(prompt) {
  return esc(prompt).replace(/\{\{(\w+)\}\}/g, '<span class="var-highlight">{{$1}}</span>');
}

function renderVarBadges(variables) {
  if (!variables || !Array.isArray(variables) || variables.length === 0) return '';
  const badges = variables.map((key) =>
    `<span class="var-badge">{{${key}}}</span>`
  ).join('');
  return `<div class="card-vars">${badges}</div>`;
}


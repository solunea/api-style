const API = '';

let allStyles = [];
let deleteTargetId = null;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadStyles();
  document.getElementById('search-input').addEventListener('input', handleSearch);

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

  grid.innerHTML = styles.map((s) => `
    <div class="style-card" data-id="${s.id}">
      ${s.image
        ? `<img class="card-image" src="${s.image}" alt="${s.title}" onerror="this.outerHTML='<div class=\\'card-image-placeholder\\'>🎨</div>'">`
        : '<div class="card-image-placeholder">🎨</div>'}
      <div class="card-body">
        <div class="card-header">
          <span class="card-title">${esc(s.title)}</span>
          <div class="card-actions">
            <button class="btn-icon" onclick="openModal('${s.id}')" title="Modifier">✏️</button>
            <button class="btn-icon danger" onclick="openDeleteModal('${s.id}', '${esc(s.title)}')" title="Supprimer">🗑️</button>
          </div>
        </div>
        ${s.description ? `<p class="card-description">${esc(s.description)}</p>` : ''}
        <div class="card-tags">
          ${(s.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
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
    (s.description || '').toLowerCase().includes(q) ||
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
  document.getElementById('form-editing-id').value = '';
  switchImageTab('upload');

  if (editId) {
    const style = allStyles.find((s) => s.id === editId);
    if (!style) return;

    titleEl.textContent = 'Modifier le style';
    submitBtn.textContent = 'Enregistrer';
    document.getElementById('form-editing-id').value = style.id;
    document.getElementById('form-title').value = style.title;
    document.getElementById('form-description').value = style.description || '';
    document.getElementById('form-prompt').value = style.prompt || '';
    document.getElementById('form-background-prompt').value = style.background_prompt || '';
    document.getElementById('form-tags').value = (style.tags || []).join(', ');
    document.getElementById('form-remove-bg').checked = !!style.removeBackground;
    if (style.image) {
      switchImageTab('url');
      document.getElementById('form-image-url').value = style.image;
      if (style.image.startsWith('images/')) {
        document.getElementById('analyze-url-btn').style.display = '';
      }
    }
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

function switchImageTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.getElementById('tab-upload').style.display = tab === 'upload' ? '' : 'none';
  document.getElementById('tab-url').style.display = tab === 'url' ? '' : 'none';
  event.target ? event.target.classList.add('active') :
    document.querySelector(`.tab:${tab === 'upload' ? 'first' : 'last'}-child`).classList.add('active');
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
  const description = document.getElementById('form-description').value.trim();
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
    const removeBackground = document.getElementById('form-remove-bg').checked;
    const data = { title, description, prompt, background_prompt, image, tags, variables: variables.length > 0 ? variables : undefined, removeBackground };

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
      // Send existing image path as JSON via FormData text field
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
    if (data.description) document.getElementById('form-description').value = data.description;
    if (data.prompt) document.getElementById('form-prompt').value = data.prompt;
    if (data.background_prompt) document.getElementById('form-background-prompt').value = data.background_prompt;
    if (data.tags && data.tags.length) document.getElementById('form-tags').value = data.tags.join(', ');

    showToast('Champs remplis automatiquement par l\'IA', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    activeBtn.disabled = false;
    activeBtn.innerHTML = '🤖 Auto-remplir avec IA';
  }
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


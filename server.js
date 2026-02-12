import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, copyFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import Replicate from 'replicate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data', 'styles.json');
const API_DIR = join(__dirname, 'api');
const STYLES_DIR = join(API_DIR, 'styles');
const IMAGES_DIR = join(__dirname, 'images');
const UPLOAD_DIR = join(__dirname, 'uploads');

if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });
const app = express();
const replicate = new Replicate();

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'admin')));
app.use('/images', express.static(IMAGES_DIR));

// --- Helpers ---

function readStyles() {
  return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
}

function writeStyles(styles) {
  writeFileSync(DATA_FILE, JSON.stringify(styles, null, 2));
}

function buildApi(styles) {
  if (!existsSync(API_DIR)) mkdirSync(API_DIR, { recursive: true });
  if (!existsSync(STYLES_DIR)) mkdirSync(STYLES_DIR, { recursive: true });

  const index = styles.map(({ id, title, description, image, tags, removeBackground, createdAt }) => ({
    id, title, description, image, tags, removeBackground: !!removeBackground, createdAt
  }));
  writeFileSync(join(API_DIR, 'styles.json'), JSON.stringify(index, null, 2));

  for (const style of styles) {
    writeFileSync(join(STYLES_DIR, `${style.id}.json`), JSON.stringify(style, null, 2));
  }
}

// --- API Routes ---

// GET all styles
app.get('/api/styles', (req, res) => {
  res.json(readStyles());
});

// GET single style
app.get('/api/styles/:id', (req, res) => {
  const styles = readStyles();
  const style = styles.find((s) => s.id === req.params.id);
  if (!style) return res.status(404).json({ error: 'Style non trouvé' });
  res.json(style);
});

// POST create style
app.post('/api/styles', (req, res) => {
  const styles = readStyles();
  const { title, description, prompt, background_prompt, image, tags, variables, removeBackground, supportImageReference } = req.body;

  if (!title) return res.status(400).json({ error: 'Le titre est requis' });

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (styles.some((s) => s.id === id)) {
    return res.status(409).json({ error: `Un style avec l'id "${id}" existe déjà` });
  }

  const style = {
    id,
    title,
    description: description || '',
    prompt: prompt || '',
    background_prompt: background_prompt || '',
    ...(variables && { variables }),
    image: image || '',
    tags: tags || [],
    removeBackground: !!removeBackground,
    supportImageReference: !!supportImageReference,
    createdAt: new Date().toISOString()
  };

  styles.push(style);
  writeStyles(styles);
  buildApi(styles);

  res.status(201).json(style);
});

// PUT update style
app.put('/api/styles/:id', (req, res) => {
  const styles = readStyles();
  const index = styles.findIndex((s) => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Style non trouvé' });

  const { title, description, prompt, background_prompt, image, tags, variables, removeBackground, supportImageReference } = req.body;
  styles[index] = {
    ...styles[index],
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(prompt !== undefined && { prompt }),
    ...(background_prompt !== undefined && { background_prompt }),
    ...(variables !== undefined && { variables }),
    ...(image !== undefined && { image }),
    ...(tags !== undefined && { tags }),
    ...(removeBackground !== undefined && { removeBackground: !!removeBackground }),
    ...(supportImageReference !== undefined && { supportImageReference: !!supportImageReference }),
  };

  writeStyles(styles);
  buildApi(styles);

  res.json(styles[index]);
});

// DELETE style
app.delete('/api/styles/:id', async (req, res) => {
  let styles = readStyles();
  const index = styles.findIndex((s) => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Style non trouvé' });

  const deleted = styles.splice(index, 1)[0];
  writeStyles(styles);
  buildApi(styles);

  // Remove individual API file
  const apiFile = join(STYLES_DIR, `${deleted.id}.json`);
  if (existsSync(apiFile)) {
    unlinkSync(apiFile);
  }

  // Remove image file
  if (deleted.image) {
    const imgPath = join(__dirname, deleted.image);
    if (existsSync(imgPath)) {
      unlinkSync(imgPath);
    }
  }

  res.json({ message: `Style "${deleted.title}" supprimé`, style: deleted });
});

// POST upload image locally
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image fournie' });

  try {
    const ext = extname(req.file.originalname).toLowerCase() || '.jpg';
    const filename = req.file.originalname
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase() || `image-${Date.now()}${ext}`;

    const destPath = join(IMAGES_DIR, filename);
    copyFileSync(req.file.path, destPath);
    unlinkSync(req.file.path);

    res.json({ url: `images/${filename}`, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST analyze image with Gemini 3 Pro via Replicate
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    let dataUri;

    if (req.file) {
      // File uploaded directly
      const imageBuffer = readFileSync(req.file.path);
      const base64 = imageBuffer.toString('base64');
      const mimeType = req.file.mimetype || 'image/jpeg';
      dataUri = `data:${mimeType};base64,${base64}`;
      unlinkSync(req.file.path);
    } else if (req.body && req.body.image_path) {
      // Existing local image path (e.g. "images/xxx.jpg")
      const imgPath = join(__dirname, req.body.image_path);
      if (!existsSync(imgPath)) return res.status(404).json({ error: 'Image introuvable sur le serveur' });
      const imageBuffer = readFileSync(imgPath);
      const base64 = imageBuffer.toString('base64');
      const ext = extname(req.body.image_path).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/jpeg';
      dataUri = `data:${mimeType};base64,${base64}`;
    } else {
      return res.status(400).json({ error: 'Aucune image fournie' });
    }

    const useImageRef = req.body && req.body.supportImageReference === 'true';

    const prompt = useImageRef
      ? `You are an expert prompt engineer specialized in AI image-to-image style transfer (Midjourney, Stable Diffusion, DALL-E, Flux).

Analyze the visual style of this image in detail: lighting, color palette, textures, composition, artistic technique, mood, atmosphere, rendering style, etc.

Then generate a high-quality style transfer prompt optimized for img2img workflows. The prompt must describe ONLY the visual style to apply — NOT the subject or content (the user will provide their own reference image). Focus on: rendering technique, color grading, texture quality, lighting mood, contrast, saturation, artistic medium, and visual effects. Use {{primary_color}} for the dominant color, {{accent_color}} for the accent color, and {{background_color}} for the background color on which the final image will be displayed (important for contrast and edge rendering when the background is removed). These variables allow the style to be adapted to any color theme.

Return ONLY a valid JSON object with these fields:
- "title": an original creative name for this style in exactly 2 words (in English, like "Neon Glow", "Golden Haze", "Celestial Burst")
- "description": describe what makes this style unique and recognizable (2-3 sentences, in French)
- "prompt": a long, highly detailed English style transfer prompt (at least 80 words) that describes ONLY the visual style to apply to any input image. Do NOT describe a subject or scene — the user provides a reference image. Describe precisely: the rendering technique, artistic medium, color grading, texture quality, contrast levels, saturation, lighting mood, lens effects, atmosphere. Use {{primary_color}}, {{accent_color}} and {{background_color}} as color variables. {{background_color}} represents the color on which the final image will be composited after background removal — use it to ensure proper edge rendering, contrast, and visual harmony against the destination surface. End with comma-separated reinforcement tags (e.g. "style transfer, same composition, sharp focus, cinematic lighting, 8k, ultra detailed"). The prompt should be professional quality, ready to use in img2img or style reference mode.
- "background_prompt": a detailed English prompt (at least 40 words) that describes ONLY a background scene or environment matching this visual style. This prompt must work in two ways: (1) as a background layer placed behind a subject, and (2) as a foreground decorative frame or overlay placed in front of the subject to create depth. Describe environment elements, patterns, textures, colors, and atmospheric effects that complement the main style. Use {{primary_color}}, {{accent_color}} and {{background_color}} variables. Do NOT include any subject in this prompt, only the scene and environment.
- "tags": an array of 3 to 6 relevant style tags (English, lowercase)

Return ONLY the raw JSON. No markdown, no code fences, no extra text.`
      : `You are an expert prompt engineer specialized in AI image generation (Midjourney, Stable Diffusion, DALL-E, Flux).

Analyze the visual style of this image in detail: lighting, color palette, textures, composition, artistic technique, mood, atmosphere, rendering style, etc.

Then generate a high-quality, reusable style prompt that can be applied to ANY other image or subject. The prompt must capture the essence of the style, not the specific content of the image. Use {{subject}} as a placeholder for the main subject, {{primary_color}} for the dominant color, {{accent_color}} for the accent color, and {{background_color}} for the background color on which the final image will be displayed (important for contrast and edge rendering when the background is removed). These variables allow the style to be applied universally with any color theme.

Return ONLY a valid JSON object with these fields:
- "title": an original creative name for this style in exactly 2 words (in English, like "Neon Glow", "Golden Haze", "Celestial Burst")
- "description": describe what makes this style unique and recognizable (2-3 sentences, in French)
- "prompt": a long, highly detailed English prompt (at least 80 words) that reproduces this exact visual style. Describe precisely: the lighting setup, color grading, texture quality, contrast levels, saturation, depth of field, lens effects, artistic rendering technique, atmosphere, mood. It must be generic and reusable on any subject. Include {{subject}} as the main variable, {{primary_color}} for the dominant color, {{accent_color}} for the accent color, and {{background_color}} for the background color on which the image will be composited after background removal — use it to ensure proper edge rendering, contrast, and visual harmony against the destination surface. You may also use {{mood}}, {{lighting}} if relevant. At the end of the prompt, append a comma-separated list of reinforcement tags (e.g. "no perspective, sharp focus, cinematic lighting, 8k, ultra detailed, volumetric light, soft shadows") to strengthen the style interpretation. The prompt should be professional quality, extremely descriptive, ready to copy-paste into Midjourney or Flux.
- "background_prompt": a detailed English prompt (at least 40 words) that describes ONLY a background scene or environment matching this visual style. This prompt must work in two ways: (1) as a background layer placed behind a subject, and (2) as a foreground decorative frame or overlay placed in front of the subject to create depth. Describe environment elements, patterns, textures, colors, and atmospheric effects that complement the main style. Use {{primary_color}}, {{accent_color}} and {{background_color}} variables. Do NOT include any subject in this prompt, only the scene and environment.
- "tags": an array of 3 to 6 relevant style tags (English, lowercase)

Return ONLY the raw JSON. No markdown, no code fences, no extra text.`;

    const output = await replicate.run('google/gemini-3-pro', {
      input: {
        prompt: prompt,
        images: [dataUri],
        temperature: 0.7,
      }
    });

    // output can be a string or an array of strings
    let raw = Array.isArray(output) ? output.join('') : String(output);
    raw = raw.trim();
    console.log('--- RAW MODEL OUTPUT ---');
    console.log(raw);
    console.log('--- END RAW OUTPUT ---');

    // Remove markdown code fences if present (handles ```json\n...\n```)
    raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');

    // Extract the first balanced JSON object using brace depth tracking
    let jsonStr = null;
    const startIdx = raw.indexOf('{');
    if (startIdx !== -1) {
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = startIdx; i < raw.length; i++) {
        const ch = raw[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { jsonStr = raw.slice(startIdx, i + 1); break; } }
      }
    }
    if (!jsonStr) throw new Error('Aucun JSON valide trouvé dans la réponse du modèle');

    const parsed = JSON.parse(jsonStr);
    res.json({
      title: parsed.title || '',
      description: parsed.description || '',
      prompt: parsed.prompt || '',
      background_prompt: parsed.background_prompt || '',
      tags: parsed.tags || [],
    });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: `Erreur d'analyse : ${err.message}` });
  }
});

// POST build API
app.post('/api/build', (req, res) => {
  const styles = readStyles();
  buildApi(styles);
  res.json({ message: `API regénérée (${styles.length} styles)` });
});

// POST push to Git (commit + push → disponible en ~5 min sur GitHub raw)
app.post('/api/push', (req, res) => {
  try {
    const opts = { cwd: __dirname, encoding: 'utf-8' };

    // Build API first
    const styles = readStyles();
    buildApi(styles);

    // Git add, commit, push
    execSync('git add -A', opts);

    // Check if there are changes to commit
    try {
      execSync('git diff --cached --quiet', opts);
      return res.json({ message: 'Rien à publier, tout est déjà à jour.' });
    } catch {
      // There are staged changes, continue
    }

    const msg = `Update styles - ${new Date().toLocaleString('fr-FR')}`;
    execSync(`git commit -m "${msg}"`, opts);
    execSync('git push', opts);

    res.json({ message: `Publié (${styles.length} styles) — disponible sur le CDN dans ~5 min` });
  } catch (err) {
    res.status(500).json({ error: `Erreur push : ${err.message}` });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n🎨 Style Manager — http://localhost:${PORT}`);
  console.log(`   API           — http://localhost:${PORT}/api/styles`);
  console.log(`   Admin         — http://localhost:${PORT}\n`);
});

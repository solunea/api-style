import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, copyFileSync, readdirSync, statSync } from 'fs';
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

  const index = styles.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    description_en: s.description_en,
    description_fr: s.description_fr,
    image: s.image,
    preview_image: s.preview_image || '',
    tags: s.tags,
    removeBackground: !!s.removeBackground,
    createdAt: s.createdAt
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
  const { title, description, description_en, description_fr, prompt, background_prompt, image, preview_image, tags, variables, removeBackground, supportImageReference } = req.body;

  if (!title) return res.status(400).json({ error: 'Le titre est requis' });

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (styles.some((s) => s.id === id)) {
    return res.status(409).json({ error: `Un style avec l'id "${id}" existe déjà` });
  }

  const style = {
    id,
    title,
    description: description_fr || description || '',
    description_en: description_en || '',
    description_fr: description_fr || description || '',
    prompt: prompt || '',
    background_prompt: background_prompt || '',
    ...(variables && { variables }),
    image: image || '',
    preview_image: preview_image || '',
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

  const { title, description, description_en, description_fr, prompt, background_prompt, image, preview_image, tags, variables, removeBackground, supportImageReference } = req.body;

  // Delete old preview file if a new one is being set
  const oldPreview = styles[index].preview_image;
  if (preview_image !== undefined && preview_image !== oldPreview && oldPreview && oldPreview.startsWith('images/preview-')) {
    const oldPath = join(__dirname, oldPreview);
    if (existsSync(oldPath)) {
      unlinkSync(oldPath);
    }
  }

  styles[index] = {
    ...styles[index],
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(description_en !== undefined && { description_en }),
    ...(description_fr !== undefined && { description_fr }),
    ...(prompt !== undefined && { prompt }),
    ...(background_prompt !== undefined && { background_prompt }),
    ...(variables !== undefined && { variables }),
    ...(image !== undefined && { image }),
    ...(preview_image !== undefined && { preview_image }),
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

  // Remove preview image file
  if (deleted.preview_image) {
    const previewPath = join(__dirname, deleted.preview_image);
    if (existsSync(previewPath)) {
      unlinkSync(previewPath);
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
    const useRemoveBg = req.body && req.body.removeBackground === 'true';

    const bgColorIntro = useRemoveBg
      ? ', and {{background_color}} for the background color on which the final image will be displayed (important for contrast and edge rendering when the background is removed)'
      : '';

    const bgColorVarsLabel = useRemoveBg ? ', {{accent_color}} and {{background_color}}' : ' and {{accent_color}}';

    const bgColorPromptRule = useRemoveBg
      ? ` Also use {{background_color}} in the prompt. IMPORTANT: {{background_color}} is the color of the surface on which the final image will be placed after background removal. You MUST reference {{background_color}} explicitly, for example: "set against a {{background_color}} background", or "composited on a clean {{background_color}} surface". Never hardcode a background color like "white background" — always use {{background_color}} instead.`
      : '';

    const bgColorBgPromptVars = useRemoveBg
      ? '{{primary_color}}, {{accent_color}} and {{background_color}}'
      : '{{primary_color}} and {{accent_color}}';

    const prompt = useImageRef
      ? `You are an expert prompt engineer specialized in AI image-to-image style transfer (Midjourney, Stable Diffusion, DALL-E, Flux).

Analyze the visual style of this image in detail: lighting, color palette, textures, composition, artistic technique, mood, atmosphere, rendering style, etc.

Then generate a high-quality style transfer prompt optimized for img2img workflows. The prompt must describe ONLY the visual style to apply — NOT the subject or content (the user will provide their own reference image). Focus on: rendering technique, color grading, texture quality, lighting mood, contrast, saturation, artistic medium, and visual effects. Use {{primary_color}} for the dominant color, {{accent_color}} for the accent color${bgColorIntro}. These variables allow the style to be adapted to any color theme.

Return ONLY a valid JSON object with these fields:
- "title": an original creative name for this style in exactly 2 words (in English, like "Neon Glow", "Golden Haze", "Celestial Burst")
- "description_en": describe what makes this style unique and recognizable (2-3 sentences, in English)
- "description_fr": the same description translated in French (2-3 sentences, in French)
- "prompt": a long, highly detailed English style transfer prompt (at least 150 words) that describes ONLY the visual style to apply to any input image. Do NOT describe a subject or scene — the user provides a reference image. Be extremely specific and descriptive — vague terms produce poor results. Describe precisely: the rendering technique (e.g. "digital painting", "pencil sketch", "3D render", "vector illustration"), the artistic medium and surface texture (e.g. "rough watercolor paper", "smooth matte plastic", "grainy film stock"), color grading and palette behavior, contrast levels, saturation, lighting setup with specific keywords (e.g. "golden hour", "studio lighting", "soft diffuse ambient light", "hard directional sunlight", "rim lighting"), lens effects (e.g. "shallow depth of field", "bokeh", "tilt-shift"), and atmosphere/mood. Use {{primary_color}}${bgColorVarsLabel} as color variables.${bgColorPromptRule} End with a long comma-separated list of reinforcement tags to strengthen the style interpretation (e.g. "style transfer, same composition, sharp focus, cinematic lighting, 8k, ultra detailed, photorealistic, volumetric light"). The more specific and descriptive the prompt, the better the results. The prompt should be professional quality, ready to use in img2img or style reference mode.
- "background_prompt": a detailed English prompt (at least 40 words) that describes ONLY a background scene or environment matching this visual style. This prompt must work in two ways: (1) as a background layer placed behind a subject, and (2) as a foreground decorative frame or overlay placed in front of the subject to create depth. Describe environment elements, patterns, textures, colors, and atmospheric effects that complement the main style. Use ${bgColorBgPromptVars} variables. Do NOT include any subject in this prompt, only the scene and environment.
- "tags": an array of 3 to 6 relevant style tags (English, lowercase)

Return ONLY the raw JSON. No markdown, no code fences, no extra text.`
      : `You are an expert prompt engineer specialized in AI image generation (Midjourney, Stable Diffusion, DALL-E, Flux).

Analyze the visual style of this image in detail: lighting, color palette, textures, composition, artistic technique, mood, atmosphere, rendering style, etc.

Then generate a high-quality, reusable style prompt that can be applied to ANY other image or subject. The prompt must capture the essence of the style, not the specific content of the image. Use {{subject}} as a placeholder for the main subject, {{primary_color}} for the dominant color, {{accent_color}} for the accent color${bgColorIntro}. These variables allow the style to be applied universally with any color theme.

Return ONLY a valid JSON object with these fields:
- "title": an original creative name for this style in exactly 2 words (in English, like "Neon Glow", "Golden Haze", "Celestial Burst")
- "description_en": describe what makes this style unique and recognizable (2-3 sentences, in English)
- "description_fr": the same description translated in French (2-3 sentences, in French)
- "prompt": a long, highly detailed English prompt (at least 150 words) that reproduces this exact visual style. Be extremely specific and descriptive — vague terms produce poor results. Describe precisely: the artistic rendering technique (e.g. "digital painting", "pencil sketch", "3D render", "vector illustration"), the medium and surface texture (e.g. "rough watercolor paper", "smooth matte plastic", "grainy film stock"), color grading and palette behavior, contrast levels, saturation, lighting setup with specific keywords (e.g. "golden hour", "studio lighting", "soft diffuse ambient light", "hard directional sunlight", "rim lighting"), depth of field and lens effects (e.g. "shallow depth of field", "bokeh", "tilt-shift"), and atmosphere/mood. It must be generic and reusable on any subject. Include {{subject}} as the main variable, {{primary_color}} for the dominant color${bgColorVarsLabel} for the accent color.${bgColorPromptRule} You may also use {{mood}}, {{lighting}} if relevant. At the end of the prompt, append a long comma-separated list of reinforcement tags to strengthen the style interpretation (e.g. "no perspective, sharp focus, cinematic lighting, 8k, ultra detailed, volumetric light, soft shadows, photorealistic"). The more specific and descriptive the prompt, the better the results. The prompt should be professional quality, extremely descriptive, ready to copy-paste into Midjourney or Flux.
- "background_prompt": a detailed English prompt (at least 40 words) that describes ONLY a background scene or environment matching this visual style. This prompt must work in two ways: (1) as a background layer placed behind a subject, and (2) as a foreground decorative frame or overlay placed in front of the subject to create depth. Describe environment elements, patterns, textures, colors, and atmospheric effects that complement the main style. Use ${bgColorBgPromptVars} variables. Do NOT include any subject in this prompt, only the scene and environment.
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
      description_en: parsed.description_en || parsed.description || '',
      description_fr: parsed.description_fr || '',
      prompt: parsed.prompt || '',
      background_prompt: parsed.background_prompt || '',
      tags: parsed.tags || [],
    });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: `Erreur d'analyse : ${err.message}` });
  }
});

// Prompt used by VLM mode to describe the subject of the reference image
const IMAGE_DESCRIPTION_PROMPT =
  "Describe the main subject of this image in 5 to 15 words for use as a {{subject}} placeholder. " +
  "Focus only on WHAT is depicted: the main object, person, animal, or scene. " +
  "Be specific but concise. Examples: 'a golden retriever puppy sitting on grass', 'a red sports car on a mountain road', 'a smiling woman in a blue dress'. " +
  "Do NOT describe style, lighting, mood, colors, or background details. " +
  "Write in English. Start directly with the subject description.";

// Helper: resolve a reference_image field to a data URI
function resolveImageToDataUri(reference_image) {
  if (reference_image.startsWith('http://') || reference_image.startsWith('https://')) {
    return reference_image;
  }
  const refPath = join(__dirname, reference_image);
  if (!existsSync(refPath)) throw new Error('Image de référence introuvable');
  const refBuffer = readFileSync(refPath);
  const refBase64 = refBuffer.toString('base64');
  const ext = extname(reference_image).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  const mimeType = mimeMap[ext] || 'image/jpeg';
  return `data:${mimeType};base64,${refBase64}`;
}

// POST generate preview image from prompt via z-image-turbo on Replicate
// Two modes:
//   "direct"  → img2img with prunaai/z-image-turbo-img2img (reference image as input)
//   "vlm"     → describe reference image with openai/gpt-5-nano, then text-to-image with z-image-turbo
app.post('/api/generate-preview', async (req, res) => {
  try {
    const { prompt, supportImageReference, reference_image, mode } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Aucun prompt fourni' });

    // Replace template variables with sample values for preview
    const sampleVars = {
      subject: 'a luxury perfume bottle',
      primary_color: 'deep navy blue',
      accent_color: 'gold',
      background_color: 'white',
      mood: 'elegant and sophisticated',
      lighting: 'soft studio lighting',
    };

    let resolvedPrompt = prompt;

    // --- VLM mode: describe the reference image first, use description as {{subject}} ---
    if (mode === 'vlm' && reference_image) {
      console.log('--- VLM MODE: describing reference image ---');
      const refUri = resolveImageToDataUri(reference_image);

      const vlmOutput = await replicate.run('openai/gpt-5-nano', {
        input: {
          prompt: IMAGE_DESCRIPTION_PROMPT,
          image_input: [refUri],
          temperature: 0.3,
        }
      });

      const subjectDescription = (Array.isArray(vlmOutput) ? vlmOutput.join('') : String(vlmOutput)).trim();
      console.log('VLM subject description:', subjectDescription);

      // Override the sample subject with the real description
      sampleVars.subject = subjectDescription;
    }

    // Replace all template variables
    for (const [key, value] of Object.entries(sampleVars)) {
      resolvedPrompt = resolvedPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    // Truncate if too long
    if (resolvedPrompt.length > 1500) {
      resolvedPrompt = resolvedPrompt.slice(0, 1500);
    }

    console.log('--- PREVIEW PROMPT ---');
    console.log(resolvedPrompt.slice(0, 400) + '...');
    console.log(`Mode: ${mode || 'direct'} | Reference: ${reference_image || 'none'}`);
    console.log('--- END PREVIEW PROMPT ---');

    let output;

    if (mode === 'direct' && reference_image) {
      // img2img: apply style on reference image directly
      const refUri = resolveImageToDataUri(reference_image);
      output = await replicate.run('prunaai/z-image-turbo-img2img', {
        input: {
          prompt: resolvedPrompt,
          image: refUri,
          strength: 0.75,
        }
      });
    } else {
      // text-to-image (used by VLM mode, or when no reference image)
      output = await replicate.run('prunaai/z-image-turbo', {
        input: {
          prompt: resolvedPrompt,
        }
      });
    }

    // output is an array of URLs (or FileOutput objects)
    const imageUrl = Array.isArray(output) ? String(output[0]) : String(output);

    // Download the image and save locally
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Impossible de télécharger l\'image générée');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = `preview-${Date.now()}.webp`;
    const destPath = join(IMAGES_DIR, filename);
    writeFileSync(destPath, buffer);

    const previewUrl = `images/${filename}`;

    // Auto-save preview_image on the style if style_id is provided
    if (req.body.style_id) {
      const styles = readStyles();
      const idx = styles.findIndex((s) => s.id === req.body.style_id);
      if (idx !== -1) {
        // Delete old preview file
        const oldPreview = styles[idx].preview_image;
        if (oldPreview && oldPreview.startsWith('images/preview-')) {
          const oldPath = join(__dirname, oldPreview);
          if (existsSync(oldPath)) unlinkSync(oldPath);
        }
        styles[idx].preview_image = previewUrl;
        writeStyles(styles);
        buildApi(styles);
      }
    }

    res.json({ url: previewUrl });
  } catch (err) {
    console.error('Generate preview error:', err);
    res.status(500).json({ error: `Erreur de génération : ${err.message}` });
  }
});

// GET list all preview images
app.get('/api/previews', (req, res) => {
  try {
    const files = readdirSync(IMAGES_DIR)
      .filter(f => f.startsWith('preview-') && f.endsWith('.webp'))
      .map(f => ({
        filename: f,
        url: `images/${f}`,
        createdAt: statSync(join(IMAGES_DIR, f)).mtime.toISOString()
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: `Erreur: ${err.message}` });
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
    const opts = { cwd: __dirname, encoding: 'utf-8', timeout: 60000 };

    // Build API first
    const styles = readStyles();
    buildApi(styles);

    // Git add
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
    
    // Git push with timeout
    try {
      execSync('git push', { ...opts, timeout: 120000 });
    } catch (pushErr) {
      console.error('Git push error:', pushErr);
      return res.status(500).json({ error: `Erreur git push : ${pushErr.message}. Vérifiez votre connexion et les credentials.` });
    }

    res.json({ message: `Publié (${styles.length} styles) — disponible sur le CDN dans ~5 min` });
  } catch (err) {
    console.error('Push error:', err);
    res.status(500).json({ error: `Erreur push : ${err.message}` });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n🎨 Style Manager — http://localhost:${PORT}`);
  console.log(`   API           — http://localhost:${PORT}/api/styles`);
  console.log(`   Admin         — http://localhost:${PORT}\n`);
});

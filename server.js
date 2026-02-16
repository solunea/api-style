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
    preview_image_removebg: s.preview_image_removebg || '',
    tags: s.tags,
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
  const { title, description, description_en, description_fr, prompt, prompt_removebg, background_prompt, background_prompt_removebg, image, preview_image, preview_image_removebg, tags, variables } = req.body;

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
    prompt_removebg: prompt_removebg || '',
    background_prompt: background_prompt || '',
    background_prompt_removebg: background_prompt_removebg || '',
    ...(variables && { variables }),
    image: image || '',
    preview_image: preview_image || '',
    preview_image_removebg: preview_image_removebg || '',
    tags: tags || [],
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

  const { title, description, description_en, description_fr, prompt, prompt_removebg, background_prompt, background_prompt_removebg, image, preview_image, preview_image_removebg, tags, variables } = req.body;

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
    ...(prompt_removebg !== undefined && { prompt_removebg }),
    ...(background_prompt !== undefined && { background_prompt }),
    ...(background_prompt_removebg !== undefined && { background_prompt_removebg }),
    ...(variables !== undefined && { variables }),
    ...(image !== undefined && { image }),
    ...(preview_image !== undefined && { preview_image }),
    ...(preview_image_removebg !== undefined && { preview_image_removebg }),
    ...(tags !== undefined && { tags }),
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

// Default analyze prompts
const ANALYZE_PROMPT_DEFAULT = `You are an expert prompt engineer specialized in AI image generation (Midjourney, Stable Diffusion, DALL-E, Flux).

Analyze the visual style of this image in detail: lighting, color palette, textures, composition, artistic technique, mood, atmosphere, rendering style, etc.

Then generate a high-quality, reusable style prompt that can be applied to ANY other image or subject. The prompt must capture the essence of the style, not the specific content of the image. Use {{subject}} as a placeholder for the main subject, {{primary_color}} for the dominant color, {{accent_color}} for the accent color. These variables allow the style to be applied universally with any color theme.

Return ONLY a valid JSON object with these fields:
- "title": an original creative name for this style in exactly 2 words (in English, like "Neon Glow", "Golden Haze", "Celestial Burst")
- "description_en": describe what makes this style unique and recognizable (2-3 sentences, in English)
- "description_fr": the same description translated in French (2-3 sentences, in French)
- "prompt": a long, highly detailed English prompt (at least 150 words) that reproduces this exact visual style. Be extremely specific and descriptive — vague terms produce poor results. Describe precisely: the artistic rendering technique (e.g. "digital painting", "pencil sketch", "3D render", "vector illustration"), the medium and surface texture (e.g. "rough watercolor paper", "smooth matte plastic", "grainy film stock"), color grading and palette behavior, contrast levels, saturation, lighting setup with specific keywords (e.g. "golden hour", "studio lighting", "soft diffuse ambient light", "hard directional sunlight", "rim lighting"), depth of field and lens effects (e.g. "shallow depth of field", "bokeh", "tilt-shift"), and atmosphere/mood. It must be generic and reusable on any subject. Include {{subject}} as the main variable, {{primary_color}} for the dominant color and {{accent_color}} for the accent color. You may also use {{mood}}, {{lighting}} if relevant. At the end of the prompt, append a long comma-separated list of reinforcement tags to strengthen the style interpretation (e.g. "no perspective, sharp focus, cinematic lighting, 8k, ultra detailed, volumetric light, soft shadows, photorealistic"). The more specific and descriptive the prompt, the better the results. The prompt should be professional quality, extremely descriptive, ready to copy-paste into Midjourney or Flux.
- "background_prompt": a detailed English prompt (at least 40 words) that describes ONLY a background scene or environment matching this visual style. This prompt must work in two ways: (1) as a background layer placed behind a subject, and (2) as a foreground decorative frame or overlay placed in front of the subject to create depth. Describe environment elements, patterns, textures, colors, and atmospheric effects that complement the main style. Use {{primary_color}} and {{accent_color}} variables. Do NOT include any subject in this prompt, only the scene and environment.
- "tags": an array of 3 to 6 relevant style tags (English, lowercase)

Return ONLY the raw JSON. No markdown, no code fences, no extra text.`;

const ANALYZE_PROMPT_REMOVEBG = `You are an expert prompt engineer specialized in AI image generation (Midjourney, Stable Diffusion, DALL-E, Flux).

Analyze the visual style of this image in detail: lighting, color palette, textures, composition, artistic technique, mood, atmosphere, rendering style, etc.

Then generate a high-quality, reusable style prompt that can be applied to ANY other image or subject. The prompt must capture the essence of the style, not the specific content of the image. Use {{subject}} as a placeholder for the main subject, {{primary_color}} for the dominant color, {{accent_color}} for the accent color, and {{background_color}} for the background color on which the final image will be displayed (important for contrast and edge rendering when the background is removed). These variables allow the style to be applied universally with any color theme.

Return ONLY a valid JSON object with these fields:
- "title": an original creative name for this style in exactly 2 words (in English, like "Neon Glow", "Golden Haze", "Celestial Burst")
- "description_en": describe what makes this style unique and recognizable (2-3 sentences, in English)
- "description_fr": the same description translated in French (2-3 sentences, in French)
- "prompt": a long, highly detailed English prompt (at least 150 words) that reproduces this exact visual style. Be extremely specific and descriptive — vague terms produce poor results. Describe precisely: the artistic rendering technique (e.g. "digital painting", "pencil sketch", "3D render", "vector illustration"), the medium and surface texture (e.g. "rough watercolor paper", "smooth matte plastic", "grainy film stock"), color grading and palette behavior, contrast levels, saturation, lighting setup with specific keywords (e.g. "golden hour", "studio lighting", "soft diffuse ambient light", "hard directional sunlight", "rim lighting"), depth of field and lens effects (e.g. "shallow depth of field", "bokeh", "tilt-shift"), and atmosphere/mood. It must be generic and reusable on any subject. Include {{subject}} as the main variable, {{primary_color}} for the dominant color, {{accent_color}} and {{background_color}} for the accent color. Also use {{background_color}} in the prompt. IMPORTANT: {{background_color}} is the color of the surface on which the final image will be placed after background removal. You MUST reference {{background_color}} explicitly, for example: "set against a {{background_color}} background", or "composited on a clean {{background_color}} surface". Never hardcode a background color like "white background" — always use {{background_color}} instead. You may also use {{mood}}, {{lighting}} if relevant. At the end of the prompt, append a long comma-separated list of reinforcement tags to strengthen the style interpretation (e.g. "no perspective, sharp focus, cinematic lighting, 8k, ultra detailed, volumetric light, soft shadows, photorealistic"). The more specific and descriptive the prompt, the better the results. The prompt should be professional quality, extremely descriptive, ready to copy-paste into Midjourney or Flux.
- "background_prompt": a detailed English prompt (at least 40 words) that describes ONLY a background scene or environment matching this visual style. This prompt must work in two ways: (1) as a background layer placed behind a subject, and (2) as a foreground decorative frame or overlay placed in front of the subject to create depth. Describe environment elements, patterns, textures, colors, and atmospheric effects that complement the main style. Use {{primary_color}}, {{accent_color}} and {{background_color}} variables. Do NOT include any subject in this prompt, only the scene and environment.
- "tags": an array of 3 to 6 relevant style tags (English, lowercase)

Return ONLY the raw JSON. No markdown, no code fences, no extra text.`;

// Helper: parse raw model output into JSON
function parseModelJson(raw) {
  raw = raw.trim();
  raw = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');

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
  return JSON.parse(jsonStr);
}

// Helper: call Gemini with a prompt and image
async function callGemini(analyzePrompt, dataUri) {
  const output = await replicate.run('google/gemini-3-pro', {
    input: {
      prompt: analyzePrompt,
      images: [dataUri],
      temperature: 0.7,
    }
  });
  let raw = Array.isArray(output) ? output.join('') : String(output);
  console.log('--- RAW MODEL OUTPUT ---');
  console.log(raw.slice(0, 500));
  console.log('--- END RAW OUTPUT ---');
  return parseModelJson(raw);
}

// POST analyze image with Gemini 3 Pro via Replicate
// Calls the model TWICE (standard + removebg) and returns both prompt versions
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

    // Call model twice in parallel: standard + removebg
    const [parsedStd, parsedBg] = await Promise.all([
      callGemini(ANALYZE_PROMPT_DEFAULT, dataUri),
      callGemini(ANALYZE_PROMPT_REMOVEBG, dataUri),
    ]);

    res.json({
      title: parsedStd.title || '',
      description_en: parsedStd.description_en || parsedStd.description || '',
      description_fr: parsedStd.description_fr || '',
      prompt: parsedStd.prompt || '',
      prompt_removebg: parsedBg.prompt || '',
      background_prompt: parsedStd.background_prompt || '',
      background_prompt_removebg: parsedBg.background_prompt || '',
      tags: parsedStd.tags || [],
    });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: `Erreur d'analyse : ${err.message}` });
  }
});

// POST regenerate prompts for ALL styles that have an image
app.post('/api/analyze-all', async (req, res) => {
  try {
    const styles = readStyles();
    const results = { total: styles.length, processed: 0, skipped: 0, errors: [] };

    // Prepare processable styles with their data URIs
    const processable = [];
    for (const style of styles) {
      if (!style.image) { results.skipped++; continue; }
      if (style.image.startsWith('http://') || style.image.startsWith('https://')) { results.skipped++; continue; }
      const imgPath = join(__dirname, style.image);
      if (!existsSync(imgPath)) {
        results.skipped++;
        results.errors.push(`${style.id}: image introuvable (${style.image})`);
        continue;
      }
      const imageBuffer = readFileSync(imgPath);
      const base64 = imageBuffer.toString('base64');
      const ext = extname(style.image).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'image/jpeg';
      processable.push({ style, dataUri: `data:${mimeType};base64,${base64}` });
    }

    // Process in batches of 3
    const BATCH_SIZE = 10;
    for (let i = 0; i < processable.length; i += BATCH_SIZE) {
      const batch = processable.slice(i, i + BATCH_SIZE);
      console.log(`[analyze-all] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(processable.length / BATCH_SIZE)} (${batch.map(b => b.style.id).join(', ')})`);

      const batchResults = await Promise.allSettled(batch.map(async ({ style, dataUri }) => {
        const [parsedStd, parsedBg] = await Promise.all([
          callGemini(ANALYZE_PROMPT_DEFAULT, dataUri),
          callGemini(ANALYZE_PROMPT_REMOVEBG, dataUri),
        ]);

        style.title = parsedStd.title || style.title;
        style.description_en = parsedStd.description_en || parsedStd.description || style.description_en;
        style.description_fr = parsedStd.description_fr || style.description_fr;
        style.description = style.description_fr;
        style.prompt = parsedStd.prompt || style.prompt;
        style.prompt_removebg = parsedBg.prompt || style.prompt_removebg || '';
        style.background_prompt = parsedStd.background_prompt || style.background_prompt;
        style.background_prompt_removebg = parsedBg.background_prompt || style.background_prompt_removebg || '';
        style.tags = parsedStd.tags || style.tags;

        const allText = [style.prompt, style.prompt_removebg, style.background_prompt, style.background_prompt_removebg].join(' ');
        const varMatches = [...allText.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
        style.variables = [...new Set(varMatches)];

        return style.id;
      }));

      for (let j = 0; j < batchResults.length; j++) {
        if (batchResults[j].status === 'fulfilled') {
          results.processed++;
          console.log(`[analyze-all] ✔ ${batchResults[j].value} done`);
        } else {
          const id = batch[j].style.id;
          results.errors.push(`${id}: ${batchResults[j].reason?.message || 'Unknown error'}`);
          console.error(`[analyze-all] ✖ ${id}:`, batchResults[j].reason?.message);
        }
      }
    }

    writeStyles(styles);
    buildApi(styles);

    res.json(results);
  } catch (err) {
    console.error('Analyze-all error:', err);
    res.status(500).json({ error: err.message });
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
// Helper: resolve prompt with sample variables, generate image, save locally
async function generateSinglePreview(rawPrompt, sampleVars, mode, reference_image) {
  let resolvedPrompt = rawPrompt;
  for (const [key, value] of Object.entries(sampleVars)) {
    resolvedPrompt = resolvedPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  if (resolvedPrompt.length > 1500) resolvedPrompt = resolvedPrompt.slice(0, 1500);

  console.log('--- PREVIEW PROMPT ---');
  console.log(resolvedPrompt.slice(0, 400) + '...');
  console.log('--- END PREVIEW PROMPT ---');

  let output;
  if (mode === 'direct' && reference_image) {
    const refUri = resolveImageToDataUri(reference_image);
    output = await replicate.run('prunaai/z-image-turbo-img2img', {
      input: { prompt: resolvedPrompt, image: refUri, strength: 0.75, width: 512, height: 512 }
    });
  } else {
    output = await replicate.run('prunaai/z-image-turbo', {
      input: { prompt: resolvedPrompt, width: 512, height: 512 }
    });
  }

  const imageUrl = Array.isArray(output) ? String(output[0]) : String(output);
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error('Impossible de télécharger l\'image générée');
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`;
  const destPath = join(IMAGES_DIR, filename);
  writeFileSync(destPath, buffer);
  return `images/${filename}`;
}

// Helper: delete old preview file if it exists
function deleteOldPreview(previewPath) {
  if (previewPath && previewPath.startsWith('images/preview-')) {
    const oldPath = join(__dirname, previewPath);
    if (existsSync(oldPath)) unlinkSync(oldPath);
  }
}

app.post('/api/generate-preview', async (req, res) => {
  try {
    const { prompt, prompt_removebg, reference_image, mode } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Aucun prompt fourni' });

    const sampleVars = {
      subject: 'a luxury perfume bottle',
      primary_color: 'deep navy blue',
      accent_color: 'gold',
      background_color: 'white',
      mood: 'elegant and sophisticated',
      lighting: 'soft studio lighting',
    };

    // VLM mode: describe the reference image first
    if (mode === 'vlm' && reference_image) {
      console.log('--- VLM MODE: describing reference image ---');
      const refUri = resolveImageToDataUri(reference_image);
      const vlmOutput = await replicate.run('openai/gpt-5-nano', {
        input: { prompt: IMAGE_DESCRIPTION_PROMPT, image_input: [refUri], temperature: 0.3 }
      });
      sampleVars.subject = (Array.isArray(vlmOutput) ? vlmOutput.join('') : String(vlmOutput)).trim();
      console.log('VLM subject description:', sampleVars.subject);
    }

    // Generate both previews in parallel
    const tasks = [generateSinglePreview(prompt, sampleVars, mode, reference_image)];
    if (prompt_removebg) {
      tasks.push(generateSinglePreview(prompt_removebg, sampleVars, mode, reference_image));
    }
    const [previewUrl, previewRemovebgUrl] = await Promise.all(tasks);

    // Auto-save on the style if style_id is provided
    if (req.body.style_id) {
      const styles = readStyles();
      const idx = styles.findIndex((s) => s.id === req.body.style_id);
      if (idx !== -1) {
        deleteOldPreview(styles[idx].preview_image);
        styles[idx].preview_image = previewUrl;
        if (previewRemovebgUrl) {
          deleteOldPreview(styles[idx].preview_image_removebg);
          styles[idx].preview_image_removebg = previewRemovebgUrl;
        }
        writeStyles(styles);
        buildApi(styles);
      }
    }

    const result = { url: previewUrl };
    if (previewRemovebgUrl) result.url_removebg = previewRemovebgUrl;
    res.json(result);
  } catch (err) {
    console.error('Generate preview error:', err);
    res.status(500).json({ error: `Erreur de génération : ${err.message}` });
  }
});

// POST generate all previews for all styles (concurrent processing)
app.post('/api/generate-all-previews', async (req, res) => {
  try {
    const { reference_image, mode } = req.body;
    const styles = readStyles();
    const results = [];
    const errors = [];
    const CONCURRENCY = 5;

    // Resolve VLM subject once if needed
    let vlmSubject = null;
    if (mode === 'vlm' && reference_image) {
      const refUri = resolveImageToDataUri(reference_image);
      const vlmOutput = await replicate.run('openai/gpt-5-nano', {
        input: { prompt: IMAGE_DESCRIPTION_PROMPT, image_input: [refUri], temperature: 0.3 }
      });
      vlmSubject = (Array.isArray(vlmOutput) ? vlmOutput.join('') : String(vlmOutput)).trim();
      console.log('VLM subject description:', vlmSubject);
    }

    async function processStyle(style) {
      if (!style.prompt) {
        return { type: 'error', data: { id: style.id, error: 'Pas de prompt' } };
      }

      try {
        const sampleVars = {
          subject: vlmSubject || 'a luxury perfume bottle',
          primary_color: 'deep navy blue',
          accent_color: 'gold',
          background_color: 'white',
          mood: 'elegant and sophisticated',
          lighting: 'soft studio lighting',
        };

        // Generate standard + removebg previews in parallel
        const tasks = [generateSinglePreview(style.prompt, sampleVars, mode, reference_image)];
        if (style.prompt_removebg) {
          tasks.push(generateSinglePreview(style.prompt_removebg, sampleVars, mode, reference_image));
        }
        const [previewUrl, previewRemovebgUrl] = await Promise.all(tasks);

        return { type: 'success', style, previewUrl, previewRemovebgUrl };
      } catch (err) {
        console.error(`Error generating preview for ${style.id}:`, err);
        return { type: 'error', data: { id: style.id, error: err.message } };
      }
    }

    for (let i = 0; i < styles.length; i += CONCURRENCY) {
      const batch = styles.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(processStyle));

      for (const result of batchResults) {
        if (result.type === 'success') {
          const { style, previewUrl, previewRemovebgUrl } = result;
          deleteOldPreview(style.preview_image);
          style.preview_image = previewUrl;
          if (previewRemovebgUrl) {
            deleteOldPreview(style.preview_image_removebg);
            style.preview_image_removebg = previewRemovebgUrl;
          }
          results.push({ id: style.id, preview_image: previewUrl, preview_image_removebg: previewRemovebgUrl || '' });
        } else {
          errors.push(result.data);
        }
      }

      console.log(`Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(styles.length / CONCURRENCY)} completed`);
    }

    writeStyles(styles);
    buildApi(styles);

    res.json({
      message: `Généré ${results.length}/${styles.length} previews (en parallèle)`,
      generated: results,
      errors: errors
    });

  } catch (err) {
    console.error('Generate all previews error:', err);
    res.status(500).json({ error: `Erreur : ${err.message}` });
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

    // Cleanup orphaned preview files (not referenced by any style)
    const allPreviewImages = new Set(
      styles.flatMap(s => [s.preview_image, s.preview_image_removebg]).filter(Boolean)
    );
    const files = readdirSync(IMAGES_DIR);
    let deletedCount = 0;
    for (const file of files) {
      if (file.startsWith('preview-') && file.endsWith('.webp')) {
        const filePath = `images/${file}`;
        if (!allPreviewImages.has(filePath)) {
          const fullPath = join(IMAGES_DIR, file);
          if (existsSync(fullPath)) {
            unlinkSync(fullPath);
            deletedCount++;
          }
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} orphaned preview files`);
    }

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

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, exec as execCb } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(execCb);
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
    backgroundType: s.backgroundType ?? 2,
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
  const { title, description, description_en, description_fr, prompt, prompt_removebg, background_prompt, background_prompt_removebg, image, preview_image, preview_image_removebg, tags, variables, backgroundType } = req.body;

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
    backgroundType: backgroundType ?? 2,
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

  const { title, description, description_en, description_fr, prompt, prompt_removebg, background_prompt, background_prompt_removebg, image, preview_image, preview_image_removebg, tags, variables, backgroundType } = req.body;

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
    ...(backgroundType !== undefined && { backgroundType }),
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
const ANALYZE_PROMPT = `You are a world-class art director, visual style analyst, and prompt engineer with deep expertise in art history movements, contemporary digital art pipelines, and AI image generation (Midjourney, Stable Diffusion, DALL-E, Flux).

CRITICAL RULE: Your task is to extract the VISUAL STYLE ONLY. You MUST COMPLETELY IGNORE the specific subject matter of the reference image (e.g., ignore if it's a tree, a building, a person, a car). You are creating a reusable style template. Whenever you need to refer to what is being drawn, use the exact literal string "{{subject}}" instead of the actual object in the image.

STEP 1 — DEEP VISUAL DISSECTION
Perform an exhaustive forensic analysis of the artistic execution of this image, ignoring WHAT is drawn and focusing entirely on HOW it is drawn:
- **Artistic lineage**: Which art movement(s), historical period(s), or contemporary digital trend(s) does this style reference? (e.g. "reminiscent of Alphonse Mucha's lithographic line work"). Do NOT be generic.
- **Rendering technique & medium**: Is this digital painting, cel-shading, vector flat design, impasto oil, watercolor wash, linocut, 3D subsurface scattering? Describe the exact stroke behavior: visible brushstrokes or seamless blending? Hard geometric edges or organic flowing contours?
- **Line work & contouring**: Describe outline weight, line quality, and whether contours are uniform or express pressure sensitivity.
- **Color science**: Specify: hue temperature shifts, chroma intensity, value range, color harmony scheme, and any color grading.
- **Lighting anatomy**: Identify the exact lighting setup: key light direction and quality, fill ratio, presence of rim/edge/kicker lights, light source type. Describe how light interacts with surfaces.
- **Texture & materiality**: Describe the tactile quality. Is there noise, film grain, halftone dots, canvas weave, paper fiber visible?
- **Composition & spatial dynamics**: Describe the structural approach to space, depth cues, and perspective style (e.g., flat 2D, forced perspective, isometric).
- **Movement & rhythm**: Analyze the sense of motion in the brushwork or line flow.
- **Atmosphere & emotional register**: What specific visual devices create the mood?
- **Edge treatment**: How do subject edges behave in this style? Clean vector-cut silhouette, soft feathered transitions, painterly ragged edges?

STEP 2 — GENERATE ALL PROMPT VARIANTS IN ONE PASS
Using your analysis, generate all fields below. The "prompt" and "prompt_removebg" fields MUST share the exact same stylistic DNA, wording, structure, and reinforcement tags — the ONLY difference is that "prompt_removebg" adds {{background_color}} integration for compositing on a solid surface after background removal. Do NOT write two independent prompts — write "prompt" first, then derive "prompt_removebg" from it.

Variables available: {{subject}} (main subject - USE THIS INSTEAD OF THE ACTUAL IMAGE CONTENT), {{primary_color}} (dominant color), {{accent_color}} (accent color), {{background_color}} (solid surface color for remove-bg compositing only), {{mood}}, {{lighting}} (optional).

Return ONLY a valid JSON object with these fields:
- "title": an original creative name for this style in exactly 2 words (in English, evocative and specific — e.g. "Gilded Decay", "Vapor Chrome", "Ember Woodcut")
- "description_en": describe what makes this style instantly recognizable and unique, referencing specific artistic techniques and visual hallmarks (2-3 sentences, in English)
- "description_fr": the same description translated in French (2-3 sentences, in French)
- "prompt": a long, extremely precise English prompt (at least 250 words) that reproduces this exact visual style for ANY subject. CRITICAL RULES: (1) NEVER mention the actual object from the reference image (no trees, houses, people etc). Use "{{subject}}" instead. (2) The image MUST occupy the absolute ENTIRE dedicated space. Explicitly enforce this in the prompt text: NO borders, NO frames, NO white margins, NO canvas edges, FULL BLEED to all four corners, the environment must stretch entirely across the canvas. (3) NEVER use vague filler words like "beautiful", "stunning". (4) Start with the rendering technique and medium, then describe the {{subject}} integration, then layer in lighting, color behavior, texture, and atmosphere. (5) Describe the EXACT stroke/render behavior. (6) End with a comma-separated list of 20+ reinforcement tags SPECIFIC to this style. Always include "full bleed, edge-to-edge, no border, no frame, no canvas, occupying entire space" in the tags.
- "prompt_removebg": take the "prompt" field above as the base. The wording, structure, style descriptors, and reinforcement tags must be IDENTICAL to "prompt" — only ADD/CHANGE the following: (1) replace or supplement the background description with "composited on a clean {{background_color}} surface" or "rendered against a flat {{background_color}} backdrop", (2) describe how the {{subject}}'s edges interact with {{background_color}}, (3) add {{background_color}} to the variables used. NEVER hardcode a specific color like "white background". IMPORTANT: REMOVE the tags "full bleed", "edge-to-edge", "no border", "no frame", "no canvas", "occupying entire space" from the reinforcement tag list — they do NOT apply when compositing on a solid background.
- "background_prompt": a detailed English prompt (at least 60 words) describing ONLY a pure background scene or environment matching this visual style. This is strictly a backdrop — NO frame, NO overlay, NO foreground element. Describe environmental elements (landscape, abstract shapes, atmospheric depth, light conditions, texture of the scene), their spatial arrangement, and how they reflect the style's color and lighting logic. Use {{primary_color}} and {{accent_color}} variables. Do NOT include any specific subjects, frame, border, or decorative overlay.
- "background_prompt_removebg": take the "background_prompt" field above as the base. Keep the same background scene wording, then ADD: (1) a decorative foreground frame or overlay element that matches the visual style (e.g. ornamental border, ink splatter vignette, geometric pattern frame) placed in front of the invisible subject to create depth, (2) how the scene and frame transition into or interact with the {{background_color}} surface. Use {{primary_color}}, {{accent_color}}, and {{background_color}} variables.
- "tags": an array of 4 to 8 relevant style tags (English, lowercase, specific — e.g. "cel-shading", "cross-hatching")

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
// Single model call returns all 4 prompt variants in one unified JSON response
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

    // Single model call — all 4 prompt variants generated in one pass
    const existingTitles = readStyles().map((s) => s.title).filter(Boolean);
    const titlesNote = existingTitles.length
      ? `\n\nIMPORTANT: The following titles are already taken — you MUST choose a title that is NOT in this list: ${existingTitles.map((t) => `"${t}"`).join(', ')}.`
      : '';
    const parsed = await callGemini(ANALYZE_PROMPT + titlesNote, dataUri);

    res.json({
      title: parsed.title || '',
      description_en: parsed.description_en || parsed.description || '',
      description_fr: parsed.description_fr || '',
      prompt: parsed.prompt || '',
      prompt_removebg: parsed.prompt_removebg || '',
      background_prompt: parsed.background_prompt || '',
      background_prompt_removebg: parsed.background_prompt_removebg || '',
      tags: parsed.tags || [],
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
        const parsed = await callGemini(ANALYZE_PROMPT, dataUri);

        style.title = parsed.title || style.title;
        style.description_en = parsed.description_en || parsed.description || style.description_en;
        style.description_fr = parsed.description_fr || style.description_fr;
        style.description = style.description_fr;
        style.prompt = parsed.prompt || style.prompt;
        style.prompt_removebg = parsed.prompt_removebg || style.prompt_removebg || '';
        style.background_prompt = parsed.background_prompt || style.background_prompt;
        style.background_prompt_removebg = parsed.background_prompt_removebg || style.background_prompt_removebg || '';
        style.tags = parsed.tags || style.tags;

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
  `Describe ONLY the subject matter of this image for use as a {{subject}} placeholder in a style prompt template. " +
        "Focus exclusively on WHAT is depicted: " +
        "the main subject and its pose, action, or expression (if a person: specify skin tone, ethnicity, hair color and style, facial features, body type, clothing details, accessories, shoes, jewelry, tattoos, distinctive markings...), " +
        "secondary subjects or objects present, their spatial arrangement (foreground, middle ground, background), including furniture, vehicles, buildings, plants, animals, tools, equipment, decorative items, or environmental elements, and describe any actions or interactions they are engaged in, " +
        "camera angle and framing (close-up, medium shot, wide shot, overhead, low angle, dutch angle, eye-level...), " +
        "any visible text, symbols, notable details, or brand logos/trademarks, " +
        "and any recognizable brands, company names, or product markings. " +
        "Do NOT describe: artistic style, rendering technique, color palette, lighting, textures, materials, mood, or atmosphere — these are handled separately by the style template. " +
        "Write a single factual paragraph of 50 to 100 words in English. " +
        "Do NOT start with 'this image shows' or 'a photo of'. Describe the subject directly.`;

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
app.post('/api/push', async (req, res) => {
  try {
    const syncOpts = { cwd: __dirname, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true' } };

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
    execSync('git add -A', syncOpts);

    // Check if there are changes to commit
    let statusOut = '';
    try {
      statusOut = execSync('git status --porcelain', syncOpts).toString();
    } catch (e) {
      statusOut = (e.stdout || '').toString();
    }
    if (!statusOut.trim()) {
      return res.json({ message: 'Rien à publier, tout est déjà à jour.' });
    }

    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const msg = `Update styles - ${ts}`;
    execSync(`git commit -m "${msg}"`, syncOpts);

    // Git push with longer timeout (async to avoid blocking)
    try {
      await execAsync('git push', { cwd: __dirname, encoding: 'utf8', timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    } catch (pushErr) {
      console.error('Git push error:', pushErr);
      return res.status(500).json({ error: `Erreur git push : ${pushErr.stderr || pushErr.message}` });
    }

    res.json({ message: `Publié (${styles.length} styles) — disponible sur le CDN dans ~5 min` });
  } catch (err) {
    console.error('Push error:', err);
    res.status(500).json({ error: `Erreur push : ${err.stderr || err.message}` });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n🎨 Style Manager — http://localhost:${PORT}`);
  console.log(`   API           — http://localhost:${PORT}/api/styles`);
  console.log(`   Admin         — http://localhost:${PORT}\n`);
});

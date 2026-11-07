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
import { IDEOGRAM_STYLE_MODEL, normalizeStyleModel, previewMode, buildPreviewRequest } from './style-model.js';

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
  return JSON.parse(readFileSync(DATA_FILE, 'utf-8')).map(style => ({ ...style, model: normalizeStyleModel(style.model) }));
}

function writeStyles(styles) {
  writeFileSync(DATA_FILE, JSON.stringify(styles, null, 2));
}

function buildApi(styles) {
  if (!existsSync(API_DIR)) mkdirSync(API_DIR, { recursive: true });
  if (!existsSync(STYLES_DIR)) mkdirSync(STYLES_DIR, { recursive: true });

  const index = styles.map((s) => ({
    id: s.id,
    model: normalizeStyleModel(s.model),
    title: s.title,
    description: s.description,
    description_en: s.description_en,
    description_fr: s.description_fr,
    image: s.image,
    preview_image: s.preview_image || '',
    preview_image_removebg: s.preview_image_removebg || '',
    tags: s.tags,
    video: s.video || null,
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
  const { title, description, description_en, description_fr, prompt, prompt_removebg, background_prompt, background_prompt_removebg, image, preview_image, preview_image_removebg, tags, variables, backgroundType, video, model } = req.body;

  if (!title) return res.status(400).json({ error: 'Le titre est requis' });
  const generationModel = normalizeStyleModel(model);

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  if (styles.some((s) => s.id === id)) {
    return res.status(409).json({ error: `Un style avec l'id "${id}" existe déjà` });
  }

  const style = {
    id,
    model: generationModel,
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
    video: video || null,
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

  const { title, description, description_en, description_fr, prompt, prompt_removebg, background_prompt, background_prompt_removebg, image, preview_image, preview_image_removebg, tags, variables, backgroundType, video, model } = req.body;

  const generationModel = normalizeStyleModel(model === undefined ? styles[index].model : model);

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
    model: generationModel,
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
    ...(video !== undefined && { video }),
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

const STYLE_ANALYSIS_PROMPT = `You are a world-class art director, visual style analyst, and prompt engineer with deep expertise in art history movements, contemporary digital art pipelines, and AI image generation.

CRITICAL RULE: Your task is to extract the VISUAL STYLE ONLY. You MUST COMPLETELY IGNORE the specific subject matter of the reference image (e.g., ignore if it's a tree, a building, a person, a car). You are creating a reusable style template. Whenever you need to refer to what is being drawn, use the exact literal string "{{subject}}" instead of the actual object in the image.

IMPORTANT CONTEXT: In production, {{subject}} may be a full scene brief, not a short noun. It can contain landscape layout, camera angle, foreground/background relationships, visible text, and explicit absences such as "no people" or "no buildings". Every generated prompt must treat {{subject}} as locked factual content and must preserve its composition, subject count, camera/framing, spatial relationships, visible/absent objects, and text/logo constraints. Apply style around that scene brief; do not overwrite it with a fixed portrait, product-shot, centered icon, or character composition unless the style itself absolutely requires that treatment.

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
Variables available (use ONLY these, no others): {{subject}} (complete user scene brief — USE THIS INSTEAD OF THE ACTUAL IMAGE CONTENT), {{primary_color}} (dominant color), {{accent_color}} (accent color), {{secondary_color}} (secondary/supporting color), {{background_color}} (solid surface color for remove-bg compositing only).`;

const Z_IMAGE_TURBO_STYLE_PROMPT_RULES = `
Write four reusable English prompt strings for Z-Image Turbo. Describe the finished image in detailed, concrete sentences. Specify visible characteristics such as the thickness and regularity of contours, the shape and density of marks, the direction and hardness of shadows, and the scale and distribution of texture when they distinguish the reference style. Describe the intended appearance affirmatively, for example "uniform flat color fills" or "an open, empty foreground." Avoid negative-prompt blocks, tag lists, weighting syntax, quality labels, and abstract comparisons. Only the outer response is JSON.

Keep the scene brief's subject count, placement, viewpoint, framing, and exact text. Do not invent content, fixed camera angles, or typography. Use literal text only from the scene brief and preserve its wording, case, and placement. Use {{primary_color}}, {{accent_color}}, and {{secondary_color}} for specific roles while retaining the reference style's contrast, saturation, and color relationships.

- "prompt": begin with the literal {{subject}} on its own line. Then write a detailed rendering description of around 130 to 190 words, prioritizing the medium and signature marks first, then color, lighting, texture, and depth. Describe how the rendering carries across the full canvas to all four edges.
- "prompt_removebg": start with the same {{subject}} and retain the same rendering details. Replace the full-canvas treatment with a uniform {{background_color}} surface that cleanly separates the subject's silhouette. Preserve the subject placement and crop, including intentional clipping at an edge.
- "background_prompt": describe a subject-free environment in the same medium and palette. Specify the arrangement, depth, lighting, materials and texture, with an open foreground. Use the three palette variables and omit {{subject}}.
- "background_prompt_removebg": retain that environment and add a style-matched decorative overlay in the foreground, keeping the center open. Describe its placement, scale, and transition to {{background_color}}. Use the three palette variables and omit {{subject}}.`;

const IDEOGRAM_STYLE_PROMPT_RULES = `
Write four reusable English prompt strings for Pruna P-Image-Ideogram. Use short natural-language descriptions of the finished image, with concrete visual details and affirmative phrasing. Avoid keyword stacks, weight syntax, quality boosters, repetitive prohibitions, and references to an input image the generator cannot see. Only the outer response is JSON.

Capture the reference's most distinctive visible traits first. Describe observable marks, edges, shapes, light and shadow, and surface texture using concrete terms. Preserve the reference's palette relationships (value, saturation, contrast, and placement) while assigning {{primary_color}}, {{accent_color}}, and {{secondary_color}} to their actual visual roles. Include only characteristics supported by the image. Keep perspective and composition flexible so the style can follow the scene brief.

- "prompt": begin with the literal {{subject}} on its own line, then describe the rendering in a compact paragraph of around 70 to 110 words. The scene brief determines the framing, subject count, spatial relationships and any literal in-image text. Use a single positive instruction for a full-bleed composition.
- "prompt_removebg": keep the same opening {{subject}} and the same rendering details. Replace the full-bleed instruction with a clean, uniform {{background_color}} backdrop behind the scene's main elements, preserving their positions, crop and silhouettes. This backdrop replaces the environmental background.
- "background_prompt": describe a cohesive, empty environment in the same medium, palette, lighting and texture. Give concrete spatial cues and keep the foreground open. Use the three palette variables and omit {{subject}}.
- "background_prompt_removebg": keep the same environment, add a style-matched foreground overlay around the edges with an open center, and describe its transition to {{background_color}}. Use the three palette variables and omit {{subject}}.`;

const STYLE_METADATA_PROMPT = `

Return ONLY a valid JSON object containing the four prompt strings above and these fields:
- "title": an original creative name for this style in exactly 2 words (in English, evocative and specific — e.g. "Gilded Decay", "Vapor Chrome", "Ember Woodcut")
- "description_en": describe what makes this style instantly recognizable and unique, referencing specific artistic techniques and visual hallmarks (2-3 sentences, in English)
- "description_fr": the same description translated in French (2-3 sentences, in French)
- "tags": one array combining 4 to 8 precise style tags (e.g. "cel-shading", "cross-hatching") with 3 to 6 general search tags. All newly generated tags MUST be in English, lowercase, unique, and individually stored as separate array entries. For general tags, use the following shared vocabulary whenever applicable: "childlike", "playful", "serious", "professional", "technical", "pencil", "drawing", "sketch", "painting", "watercolor", "gouache", "ink", "charcoal", "engraving", "collage", "photography", "3d", "vector", "minimalist", "geometric", "retro", "soft", "colorful", "dark", "dreamy", "comic", "pixel-art", "handcrafted". Select tags describing the visual mood, medium, or rendering approach, so users can find styles with everyday words. Only include tags supported by the visual style; do not tag reference-image objects or assume that every playful, pastel, or cartoon style is childlike. Use "technical" for technical diagrams or drafting, and "pencil" for graphite, colored-pencil, or wax-crayon rendering. Keep precise tags as well; do not replace them with general tags. Canvas instructions such as "full bleed", "no border", and "no frame" belong in prompts, not in this search-tag array.

Also include a "video" object with reusable video guidance for this visual style. It must apply to ANY {{subject}} and must never mention the reference image content. Include exactly these string fields: "motion" (1-2 sentences describing how subjects and scene elements should animate in this style), "camera" (1 sentence describing the preferred camera grammar), "temporal_texture" (1 sentence describing how grain, strokes, edges, lighting, shadows, and materials must remain stable or animate over time), and "avoid" (1 sentence listing video artifacts or motion choices that would break the style).

Return ONLY the raw JSON. No markdown, no code fences, no extra text.`;

function styleAnalysisPrompt(model) {
  const rules = model === IDEOGRAM_STYLE_MODEL ? IDEOGRAM_STYLE_PROMPT_RULES : Z_IMAGE_TURBO_STYLE_PROMPT_RULES;
  return STYLE_ANALYSIS_PROMPT + rules + STYLE_METADATA_PROMPT;
}

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
  const output = await replicate.run('google/gemini-3.1-pro', {
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
    const model = normalizeStyleModel(req.body?.model);
    const parsed = await callGemini(styleAnalysisPrompt(model) + titlesNote, dataUri);

    res.json({
      title: parsed.title || '',
      description_en: parsed.description_en || parsed.description || '',
      description_fr: parsed.description_fr || '',
      prompt: parsed.prompt || '',
      prompt_removebg: parsed.prompt_removebg || '',
      background_prompt: parsed.background_prompt || '',
      background_prompt_removebg: parsed.background_prompt_removebg || '',
      video: parsed.video || null,
      tags: parsed.tags || [],
    });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(err.status || 500).json({ error: `Erreur d'analyse : ${err.message}` });
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
        const parsed = await callGemini(styleAnalysisPrompt(style.model), dataUri);

        style.title = parsed.title || style.title;
        style.description_en = parsed.description_en || parsed.description || style.description_en;
        style.description_fr = parsed.description_fr || style.description_fr;
        style.description = style.description_fr;
        style.prompt = parsed.prompt || style.prompt;
        style.prompt_removebg = parsed.prompt_removebg || style.prompt_removebg || '';
        style.background_prompt = parsed.background_prompt || style.background_prompt;
        style.background_prompt_removebg = parsed.background_prompt_removebg || style.background_prompt_removebg || '';
        style.video = parsed.video || style.video || null;
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

const Z_IMAGE_TURBO_SUBJECT_DESCRIPTION_PROMPT = `Describe the main subject's visual identity in this image for a Z-Image Turbo restyling prompt. The original image provides the framing and layout. Return only a compact English description of the subject and its pose, in one paragraph.

Start with the exact type or species, count, and pose. Then describe the most distinctive visible features in concrete terms. For a face, cover the head shape, ear shape, eye size and color relative to the face, and distinctive markings or expression when visible. For an object, cover its outline, materials and identifying details. Mention subject colors that are essential to recognition and nearby objects only if they help explain the pose or action. Transcribe legible text on the subject verbatim in double quotes as visual content.

Use the visible evidence only. Describe the subject itself, leaving out scenery, rendering style, metadata, and guesses.`;

const Z_IMAGE_TURBO_SCENE_DESCRIPTION_PROMPT = `Write a factual English paragraph describing this scene for Z-Image Turbo. A separate template supplies the visual style. Output only the scene description, around 80 to 130 words.

Begin with the main subjects, their exact count, shapes, positions, pose or action, and their distinctive visible details. Describe their relative sizes and overlaps, the viewpoint and crop, and where the major foreground and background elements appear. Include visible materials, important colors, and the direction of light only when they help identify the scene. Describe meaningful empty areas concretely.

For visible writing, transcribe the legible text exactly in double quotes, with its placement and size. Treat that writing as visual content. Use objective descriptions of visible facts, without invented elements, stylistic labels, metaphors, or quality tags.`;

const IDEOGRAM_SCENE_DESCRIPTION_PROMPT = `Write a concise English caption of the visible scene for P-Image-Ideogram, which receives this caption as text and cannot see the image. Another prompt supplies the rendering style. Output only the caption.

Open with the main subject, its count, pose or action, and its location and size within the frame. Describe the viewpoint, crop, orientation and the most recognizable shapes and details. Anchor each important element with concrete positions and relationships such as lower left, behind, overlapping, or taking up the upper third. Describe the environment, light direction when visible, and any large areas of empty space.

Transcribe only legible text verbatim in double quotes, preserving spelling, case and language. For each text element describe its placement, scale and lettering. Treat the text as visual content. When no text is legible, specify that the image contains no readable text. Describe only what is visible and avoid adding subjects, a story, or stylistic effects. Use natural sentences, around 80 to 130 words excluding any literal text.`;

async function describeReference(image, prompt) {
  const output = await replicate.run('openai/gpt-5-nano', {
    input: { prompt, image_input: [image], temperature: 0.3 }
  });
  const subject = normalizePromptText(Array.isArray(output) ? output.join('') : output);
  if (!subject) throw new Error("Le modèle n'a pas pu décrire l'image de référence");
  console.log('VLM subject description:', subject);
  return subject;
}

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

async function preparePreviewReference(model, mode, referenceImage) {
  const referenceMode = previewMode(model, mode, referenceImage);
  if (!referenceImage || (referenceMode !== 'direct' && referenceMode !== 'vlm')) return {};

  const image = resolveImageToDataUri(referenceImage);
  if (referenceMode === 'direct') {
    try {
      return { image, subject: await describeReference(image, Z_IMAGE_TURBO_SUBJECT_DESCRIPTION_PROMPT) };
    } catch (err) {
      console.warn('Preview subject description failed:', err.message);
      return { image, subject: 'the scene in the input image, with its original subjects, framing and composition' };
    }
  }

  const prompt = model === IDEOGRAM_STYLE_MODEL ? IDEOGRAM_SCENE_DESCRIPTION_PROMPT : Z_IMAGE_TURBO_SCENE_DESCRIPTION_PROMPT;
  return { subject: await describeReference(image, prompt) };
}

// POST generate preview image with the style model on Replicate
// Two modes:
//   "direct"  → Z-Image Turbo img2img with the reference image and its subject description
//   "vlm"     → describe reference image with openai/gpt-5-nano, then use the style's text-to-image model
const PREVIEW_PROMPT_CHAR_LIMIT = 3500;
const DEFAULT_PREVIEW_SETTINGS = {
  subject: 'a luxury perfume bottle',
  primary_color: 'deep navy blue',
  accent_color: 'gold',
  secondary_color: 'ivory',
  background_color: 'white',
  strength: 0.75,
  width: 512,
  height: 512,
};
const PROMPT_VARIABLE_FALLBACKS = {
  mood: 'cinematic and polished',
  lighting: 'natural directional light matching the described scene',
};

function normalizePromptText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimPromptAtBoundary(prompt, maxChars = PREVIEW_PROMPT_CHAR_LIMIT) {
  if (prompt.length <= maxChars) return prompt;

  const cut = prompt.slice(0, maxChars);
  const lastBoundary = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('; '),
    cut.lastIndexOf(', ')
  );

  if (lastBoundary > Math.floor(maxChars * 0.75)) {
    const trimmed = cut.slice(0, lastBoundary + 1).trim().replace(/[;,]$/, '.');
    return `${trimmed} Quality constraints: preserve the described composition, factual details, and stated exclusions.`;
  }

  return `${cut.trim()} Quality constraints: preserve the described composition, factual details, and stated exclusions.`;
}

function resolvePromptVariables(rawPrompt, sampleVars) {
  return rawPrompt.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = Object.hasOwn(sampleVars, key) ? sampleVars[key] : PROMPT_VARIABLE_FALLBACKS[key];
    return typeof value === 'string' ? normalizePromptText(value) : '';
  });
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function describeColor(value) {
  const color = String(value || '').trim();
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;

  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${color} (rgb ${r}, ${g}, ${b})`;
}

function getPreviewSettings(input = {}) {
  const settings = { ...DEFAULT_PREVIEW_SETTINGS };
  for (const key of ['primary_color', 'accent_color', 'secondary_color', 'background_color']) {
    if (typeof input[key] === 'string' && input[key].trim()) {
      settings[key] = describeColor(input[key]);
    }
  }
  settings.strength = clampNumber(input.strength, DEFAULT_PREVIEW_SETTINGS.strength, 0, 1);
  settings.width = clampNumber(input.width, DEFAULT_PREVIEW_SETTINGS.width, 256, 1024);
  settings.height = clampNumber(input.height, DEFAULT_PREVIEW_SETTINGS.height, 256, 1024);
  return settings;
}

// Helper: resolve prompt with sample variables, generate image, save locally
async function generateSinglePreview(rawPrompt, reference, previewSettings, model) {
  const template = String(rawPrompt || '');
  const { image, subject = previewSettings.subject } = reference;
  const stylePrompt = resolvePromptVariables(template, { ...previewSettings, subject });
  const prompt = reference.subject && !template.includes('{{subject}}')
    ? `${subject}\n\n${stylePrompt}`
    : stylePrompt;
  const resolvedPrompt = trimPromptAtBoundary(model === IDEOGRAM_STYLE_MODEL ? prompt.trim() : normalizePromptText(prompt));

  console.log('--- PREVIEW PROMPT ---');
  console.log(resolvedPrompt.slice(0, 400) + '...');
  console.log('--- END PREVIEW PROMPT ---');

  const request = buildPreviewRequest(model, resolvedPrompt, previewSettings, image);
  const output = await replicate.run(request.model, { input: request.input });

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
    const savedStyle = req.body.style_id ? readStyles().find(style => style.id === req.body.style_id) : null;
    const model = normalizeStyleModel(req.body.model === undefined ? savedStyle?.model : req.body.model);
    if (!prompt) return res.status(400).json({ error: 'Aucun prompt fourni' });

    const previewSettings = getPreviewSettings(req.body.preview_settings);
    const reference = await preparePreviewReference(model, mode, reference_image);

    // Generate both previews in parallel
    const tasks = [generateSinglePreview(prompt, reference, previewSettings, model)];
    if (prompt_removebg) {
      tasks.push(generateSinglePreview(prompt_removebg, reference, previewSettings, model));
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
    res.status(err.status || 500).json({ error: `Erreur de génération : ${err.message}` });
  }
});

// POST generate all previews for all styles (concurrent processing)
app.post('/api/generate-all-previews', async (req, res) => {
  try {
    const { reference_image, mode } = req.body;
    const previewSettings = getPreviewSettings(req.body.preview_settings);
    const styles = readStyles();
    const results = [];
    const errors = [];
    const CONCURRENCY = 5;

    // Reuse each model's prepared reference across styles and preview variants.
    const references = new Map();

    async function processStyle(style) {
      if (!style.prompt) {
        return { type: 'error', data: { id: style.id, error: 'Pas de prompt' } };
      }

      try {
        const model = normalizeStyleModel(style.model);
        if (!references.has(model)) {
          references.set(model, preparePreviewReference(model, mode, reference_image));
        }
        const reference = await references.get(model);

        // Generate standard + removebg previews in parallel
        const tasks = [generateSinglePreview(style.prompt, reference, previewSettings, model)];
        if (style.prompt_removebg) {
          tasks.push(generateSinglePreview(style.prompt_removebg, reference, previewSettings, model));
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

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n🎨 Style Manager — http://localhost:${PORT}`);
  console.log(`   API           — http://localhost:${PORT}/api/styles`);
  console.log(`   Admin         — http://localhost:${PORT}\n`);
});

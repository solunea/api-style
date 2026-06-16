import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'styles.json');

const styles = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

function textOf(style) {
  return [
    style.id,
    style.title,
    style.description_en,
    style.description,
    style.prompt,
    style.background_prompt,
    Array.isArray(style.tags) ? style.tags.join(' ') : ''
  ].filter(Boolean).join(' ').toLowerCase();
}

function labelOf(style) {
  return [
    style.id,
    style.title,
    Array.isArray(style.tags) ? style.tags.join(' ') : ''
  ].filter(Boolean).join(' ').toLowerCase();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function guidanceFor(style) {
  const t = textOf(style);
  const l = labelOf(style);

  if (['pastel-clay', 'felted-whimsy', 'matte-plasticine', 'miniature-diorama', 'tactile-diorama'].includes(style.id)) {
    return {
      motion: 'Animate with smooth physical movement, small object rotations, gentle character gestures, and subtle material-light interaction.',
      camera: 'Use a polished product-style slow orbit, push-in, or stable tracking move that shows depth without destabilizing the subject.',
      temporal_texture: 'Matte surfaces, bevels, soft shadows, ambient occlusion, translucency, and global illumination should remain physically consistent.',
      avoid: 'Avoid rubbery deformation, flickering shadows, sudden perspective jumps, unstable geometry, and excessive motion blur.'
    };
  }

  if (['stippled-mirage', 'granular-airbrush', 'luminous-noise', 'hybrid-daydream'].includes(style.id)) {
    return {
      motion: 'Animate with slow flowing light, gentle gradient drift, soft atmospheric breathing, and minimal subject motion that feels dreamlike.',
      camera: 'Use a smooth slow push-in, floating pan, or locked shot with delicate light movement.',
      temporal_texture: 'Soft gradients, stipple grain, glow, bloom, light leaks, and feathered edges should move fluidly but stay coherent between frames.',
      avoid: 'Avoid hard cuts, sharp jitter, harsh outlines, aggressive camera movement, and random grain flicker that breaks the calm luminous style.'
    };
  }

  if (includesAny(l, ['isometric', 'isometry', 'technical', 'diagram', 'schematic', 'blueprint', 'draft', 'topology'])) {
    return {
      motion: 'Animate elements as precise mechanical or instructional movement: clean stepwise reveals, measured sliding parts, subtle assembly motion, and readable directional flow.',
      camera: 'Use an orthographic or pseudo-isometric camera with slow pans, small dolly moves, or locked framing; avoid deep cinematic perspective shifts.',
      temporal_texture: 'Line weight, flat fills, registration marks, arrows, grids, and schematic textures must remain perfectly stable from frame to frame.',
      avoid: 'Avoid organic morphing, handheld camera shake, depth-of-field blur, elastic motion, noisy texture boiling, and perspective changes that break the diagrammatic style.'
    };
  }

  if (includesAny(l, ['low-poly', 'lowpoly', 'retro 3d', 'aliased'])) {
    return {
      motion: 'Animate subjects with rigid, game-engine-like movement, simple rotations, stepped pose changes, and clear low-polygon transformations.',
      camera: 'Use a restrained retro game camera: slow orbit, fixed-angle tracking, or simple dolly with visible low-poly spatial depth.',
      temporal_texture: 'Aliased edges, pixelated texture maps, flat lighting, baked shadows, and low-resolution UV artifacts must remain stable and intentionally crisp.',
      avoid: 'Avoid smooth modern CGI deformation, motion blur, realistic fluid simulation, high-frequency camera shake, and texture filtering that removes the retro artifacts.'
    };
  }

  if (includesAny(l, ['film noir', 'noir', 'chiaroscuro']) || (includesAny(t, ['silver gelatin', '1940s film noir']) && includesAny(t, ['bokeh', 'volumetric haze']))) {
    return {
      motion: 'Animate with slow, suspenseful movement: drifting smoke, shifting rim light, subtle subject motion, and restrained atmospheric changes.',
      camera: 'Use classic cinematic grammar such as a slow push-in, locked tripod shot, or very gentle lateral dolly through haze.',
      temporal_texture: 'Analog grain, halation, deep shadows, bokeh, and volumetric haze should shimmer subtly while preserving stable silhouettes and contrast.',
      avoid: 'Avoid bright flat lighting, fast cuts, wobbling exposure, unstable identity, heavy warping, and camera moves that destroy the noir mood.'
    };
  }

  if (includesAny(l, ['gouache', 'crayon', 'storybook', 'folklore', 'radiant scumble', 'solar gouache', 'luminous gouache', 'naive gouache'])) {
    return {
      motion: 'Animate like a gentle illustrated storybook: small character gestures, soft parallax between paper layers, and calm environmental movement.',
      camera: 'Prefer locked framing or a slow push-in that preserves the flat layered composition.',
      temporal_texture: 'Gouache edges, wax pastel marks, pencil scratches, paper grain, and dry-brush texture must stay tactile and stable without flicker.',
      avoid: 'Avoid realistic 3D depth, liquid morphing, aggressive camera motion, excessive texture boiling, and any movement that breaks the handmade paper feel.'
    };
  }

  if (includesAny(l, ['doodle', 'sketch', 'scribble', 'comic', 'cartoon', 'monoline', 'ligne claire', 'ligne'])) {
    return {
      motion: 'Animate with playful graphic timing: snappy poses, small squash-and-stretch accents, moving action lines, and simple cut-out style motion.',
      camera: 'Use mostly locked framing with occasional quick but readable push-ins or pans that feel like a comic panel coming alive.',
      temporal_texture: 'Ink outlines, flat fills, graphic marks, patterns, and hand-drawn irregularities should remain coherent and not crawl randomly.',
      avoid: 'Avoid realistic motion capture, smeared anatomy, noisy line jitter, uncontrolled morphing, and cinematic blur that weakens the graphic readability.'
    };
  }

  if (includesAny(l, ['vector', 'flat', 'bauhaus', 'geometry', 'silhouette', 'cutout', 'flatland', 'pixel', 'anime', 'pulp'])) {
    return {
      motion: 'Animate with clean, readable vector motion: simple translations, rotations, scale changes, and minimal cel-shaded depth changes.',
      camera: 'Use stable composition with a subtle push-in, pan, or tracking move only when it supports the main subject.',
      temporal_texture: 'Flat fills, crisp silhouettes, clean gradients or cel shadows, and geometric edges must remain sharp and temporally consistent.',
      avoid: 'Avoid painterly flicker, uncontrolled shape melting, excessive depth-of-field, noisy textures, and motion that makes flat shapes lose their clarity.'
    };
  }

  if (includesAny(l, ['watercolor', 'wash', 'impressionist', 'ripples'])) {
    return {
      motion: 'Animate softly with slow atmospheric drift, gentle subject movement, and subtle watercolor wash breathing rather than hard mechanical motion.',
      camera: 'Use a slow push-in or locked shot that preserves the delicate paper composition.',
      temporal_texture: 'Pigment blooms, paper fibers, soft edges, translucent washes, and ink boundaries should remain calm and stable with only slight organic diffusion.',
      avoid: 'Avoid fast camera moves, hard CGI deformation, heavy edge jitter, over-sharpening, and wash flicker that looks like compression noise.'
    };
  }

  if (includesAny(l, ['risograph', 'riso', 'serigraph'])) {
    return {
      motion: 'Animate with restrained graphic movement, slight parallax, and slow environmental changes that preserve the printed composition.',
      camera: 'Use locked framing, gentle pan, or slow push-in; keep the camera motion simple enough for the print texture to remain legible.',
      temporal_texture: 'Riso grain, stipple, halftone dots, misregistration, and ink coverage must stay anchored to surfaces without random crawling.',
      avoid: 'Avoid noisy grain boiling, high-speed motion, smooth plastic CGI, excessive blur, and morphing that erases the printed texture.'
    };
  }

  if (includesAny(l, ['airbrush', 'mirage', 'luminous-noise', 'granular-airbrush', 'daydream'])) {
    return {
      motion: 'Animate with slow flowing light, gentle gradient drift, soft atmospheric breathing, and minimal subject motion that feels dreamlike.',
      camera: 'Use a smooth slow push-in, floating pan, or locked shot with delicate light movement.',
      temporal_texture: 'Soft gradients, stipple grain, glow, bloom, light leaks, and feathered edges should move fluidly but stay coherent between frames.',
      avoid: 'Avoid hard cuts, sharp jitter, harsh outlines, aggressive camera movement, and random grain flicker that breaks the calm luminous style.'
    };
  }

  if (includesAny(l, ['3d', 'cgi', 'clay', 'plastic', 'plasticine', 'diorama', 'miniature', 'felted'])) {
    return {
      motion: 'Animate with smooth physical movement, small object rotations, gentle character gestures, and subtle material-light interaction.',
      camera: 'Use a polished product-style slow orbit, push-in, or stable tracking move that shows depth without destabilizing the subject.',
      temporal_texture: 'Matte surfaces, bevels, soft shadows, ambient occlusion, translucency, and global illumination should remain physically consistent.',
      avoid: 'Avoid rubbery deformation, flickering shadows, sudden perspective jumps, unstable geometry, and excessive motion blur.'
    };
  }

  if (includesAny(l, ['oil', 'impasto', 'painterly', 'canvas', 'opulence', 'intaglio', 'woodcut', 'linocut', 'charcoal', 'graphite'])) {
    return {
      motion: 'Animate as a living painting with slow subject movement, gentle parallax, and restrained changes in brush-defined light and atmosphere.',
      camera: 'Use a locked shot or slow museum-like push-in that lets brushwork and canvas texture remain readable.',
      temporal_texture: 'Brushstrokes, impasto ridges, canvas grain, edge softness, and painterly lighting should stay anchored and avoid frame-to-frame crawling.',
      avoid: 'Avoid watery morphing, rapid camera motion, unstable strokes, sharp digital edges, and texture flicker.'
    };
  }

  return {
    motion: 'Animate the scene with subtle, style-preserving movement that follows the subject while keeping the original composition readable.',
    camera: 'Use a restrained camera move such as locked framing, a slow push-in, or a gentle pan chosen to match the visual style.',
    temporal_texture: 'Keep the style-defining texture, edges, lighting, color treatment, and material behavior temporally stable across frames.',
    avoid: 'Avoid abrupt camera jumps, excessive motion blur, texture flicker, uncontrolled morphing, unstable identity, and any movement that contradicts the visual style.'
  };
}

let updated = 0;
for (const style of styles) {
  style.video = guidanceFor(style);
  updated++;
}

writeFileSync(DATA_FILE, JSON.stringify(styles, null, 2));
console.log(`Filled video guidance for ${updated} styles.`);

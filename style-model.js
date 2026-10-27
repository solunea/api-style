export const DEFAULT_STYLE_MODEL = 'prunaai/z-image-turbo';
export const STYLE_MODELS = [DEFAULT_STYLE_MODEL, 'prunaai/p-image-ideogram'];

export function normalizeStyleModel(model = DEFAULT_STYLE_MODEL) {
  if (!STYLE_MODELS.includes(model)) {
    throw Object.assign(new Error('Modèle de génération non pris en charge'), { status: 400 });
  }
  return model;
}

export function previewMode(model, mode, referenceImage) {
  return model === 'prunaai/p-image-ideogram' && referenceImage ? 'vlm' : mode;
}

export function buildPreviewRequest(model, prompt, settings, referenceImage) {
  if (model === 'prunaai/p-image-ideogram') {
    const width = Math.round(settings.width / 16) * 16;
    const height = Math.round(settings.height / 16) * 16;
    return {
      model,
      input: {
        prompt, thinking: 'low', prompt_upsampling: true,
        aspect_ratio: 'custom',
        image_size: Math.max(width, height) > 1024 ? '2K' : '1K',
        width,
        height,
        output_format: 'webp', output_quality: 100
      }
    };
  }
  return {
    model: referenceImage ? 'prunaai/z-image-turbo-img2img' : model,
    input: {
      prompt, width: settings.width, height: settings.height,
      ...(referenceImage ? { image: referenceImage, strength: settings.strength } : {})
    }
  };
}

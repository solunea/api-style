export const DEFAULT_STYLE_MODEL = 'prunaai/z-image-turbo';
export const IDEOGRAM_STYLE_MODEL = 'prunaai/p-image-ideogram';
export const STYLE_MODELS = [DEFAULT_STYLE_MODEL, IDEOGRAM_STYLE_MODEL];
const Z_IMAGE_TURBO_IMG2IMG = 'prunaai/z-image-turbo-img2img:7142e836070262fece6f2c4356aec87e9aec27bf31c65ef6b3983e0153e9518c';

export function normalizeStyleModel(model = DEFAULT_STYLE_MODEL) {
  if (!STYLE_MODELS.includes(model)) {
    throw Object.assign(new Error('Modèle de génération non pris en charge'), { status: 400 });
  }
  return model;
}

export function previewMode(model, mode, referenceImage) {
  return model === IDEOGRAM_STYLE_MODEL && referenceImage ? 'vlm' : mode;
}

export function buildPreviewRequest(model, prompt, settings, referenceImage) {
  if (model === IDEOGRAM_STYLE_MODEL) {
    return {
      model,
      input: {
        prompt, thinking: 'low', prompt_upsampling: true,
        aspect_ratio: 'custom',
        width: Math.round(settings.width / 16) * 16,
        height: Math.round(settings.height / 16) * 16,
        output_format: 'webp', output_quality: 100
      }
    };
  }
  if (referenceImage) {
    return {
      model: Z_IMAGE_TURBO_IMG2IMG,
      input: { prompt, image: referenceImage, strength: settings.strength, output_format: 'webp' }
    };
  }
  return { model, input: { prompt, width: settings.width, height: settings.height } };
}

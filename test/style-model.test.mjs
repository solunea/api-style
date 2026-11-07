import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {DEFAULT_STYLE_MODEL, IDEOGRAM_STYLE_MODEL as pImage, normalizeStyleModel, previewMode, buildPreviewRequest} from '../style-model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const reference = 'images/reference.png';
const scene = 'A forest beside a lake. The sign reads "R&D $& {{primary_color}}".';

// Exercise the real routes and export builder against in-memory storage and Replicate.
function server(styles = []) {
  const files = new Map([
    [path.join(root, 'data', 'styles.json'), JSON.stringify(styles)],
    [path.join(root, reference), Buffer.from('image')]
  ]);
  const routes = new Map(), calls = [];
  const app = {use() {}, listen() {}};
  for (const method of ['get', 'post', 'put', 'delete']) app[method] = (route, ...handlers) => routes.set(`${method} ${route}`, handlers.at(-1));
  const express = Object.assign(() => app, {json() {}, static() {}});
  const replicate = {run: async (model, {input}) => {
    calls.push({model, input});
    if (model === 'google/gemini-3.1-pro') return JSON.stringify({prompt: '{{subject}}'});
    if (model === 'openai/gpt-5-nano') return [scene];
    return ['https://example.test/image.webp'];
  }};
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replaceAll('import.meta.url', JSON.stringify(new URL('../server.js', import.meta.url).href));
  vm.runInNewContext(source, {
    ...path, fileURLToPath, IDEOGRAM_STYLE_MODEL: pImage, normalizeStyleModel, previewMode, buildPreviewRequest,
    express, cors() {}, multer: () => ({single: () => () => {}}), Replicate: function () {return replicate;},
    readFileSync: file => files.get(file), writeFileSync: (file, data) => files.set(file, data),
    existsSync: file => files.has(file), mkdirSync() {}, unlinkSync: file => files.delete(file),
    promisify: () => () => {}, execCb() {},
    process: {env: {}}, console: {log() {}, error() {}}, Buffer,
    fetch: async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(8)})
  });
  return {
    files, calls,
    async request(method, route, body = {}, id, file) {
      const result = {status: 200};
      const response = {status(code) {result.status = code; return this;}, json(data) {result.body = JSON.parse(JSON.stringify(data));}};
      try {await routes.get(`${method} ${route}`)({body, params: {id}, file}, response);}
      catch (error) {result.status = error.status || 500; result.body = {error: error.message};}
      return result;
    }
  };
}

test('creation, partial update, validation and JSON exports retain each style model', async () => {
  const api = server();
  for (const [title, model] of [['Default', undefined], ['Ideogram', pImage]]) {
    const result = await api.request('post', '/api/styles', {title, model});
    assert.equal(result.status, 201);
    assert.equal(result.body.model, model || DEFAULT_STYLE_MODEL);
  }
  const updated = await api.request('put', '/api/styles/:id', {title: 'Renamed'}, 'ideogram');
  assert.equal(updated.body.model, pImage);
  const before = api.files.get(path.join(root, 'data', 'styles.json'));
  for (const model of ['', null, 'other/model']) {
    assert.equal((await api.request('put', '/api/styles/:id', {model}, 'ideogram')).status, 400);
    assert.equal((await api.request('post', '/api/styles', {title: 'Invalid', model})).status, 400);
    assert.equal(api.files.get(path.join(root, 'data', 'styles.json')), before);
  }
  const index = JSON.parse(api.files.get(path.join(root, 'api', 'styles.json')));
  assert.deepEqual(index.map(style => style.model), [DEFAULT_STYLE_MODEL, pImage]);
  assert.equal(JSON.parse(api.files.get(path.join(root, 'api', 'styles', 'ideogram.json'))).model, pImage);
  const changed = await api.request('put', '/api/styles/:id', {model: DEFAULT_STYLE_MODEL}, 'ideogram');
  assert.equal(changed.body.model, DEFAULT_STYLE_MODEL);
});

test('legacy styles expose Z-Image Turbo without changing their prompts', async () => {
  const api = server([{id: 'old', prompt: '{{subject}}'}]);
  const result = await api.request('get', '/api/styles/:id', {}, 'old');
  assert.equal(result.body.model, DEFAULT_STYLE_MODEL);
  assert.equal(result.body.prompt, '{{subject}}');
});

test('image analysis uses the selected prompt profile for uploaded and stored images', async () => {
  const api = server();
  for (const [body, file] of [
    [{model: pImage, image_path: reference}],
    [{model: pImage}, {path: path.join(root, reference), mimetype: 'image/png'}]
  ]) {
    assert.equal((await api.request('post', '/api/analyze', body, undefined, file)).status, 200);
    const {prompt} = api.calls.at(-1).input;
    assert.match(prompt, /four reusable English prompt strings for Pruna P-Image-Ideogram/);
    assert.match(prompt, /begin with the literal \{\{subject\}\}/);
    assert.doesNotMatch(prompt, /130 to 190 words/);
  }
});

test('batch analysis uses the saved model and defaults legacy styles to Z-Image Turbo', async () => {
  const api = server([{id: 'z', image: reference}, {id: 'p', model: pImage, image: reference}]);
  assert.equal((await api.request('post', '/api/analyze', {image_path: reference, model: 'bad'})).status, 400);
  assert.equal(api.calls.length, 0);
  assert.equal((await api.request('post', '/api/analyze', {image_path: reference})).status, 200);
  assert.match(api.calls[0].input.prompt, /four reusable English prompt strings for Z-Image Turbo/);
  assert.match(api.calls[0].input.prompt, /Avoid negative-prompt blocks/);
  const result = await api.request('post', '/api/analyze-all');
  assert.equal(result.body.processed, 2);
  assert.match(api.calls[1].input.prompt, /130 to 190 words/);
  assert.match(api.calls[2].input.prompt, /Pruna P-Image-Ideogram/);
});

test('single preview uses an unsaved model selection and describes a reference once for both variants', async () => {
  const api = server([{id: 'style', model: DEFAULT_STYLE_MODEL}]);
  const result = await api.request('post', '/api/generate-preview', {
    style_id: 'style', model: pImage, mode: 'direct', reference_image: 'https://example.test/reference.png',
    prompt: '{{subject}}\nStyle {{primary_color}}', prompt_removebg: 'Cutout'
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(api.calls.map(call => call.model), ['openai/gpt-5-nano', pImage, pImage]);
  assert.match(api.calls[0].input.prompt, /legible text verbatim/);
  assert.equal(api.calls[1].input.prompt, `${scene}\nStyle deep navy blue`);
  assert.equal(api.calls[2].input.prompt, `${scene}\n\nCutout`);
  for (const {input} of api.calls.slice(1)) {
    assert.match(input.prompt, /A forest beside a lake/);
    assert.equal(input.aspect_ratio, 'custom');
    assert.equal(input.width, 512);
    assert.equal(input.height, 512);
    assert.equal('image_size' in input, false);
    assert.equal('image' in input, false);
    assert.equal('strength' in input, false);
  }
  assert.ok(result.body.url_removebg);
});

test('batch previews use each style model and share the VLM description', async () => {
  const api = server([
    {id: 'z', prompt: 'Z {{subject}}', model: DEFAULT_STYLE_MODEL},
    {id: 'p', prompt: 'P {{subject}}', prompt_removebg: 'Cutout {{subject}}', model: pImage},
    {id: 'other-p', prompt: 'P {{subject}}', model: pImage}
  ]);
  const result = await api.request('post', '/api/generate-all-previews', {
    mode: 'direct', reference_image: 'https://example.test/reference.png'
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.generated.length, 3);
  const img2img = api.calls.find(call => call.input.image);
  assert.match(img2img.model, /^prunaai\/z-image-turbo-img2img:[a-f0-9]{64}$/);
  assert.deepEqual(api.calls.filter(call => call !== img2img).map(call => call.model).sort(), ['openai/gpt-5-nano', pImage, pImage, pImage].sort());
  assert.equal(img2img.input.image, 'https://example.test/reference.png');
  assert.equal(img2img.input.strength, 0.75);
  assert.equal('width' in img2img.input, false);
  assert.match(img2img.input.prompt, /the scene in the input image/);
  assert.match(api.calls.find(call => call.model === pImage).input.prompt, /A forest beside a lake/);
});

test('mixed VLM previews describe the reference once per model and support older templates', async () => {
  const api = server([
    {id: 'z', prompt: 'Ink illustration'},
    {id: 'p', prompt: '{{subject}}\nWatercolor', model: pImage}
  ]);
  const result = await api.request('post', '/api/generate-all-previews', {
    mode: 'vlm', reference_image: 'https://example.test/reference.png'
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.generated.length, 2);
  const descriptions = api.calls.filter(call => call.model === 'openai/gpt-5-nano');
  assert.equal(descriptions.length, 2);
  assert.match(descriptions[0].input.prompt, /describing this scene for Z-Image Turbo/);
  assert.match(descriptions[1].input.prompt, /visible scene for P-Image-Ideogram/);
  assert.equal(api.calls.find(call => call.model === DEFAULT_STYLE_MODEL).input.prompt, `${scene} Ink illustration`);
});

test('previews without references keep the selected text-to-image model; invalid requests make no call', async () => {
  const api = server();
  for (const model of [DEFAULT_STYLE_MODEL, pImage]) {
    assert.equal((await api.request('post', '/api/generate-preview', {model, prompt: 'A cat', mode: 'direct'})).status, 200);
    assert.equal(api.calls.at(-1).model, model);
  }
  assert.equal((await api.request('post', '/api/generate-preview', {model: 'bad', prompt: 'A cat'})).status, 400);
  assert.equal(api.calls.length, 2);
});

test('preview dimensions keep the previous 1024 pixel limit', async () => {
  const api = server();
  const result = await api.request('post', '/api/generate-preview', {
    model: pImage, prompt: 'A landscape', preview_settings: {width: 2048, height: 2048}
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const {input} = api.calls.at(-1);
  assert.deepEqual([input.width, input.height], [1024, 1024]);
});

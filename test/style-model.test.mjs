import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {DEFAULT_STYLE_MODEL, normalizeStyleModel, previewMode, buildPreviewRequest} from '../style-model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const pImage = 'prunaai/p-image-ideogram';

// Exercise the real routes and export builder against in-memory storage and Replicate.
function server(styles = []) {
  const files = new Map([[path.join(root, 'data', 'styles.json'), JSON.stringify(styles)]]);
  const routes = new Map(), calls = [];
  const app = {use() {}, listen() {}};
  for (const method of ['get', 'post', 'put', 'delete']) app[method] = (route, handler) => routes.set(`${method} ${route}`, handler);
  const express = Object.assign(() => app, {json() {}, static() {}});
  const replicate = {run: async (model, {input}) => {
    calls.push({model, input});
    return model === 'openai/gpt-5-nano' ? ['A forest beside a lake'] : ['https://example.test/image.webp'];
  }};
  const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replaceAll('import.meta.url', JSON.stringify(new URL('../server.js', import.meta.url).href));
  vm.runInNewContext(source, {
    ...path, fileURLToPath, normalizeStyleModel, previewMode, buildPreviewRequest,
    express, cors() {}, multer: () => ({single: () => () => {}}), Replicate: function () {return replicate;},
    readFileSync: file => files.get(file), writeFileSync: (file, data) => files.set(file, data),
    existsSync: file => files.has(file), mkdirSync() {}, unlinkSync: file => files.delete(file),
    promisify: () => () => {}, execCb() {},
    process: {env: {}}, console: {log() {}, error() {}}, Buffer,
    fetch: async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(8)})
  });
  return {
    files, calls,
    async request(method, route, body = {}, id) {
      const result = {status: 200};
      const response = {status(code) {result.status = code; return this;}, json(data) {result.body = JSON.parse(JSON.stringify(data));}};
      try {await routes.get(`${method} ${route}`)({body, params: {id}}, response);}
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

test('single preview uses an unsaved model selection and describes a reference once for both variants', async () => {
  const api = server([{id: 'style', model: DEFAULT_STYLE_MODEL}]);
  const result = await api.request('post', '/api/generate-preview', {
    style_id: 'style', model: pImage, mode: 'direct', reference_image: 'https://example.test/reference.png',
    prompt: 'Style {{subject}}', prompt_removebg: 'Cutout {{subject}}'
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(api.calls.map(call => call.model), ['openai/gpt-5-nano', pImage, pImage]);
  for (const {input} of api.calls.slice(1)) {
    assert.match(input.prompt, /A forest beside a lake/);
    assert.equal(input.aspect_ratio, 'custom');
    assert.equal(input.width, 2048);
    assert.equal(input.height, 2048);
    assert.equal(input.image_size, '2K');
    assert.equal('image' in input, false);
    assert.equal('strength' in input, false);
  }
  assert.ok(result.body.url_removebg);
});

test('batch previews use each style model and share the VLM description', async () => {
  const api = server([
    {id: 'z', prompt: 'Z {{subject}}', model: DEFAULT_STYLE_MODEL},
    {id: 'p', prompt: 'P {{subject}}', prompt_removebg: 'Cutout {{subject}}', model: pImage}
  ]);
  const result = await api.request('post', '/api/generate-all-previews', {
    mode: 'direct', reference_image: 'https://example.test/reference.png'
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.generated.length, 2);
  assert.deepEqual(api.calls.map(call => call.model).sort(), ['openai/gpt-5-nano', pImage, pImage, 'prunaai/z-image-turbo-img2img'].sort());
  assert.equal(api.calls.find(call => call.model.endsWith('img2img')).input.image, 'https://example.test/reference.png');
  assert.match(api.calls.find(call => call.model === pImage).input.prompt, /A forest beside a lake/);
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

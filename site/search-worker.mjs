import { normalizedVector, scoreFacts } from './semantic.mjs';

let config, model, tokenizer, manifest;
const indexes = new Map();
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map(value => value.toString(16).padStart(2, '0')).join('');
async function json(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Search asset HTTP ${response.status}`);
  return response.json();
}
async function load(settings) {
  config = settings;
  const { AutoConfig, AutoModel, AutoTokenizer, env } = await import('./search-runtime/transformers.mjs');
  env.allowLocalModels = false;
  // 4.3.1's tokenizer metadata probe omits revision; pin the URL template too.
  env.remotePathTemplate = `{model}/resolve/${config.revision}/`;
  env.backends.onnx.wasm.wasmPaths = new URL('./search-runtime/', import.meta.url).href;
  env.backends.onnx.wasm.numThreads = 1;
  const options = { revision: config.revision, progress_callback: progress => {
    self.postMessage({ type: 'progress', file: progress.file, progress: progress.progress ?? null,
      loaded: progress.loaded ?? null, total: progress.total ?? null });
  } };
  const modelConfig = await AutoConfig.from_pretrained(config.model, options);
  modelConfig.vision_config = modelConfig.audio_config = null;
  model = await AutoModel.from_pretrained(config.model, {
    ...options, config: modelConfig, device: 'webgpu', dtype: config.precision,
  });
  tokenizer = await AutoTokenizer.from_pretrained(config.model, options);
  manifest = await json(new URL('./data/search/manifest.json', import.meta.url));
  for (const key of ['model', 'revision', 'runtime', 'precision', 'dimensions', 'max_tokens',
    'query_prefix', 'document_prefix', 'pooling', 'normalization', 'artifacts_sha256']) {
    if (JSON.stringify(manifest[key]) !== JSON.stringify(config[key])) throw new Error(`Search contract mismatch: ${key}`);
  }
  self.postMessage({ type: 'ready' });
}
async function search({ language, rows, query, sequence }) {
  if (!model) throw new Error('Search model is not loaded');
  const entry = manifest.languages[language];
  if (!entry || entry.corpus_sha256 !== await hash(new TextEncoder().encode(JSON.stringify(rows)))) {
    throw new Error('Search corpus changed; rebuild index');
  }
  if (!indexes.has(language)) {
    const response = await fetch(new URL(`./data/search/${language}.f32`, import.meta.url), { credentials: 'omit' });
    if (!response.ok) throw new Error(`Search index HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== entry.bytes || entry.vectors_sha256 !== await hash(bytes)) {
      throw new Error('Search index checksum mismatch');
    }
    const view = new DataView(bytes);
    const vectors = Float32Array.from({ length: bytes.byteLength / 4 }, (_, index) => view.getFloat32(index * 4, true));
    indexes.set(language, vectors);
  }
  const start = performance.now();
  const output = await model(await tokenizer(`${config.query_prefix}${query}`, {
    truncation: true, max_length: config.max_tokens,
  }));
  const vector = normalizedVector(output.sentence_embedding.data, config.dimensions);
  const scores = scoreFacts(entry.ids, indexes.get(language), vector, config.dimensions);
  self.postMessage({ type: 'results', sequence, scores: [...scores], vector: Array.from(vector),
    elapsed: performance.now() - start });
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(() => data.type === 'load' ? load(data.config) : search(data))
    .catch(error => self.postMessage({ type: 'error', error: String(error.message ?? error) }));
};

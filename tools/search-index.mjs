import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { corpusRows, SEARCH_SCHEMA } from '../site/semantic.mjs';
import { loadEncoder } from './search-encoder.mjs';
import { downloadModel, modelArtifacts } from './search-download.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('data/semantic-search.json', root)));
const catalog = JSON.parse(execFileSync('python3', ['-c',
  'import json; from tools.catalog import catalog_document; print(json.dumps(catalog_document()))'],
  { cwd:root, encoding:'utf8', maxBuffer:16 * 1024 * 1024 }));
const hash = value => createHash('sha256').update(value).digest('hex');
const localPath = process.env.SEARCH_MODEL_PATH ?? await downloadModel(config);
const encoder = await loadEncoder(config, { localPath });
const manifest = { schema_version: SEARCH_SCHEMA, model: config.model, revision: config.revision,
  upstream_revision: config.candidate.upstream_revision, runtime: config.runtime,
  artifacts_sha256: modelArtifacts,
  precision: config.precision, dimensions: config.dimensions, max_tokens: config.max_tokens,
  query_prefix: config.query_prefix, document_prefix: config.document_prefix,
  pooling: config.pooling, normalization: config.normalization, languages: {} };
await mkdir(new URL('data/search/', root), { recursive: true });
try {
  for (const language of ['en', 'fr', 'de', 'es', 'ja']) {
    const rows = corpusRows(catalog, language);
    const buffer = Buffer.alloc(rows.length * config.dimensions * 4);
    for (let row = 0; row < rows.length; row++) {
      const vector = await encoder.encode(rows[row].text);
      for (let col = 0; col < vector.length; col++) buffer.writeFloatLE(vector[col], (row * vector.length + col) * 4);
      if (row % 50 === 0) console.log(language, row, '/', rows.length);
    }
    await writeFile(new URL(`data/search/${language}.f32`, root), buffer);
    manifest.languages[language] = { ids: rows.map(row => row.id), corpus_sha256: hash(JSON.stringify(rows)),
      vectors_sha256: hash(buffer), bytes: buffer.length, file: `${language}.f32` };
  }
  await writeFile(new URL('data/search/manifest.json', root), `${JSON.stringify(manifest, null, 2)}\n`);
} finally { await encoder.dispose(); }

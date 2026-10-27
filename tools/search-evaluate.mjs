import { readFile, writeFile } from 'node:fs/promises';
import { loadEncoder } from './search-encoder.mjs';
import { downloadModel } from './search-download.mjs';
import { entityScore, scoreFacts, hybridFilter } from '../site/semantic.mjs';
import { filterChanges, projectChangeForPath } from '../site/logic.mjs';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('site/data/catalog.json', root)));
const config = catalog.semantic_search;
const fixture = JSON.parse(await readFile(new URL('tests/fixtures/semantic-retrieval.json', root)));
const manifest = JSON.parse(await readFile(new URL('data/search/manifest.json', root)));
const encoder = await loadEncoder(config, { localPath: process.env.SEARCH_MODEL_PATH ?? await downloadModel(config) });
const indexes = new Map();
const results = [];
try {
  for (const item of fixture.cases) {
    const bytes = await readFile(new URL(`data/search/${item.language}.f32`, root));
    if (!indexes.has(item.language)) indexes.set(item.language,
      Float32Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readFloatLE(i * 4)));
    const vector = await encoder.encode(config.query_prefix + item.query);
    const scores = scoreFacts(manifest.languages[item.language].ids, indexes.get(item.language), vector);
    const filters = { source: item.source, target: item.target, includeRoutine: true };
    const projected = catalog.changes.map(c => projectChangeForPath(c, catalog.sources,
      item.source, item.target, catalog.latest)).filter(Boolean);
    const eligible = filterChanges(projected, filters, catalog.latest);
    const lexical = filterChanges(projected, {...filters, query: item.query}, catalog.latest);
    const ranked = [...eligible].sort((a,b) => entityScore(b,scores)-entityScore(a,scores));
    const hybrid = hybridFilter(eligible, lexical, scores, config.threshold);
    const expected = item.expected_entity_ids;
    results.push({ ...item, lexical_ids: lexical.map(c => c.id),
      top5: ranked.slice(0,5).map(c => ({id:c.id,score:entityScore(c,scores)})),
      hybrid_ids: hybrid.map(c => c.id), query_vector: Array.from(vector),
      lexical_hit5: expected.some(id => lexical.slice(0,5).some(c => c.id === id)),
      semantic_hit5: expected.some(id => ranked.slice(0,5).some(c => c.id === id)),
      hybrid_hit5: expected.some(id => hybrid.slice(0,5).some(c => c.id === id)),
      hybrid_recall: expected.length ? expected.filter(id => hybrid.some(c => c.id === id)).length / expected.length : null,
    });
  }
  const groups = {};
  for (const language of ['en','fr','de','es','ja','all']) {
    const cases = results.filter(c => (language === 'all' || c.language === language) && c.expected_entity_ids.length);
    groups[language] = { cases:cases.length, lexical_hit5:cases.filter(c => c.lexical_hit5).length,
      semantic_hit5:cases.filter(c => c.semantic_hit5).length,
      hybrid_hit5:cases.filter(c => c.hybrid_hit5).length,
      hybrid_mean_recall:cases.reduce((sum,c) => sum+c.hybrid_recall,0)/cases.length };
  }
  const splits = {};
  for (const split of ['development', 'holdout']) {
    const positive = results.filter(c => c.split === split && c.expected_entity_ids.length);
    const negative = results.filter(c => c.split === split && !c.expected_entity_ids.length);
    splits[split] = { positive:positive.length, semantic_hit5:positive.filter(c => c.semantic_hit5).length,
      hybrid_hit5:positive.filter(c => c.hybrid_hit5).length,
      hybrid_full_recall:positive.filter(c => c.hybrid_recall === 1).length, negative:negative.length,
      negative_with_matches:negative.filter(c => c.hybrid_ids.length).length };
  }
  const output = { model:config.model, revision:config.revision, precision:config.precision, threshold:config.threshold,
    backend:'onnxruntime-node cpu', groups, splits, results };
  const destination = process.argv[2];
  if (destination) await writeFile(destination, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(groups, null, 2));
  for (const c of results.filter(c => c.expected_entity_ids.length && (!c.semantic_hit5 || c.hybrid_recall < 1))) {
    console.log('MISS', c.id, c.expected_entity_ids, c.top5);
  }
} finally { await encoder.dispose(); }

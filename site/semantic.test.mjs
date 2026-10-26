import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corpusRows, normalizedVector, scoreFacts, hybridFilter, entityScore } from './semantic.mjs';
import { filterChanges, projectChangeForPath } from './logic.mjs';
import { searchLabels } from './search-labels.mjs';

const catalog = JSON.parse(readFileSync(new URL('./data/catalog.json', import.meta.url)));
test('normalized embeddings fail explicitly on invalid output', () => {
  assert.throws(() => normalizedVector([NaN], 1));
  assert.throws(() => normalizedVector([0], 1));
  assert.throws(() => normalizedVector([1], 768));
  assert.deepEqual([...normalizedVector([3, 4], 2)], [...Float32Array.from([.6, .8])]);
});
test('fixed threshold union retains exact hits, stable sort, and no result cap', () => {
  const eligible = [{id:'exact'}, {id:'semantic'}, {id:'near'}, {id:'boundary'}];
  const scores = new Map([['exact', .1], ['semantic', .9], ['near', .6999], ['boundary', .7]]);
  assert.deepEqual(hybridFilter(eligible, [eligible[0]], scores, .7).map(c => c.id),
    ['exact', 'semantic', 'boundary']);
  assert.deepEqual(hybridFilter([], eligible, scores, .7), []);
});
test('only path-eligible members can produce a grouped semantic hit', () => {
  const group = {id:'group', member_ids:['old','future'], visible_member_ids:['old']};
  const scores = new Map([['old',.1],['future',.99]]);
  assert.equal(entityScore(group, scores), .1);
  assert.deepEqual(hybridFilter([group], [], scores, .7), []);
  const projected = catalog.changes.map(c => projectChangeForPath(c, catalog.sources, 'v17', 'v18', catalog.latest)).filter(Boolean);
  const eligible = filterChanges(projected, {source:'v17', target:'v18'}, catalog.latest);
  const allHigh = new Map(corpusRows(catalog, 'en').map(row => [row.id, 1]));
  assert.deepEqual(hybridFilter(eligible, [], allHigh, .7), eligible);
  assert.deepEqual(filterChanges(projected, {platforms:[]}), []);
  assert.deepEqual(filterChanges(projected, {modules:[]}), []);
});
test('all locales index the same stable atomic IDs, never unprojected group prose', () => {
  for (const language of ['en','fr','de','es','ja']) {
    const rows = corpusRows(catalog, language);
    assert.equal(rows.length, 276);
    assert.equal(new Set(rows.map(r => r.id)).size, 276);
    assert.deepEqual(rows.map(r => r.id), corpusRows(catalog, 'en').map(r => r.id));
    assert.ok(rows.every(row => row.text.startsWith('title: ') && row.text.includes(' | text: ')));
    assert.deepEqual(Object.keys(searchLabels[language]), Object.keys(searchLabels.en));
  }
});
test('cosine scoring rejects malformed index shapes', () => {
  assert.equal(scoreFacts(['one'], [1,0], [1,0], 2).get('one'), 1);
  assert.throws(() => scoreFacts(['one'], [1], [1,0], 2));
  assert.throws(() => scoreFacts(['one'], [NaN,0], [1,0], 2));
});
test('retrieval fixture expectations retain stable IDs and actual version eligibility', () => {
  const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/semantic-retrieval.json', import.meta.url)));
  assert.equal(fixture.cases.length, 40);
  assert.equal(new Set(fixture.cases.map(c => c.id)).size, 40);
  for (const item of fixture.cases) {
    assert.ok(item.rationale && ['development','holdout'].includes(item.split));
    const projected = catalog.changes.map(c =>
      projectChangeForPath(c,catalog.sources,item.source,item.target,catalog.latest)).filter(Boolean);
    const eligible = filterChanges(projected,{source:item.source,target:item.target},catalog.latest);
    for (const id of item.expected_entity_ids) assert.ok(eligible.some(c => c.id === id),`${item.id}: ${id}`);
  }
  for (const language of ['en','fr','de','es','ja']) {
    assert.equal(fixture.cases.filter(c => c.language === language && c.expected_entity_ids.length).length,6);
    assert.equal(fixture.cases.filter(c => c.language === language && !c.expected_entity_ids.length).length,2);
  }
});

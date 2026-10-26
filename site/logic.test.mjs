import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, VERSION_BUCKETS, versionBucket, versionNumber, isLatestAvailable, crossesVersion,
  priorityForChange, stagePriorityForChange, filterChanges, validateChecklist, validateCatalog, translations, translate } from './logic.mjs';

const change = (id, bucket = 'v20', extra = {}) => ({
  id, threshold: { exact: '20 R3', bucket, kind: 'introduced' }, type: 'restriction',
  criticality: 'blocking', platforms: ['all'], modules: ['language'],
  identifiers: ['OLD COMMAND:42'], localizations: { en: { one_line: 'Use a project', paragraph: 'Opening works.' },
    ja: { one_line: 'プロジェクトの変更', paragraph: '移行対象' } },
  ...extra,
});

test('release buckets preserve major version and do not invent unknown versions', () => {
  for (const text of ['v20', '20.3', '20 R10', '4D v20 R3', 'v20R2']) assert.equal(versionBucket(text), 'v20');
  assert.equal(versionBucket('latest'), 'latest');
  for (const input of [null, '', 'unverified', 'release 20']) assert.equal(versionBucket(input), 'unknown');
  assert.equal(versionNumber('latest'), null);
  assert.equal(versionNumber('latest', { release: '22.1' }), 22);
});

test('latest selection requires a verifiable released version', () => {
  assert.equal(isLatestAvailable({ release: null, status: 'unverified' }), false);
  assert.equal(isLatestAvailable({ release: '22', status: 'unverified', verified_at: '2026-01-01' }), false);
  assert.equal(isLatestAvailable({ release: '22', status: 'verified', verified_at: '2026-01-01' }), true);
  assert.equal(isLatestAvailable({ release: 'unknown', status: 'verified', verified_at: '2026-01-01' }), false);
  assert.equal(isLatestAvailable({ release: '22', status: 'verified', verified_at: 'not a date' }), false);
  assert.equal(isLatestAvailable({ release: '21 R4', status: 'verified', channel: 'feature', verified_at: '2026-10-26' }), true);
  assert.deepEqual(VERSION_BUCKETS, ['v16', 'v17', 'v18', 'v19', 'v20', 'v21', 'latest']);
});

test('restrictions and removals require crossings; deprecated records accumulate', () => {
  assert.equal(crossesVersion(change('cross'), 'v19', 'v20'), true);
  assert.equal(crossesVersion(change('already'), 'v20', 'v21'), false);
  assert.equal(crossesVersion(change('future'), 'v16', 'v19'), false);
  assert.equal(crossesVersion(change('removed', 'v18', { type: 'removed' }), 'v18', 'v21'), false);
  assert.equal(crossesVersion(change('old', 'v16', { type: 'deprecated' }), 'v19', 'v21'), true);
  assert.equal(crossesVersion(change('PDFCreator', 'v20', { type: 'deprecation' }), 'v20', 'v21'), true);
  assert.equal(crossesVersion(change('PDFCreator', 'v20', { type: 'deprecation' }), 'v20', 'v20'), true);
  assert.equal(crossesVersion(change('old', 'v16', { threshold: { bucket: 'v16', kind: 'deprecated' } }), 'v19', 'v21'), true);
  assert.equal(crossesVersion(change('future', 'v22', { type: 'deprecated' }), 'v19', 'v21'), false);
  assert.equal(crossesVersion(change('unknown', 'unknown'), 'v19', 'v21'), true);
  assert.equal(crossesVersion(change('unknownSource'), 'unknown', 'v21'), true);
});

test('null release thresholds and unknown actions remain valid and visible without fabricated versions', () => {
  const unknown = change('unextracted', null, {
    threshold: { exact: null, bucket: null, kind: 'unknown' },
    action: null, action_basis: 'Recommendation has not been extracted.',
    stage: 'unknown', criticality: 'unknown',
  });
  assert.equal(versionBucket(unknown.threshold.exact), 'unknown');
  assert.equal(versionNumber(unknown.threshold.bucket), null);
  assert.equal(crossesVersion(unknown, 'v20', 'v21'), true);
  assert.equal(crossesVersion(unknown, 'v20', 'v20'), true);
  const known = change('known', 'v21', { stage: 'syntax', criticality: 'blocking' });
  assert.deepEqual(filterChanges([unknown, known], { source: 'v20', target: 'v21' }).map(c => c.id),
    ['known', 'unextracted']);
  assert.ok(stagePriorityForChange(unknown) > stagePriorityForChange(known));
  assert.ok(priorityForChange(unknown) > priorityForChange(known));
  const catalog = { schema_version: 1, coverage: {}, latest: {}, semantic_search: {}, sources: [], changes: [unknown] };
  assert.equal(validateCatalog(catalog), catalog);
  assert.equal(unknown.threshold.exact, null);
  assert.equal(unknown.threshold.bucket, null);
  assert.equal(unknown.action, null);
  for (const language of LANGUAGES) assert.ok(translate(language, 'unknown'));
});

test('offline search matches exact identifiers, multiple words, and all localizations', () => {
  const records = [change('one'), change('two', 'v21', { identifiers: ['NEW'] })];
  assert.deepEqual(filterChanges(records, { query: 'old command:42' }).map(c => c.id), ['one']);
  assert.equal(filterChanges(records, { query: 'PROJECT opening' }).length, 2);
  assert.equal(filterChanges(records, { query: 'プロジェクト' }).length, 2);
  assert.equal(filterChanges(records, { query: 'ＯＬＤ' }).length, 1);
  assert.equal(filterChanges(records, { query: 'no-match' }).length, 0);
  assert.equal(filterChanges(records, { query: '   ' }).length, 2);
});

test('unknown platform and module remain visible; specific nonmatches are filtered', () => {
  const records = [
    change('windows', 'v20', { platforms: ['windows'], modules: ['language'] }),
    change('mac', 'v20', { platforms: ['macos'], modules: ['sql'] }),
    change('unknown', 'v20', { platforms: ['unknown'], modules: ['unknown'] }),
    change('missing', 'v20', { platforms: [], modules: [] }),
  ];
  assert.deepEqual(filterChanges(records, { platform: 'windows', module: 'language' }).map(c => c.id),
    ['missing', 'unknown', 'windows']);
  assert.equal(filterChanges(records).length, 4);
});

test('priority sorts stage before severity, keeping user effort independent and input unmodified', () => {
  const records = [
    change('low', 'v18', { criticality: 'low', stage: 'syntax', effort: 'huge' }),
    change('block', 'v20', { criticality: 'blocking', stage: 'testing', effort: 'tiny' }),
    change('unknown', 'v19', { criticality: null }),
  ];
  assert.equal(priorityForChange(records[1]), 0);
  assert.equal(stagePriorityForChange(records[0]), 0);
  assert.deepEqual(filterChanges(records).map(c => c.id), ['low', 'block', 'unknown']);
  assert.deepEqual(filterChanges(records, { sort: 'version' }).map(c => c.id), ['low', 'unknown', 'block']);
  assert.deepEqual(records.map(c => c.id), ['low', 'block', 'unknown']);
  const withinStage = [
    change('a-low', 'v20', { stage: 'syntax', criticality: 'low' }),
    change('z-block', 'v20', { stage: 'syntax', criticality: 'blocking' }),
    change('runtime-block', 'v20', { stage: 'runtime', criticality: 'blocking' }),
    change('modernization-block', 'v20', { stage: 'modernization', criticality: 'blocking' }),
  ];
  assert.deepEqual(filterChanges(withinStage).map(c => c.id),
    ['z-block', 'a-low', 'runtime-block', 'modernization-block']);
});

test('checklists validate atomically and preserve stable unknown IDs, without prototype pollution', () => {
  const original = { schema_version: 1, items: { x: { checked: true, effort: '2 days / 試験' } } };
  const result = validateChecklist(original);
  assert.equal(result.x.effort, '2 days / 試験');
  result.x.checked = false;
  assert.equal(original.items.x.checked, true);
  const special = validateChecklist(JSON.parse('{"schema_version":1,"items":{"__proto__":{"checked":true,"effort":"safe"}}}'));
  assert.equal(Object.getPrototypeOf(special), null);
  assert.equal(special.__proto__.checked, true);
  for (const value of [null, {}, [], { schema_version: 2, items: {} }, { schema_version: 1, items: [] },
    { schema_version: 1, items: { a: { checked: 'true', effort: '' } } },
    { schema_version: 1, items: { a: { checked: true, effort: 10 } } },
    { schema_version: 1, items: { a: { checked: true, effort: 'x'.repeat(10001) } } },
  ]) assert.throws(() => validateChecklist(value), /invalidImport/);
});

test('all five dictionaries have every UI key, with the same placeholders', () => {
  const keys = Object.keys(translations.en).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(translations[language]).sort(), keys, language);
    for (const key of keys) {
      assert.ok(translations[language][key].length, `${language}:${key}`);
      assert.deepEqual([...translations[language][key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(),
        [...translations.en[key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), `${language}:${key}`);
    }
    assert.ok(translate(language, 'resultCount', { count: 3, total: 10 }).includes('3'));
  }
});

test('every declarative HTML label has a translation in each language', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)].map(match => match[1]);
  for (const language of LANGUAGES) {
    for (const key of keys) assert.ok(Object.hasOwn(translations[language], key), `${language}:${key}`);
  }
});

test('known sample module/platform labels are localized and priority matches stage-first sorting', () => {
  assert.equal(translate('en', 'priority'), 'Stage, then severity');
  assert.equal(translate('en', 'latestFeature'), 'Latest feature release');
  for (const language of LANGUAGES) {
    assert.equal(translate(language, 'php'), 'PHP');
    assert.equal(translate(language, 'windows'), 'Windows');
    assert.equal(translate(language, 'macos'), 'macOS');
    assert.notEqual(translate(language, 'printing'), 'printing');
  }
  assert.equal(translate('ja', 'printing'), '印刷');
  assert.equal(translate('fr', 'printing'), 'Impression');
  assert.equal(translate('en', 'processed'), 'Sources used for sample (partial)');
  for (const language of LANGUAGES) assert.ok(translations[language].actionBasis);
});

test('catalogue structural validation rejects invalid versions and duplicate stable IDs', () => {
  const base = { schema_version: 1, coverage: {}, latest: {}, semantic_search: {}, sources: [], changes: [change('one')] };
  assert.equal(validateCatalog(base), base);
  assert.throws(() => validateCatalog({ ...base, schema_version: 2 }), /invalidCatalog/);
  assert.throws(() => validateCatalog({ ...base, changes: [change('one'), change('one')] }), /invalidCatalog/);
  assert.throws(() => validateCatalog({ ...base, clarifications: {} }), /invalidCatalog/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { LANGUAGES, VERSION_BUCKETS, versionBucket, versionNumber, versionChoices, isLatestAvailable, crossesVersion,
  priorityForChange, stagePriorityForChange, filterChanges, validateCatalog, translations, translate,
  complexityForChange, COMPLEXITY_LEVELS, filterOptions, VERSION_COLORS, versionColor, evidenceForLanguage } from './logic.mjs';

const change = (id, bucket = 'v20', extra = {}) => ({
  id, threshold: { exact: '20 R3', bucket, kind: 'introduced' }, type: 'restriction',
  criticality: 'blocking', platforms: ['all'], modules: ['language'],
  identifiers: ['OLD COMMAND:42'], localizations: { en: { one_line: 'Use a project', paragraph: 'Opening works.' },
    ja: { one_line: 'プロジェクトの変更', paragraph: '移行対象' } },
  ...extra,
});

execFileSync('python3', ['-m', 'tools.catalog'], { cwd: new URL('../', import.meta.url) });
const editorialChanges = JSON.parse(await readFile(new URL('./data/catalog.json', import.meta.url))).changes;
const editorialById = new Map(editorialChanges.flatMap(record =>
  [record.id, ...record.member_ids].map(id => [id, record])));

test('real catalog crosses historical removal buckets, not document editions or source-equal thresholds', () => {
  assert.equal(editorialChanges.length, 119);
  assert.equal(editorialChanges.flatMap(c => c.member_ids).length, 192);
  for (const [id, from, to, included] of [
    ['chg-removed-xslt-apply-transformation', 'v17', 'v18', true],
    ['chg-removed-xslt-apply-transformation', 'v18', 'v20', false],
    ['chg-removed-no-trace', 'v18', 'v19', true],
    ['chg-removed-no-trace', 'v19', 'v21', false],
    ['chg-colon-identifiers', 'v19', 'v20', true],
    ['chg-colon-identifiers', 'v20', 'latest', false],
    ['chg-bundled-php-zip-removal', 'v19', 'v20', true],
    ['chg-bundled-php-zip-removal', 'v20', 'v21', false],
    ['chg-pdfcreator-driver-deprecation', 'v20', 'v21', true],
    ['chg-deprecated-c-integer', 'v20', 'v20', true],
    ['chg-project-save-list-call', 'v20', 'v21', true],
    ['chg-removed-graph-table', 'v16', 'v18', false],
    ['chg-deprecated-create-user-form', 'v20', 'v20', true],
    ['chg-http-automatic-variable-assignment', 'v19', 'v20', true],
    ['chg-form-get-parameter-disabled', 'v17', 'v18', true],
    ['chg-form-get-parameter-disabled', 'v18', 'v20', false],
    ['chg-altura-desktop-64bit-removal', 'v16', 'v17', true],
    ['chg-altura-server-64bit-removal', 'v17', 'v18', false],
    ['chg-4d-pack-full-screen-unavailable', 'v16', 'v17', true],
    ['chg-ftp-progress-disabled', 'v17', 'v20', false],
    ['chg-database-rsr-explicit-open', 'v20', 'v21', true],
  ]) {
    assert.equal(crossesVersion(editorialById.get(id), from, to, { release: '21 R4' }),
      included, `${id}: ${from} → ${to}`);
  }
});

test('real content search, severity and unknown remediation difficulty preserve semantics', () => {
  assert.deepEqual(filterChanges(editorialChanges, {
    source: 'v18', target: 'v19', query: 'OBJET FIXER ACTIVATION',
  }).map(c => c.id), ['chg-group-button-enabled-state']);
  const modernPhp = filterChanges(editorialChanges, { source: 'v19', target: 'v20', query: 'PHP' });
  assert.equal(modernPhp.length, 1);
  assert.equal(modernPhp[0].id, 'chg-group-bundled-php-modules');
  assert.equal(modernPhp[0].member_ids.length, 12);
  const lingering = filterChanges(editorialChanges, { source: 'v20', target: 'v21' });
  assert.ok(lingering.some(c => c.id === 'chg-pdfcreator-driver-deprecation'));
  assert.ok(!lingering.some(c => c.id.startsWith('chg-removed-')));
  const sorted = filterChanges(editorialChanges);
  assert.deepEqual(sorted.slice(0, 3).map(c => c.id),
    ['chg-colon-identifiers', 'chg-group-v19-compiler-settings', 'chg-object-notation-compliance']);
  assert.ok(sorted.every(c => complexityForChange(c) === 'unknown'));
  assert.deepEqual(filterChanges(editorialChanges, { sort: 'complexity' }).map(c => c.id),
    sorted.map(c => c.id));
});

test('Stage 2 compiler, ORDA and compatibility queries keep release and group boundaries', () => {
  for (const module of new Set(editorialChanges.flatMap(c => c.modules))) {
    if (module === 'language') continue;
    for (const language of LANGUAGES) {
      assert.ok(Object.hasOwn(translations[language], module), `${language}: ${module}`);
    }
  }
  for (const [id, from, to, included] of [
    ['chg-v19-compiler-object-notation', 'v18', 'v19', true],
    ['chg-v19-compiler-unicode-methods', 'v19', 'v20', false],
    ['chg-object-notation-compliance', 'v19', 'v20', true],
    ['chg-base64-decode-ok', 'v18', 'v19', true],
    ['chg-base64-decode-ok', 'v19', 'v20', false],
    ['chg-entity-min-empty-undefined', 'v18', 'v19', true],
    ['chg-standard-xpath-option', 'v18', 'v19', true],
    ['chg-macos-text-lf-option', 'v19', 'v20', true],
    ['chg-macos-xml-lf-option', 'v20', 'v21', false],
    ['chg-blob-parameter-type-check', 'v20', 'v21', true],
    ['chg-mail-attachment-posix-path', 'v20', 'v21', true],
    ['chg-ole-tools-legacy-removal', 'v20', 'v21', true],
  ]) {
    assert.equal(crossesVersion(editorialById.get(id), from, to), included, id);
  }
  for (const [query, entity] of [
    ['entitySelection.average()', 'chg-group-empty-entity-aggregates'],
    ['chg-v19-compiler-unicode-methods', 'chg-group-v19-compiler-settings'],
    ['chg-base64-encode-ok', 'chg-group-base64-status'],
    ['chg-debug-log-columns-v19', 'chg-group-v19-log-format'],
    ['chg-requests-log-microseconds', 'chg-group-requests-log-format'],
    ['chg-base64-invalid-blob-empty', 'chg-base64-invalid-blob-empty'],
  ]) {
    assert.deepEqual(filterChanges(editorialChanges, { source: 'v17', target: 'v20', query })
      .map(c => c.id), [entity], query);
  }
  const xpath = editorialById.get('chg-standard-xpath-option');
  assert.equal(xpath.type, 'behavior');
  assert.match(xpath.localizations.en.paragraph, /off for databases converted/);
  const directWrite = editorialById.get('chg-windows-directwrite-option');
  assert.deepEqual(directWrite.platforms, ['windows']);
  assert.equal(directWrite.complexity.level, 'unknown');
  const unknownDifficulty = filterChanges(editorialChanges, { sort: 'complexity' });
  assert.ok(unknownDifficulty.every(c => complexityForChange(c) === 'unknown'));
});

test('group searches retain individual IDs, command aliases and unique membership', () => {
  const membership = editorialChanges.flatMap(c => c.member_ids);
  assert.equal(new Set(membership).size, 192);
  for (const id of membership) {
    assert.deepEqual(filterChanges(editorialChanges, { source: 'unknown', query: id }).map(c => c.id),
      [editorialById.get(id).id], id);
  }
  for (const query of ['DOM', 'LibXSLT', 'XMLreader', 'chg-bundled-php-zip-removal']) {
    assert.deepEqual(filterChanges(editorialChanges, { source: 'v19', target: 'v20', query })
      .filter(c => c.id === 'chg-group-bundled-php-modules').map(c => c.id),
    ['chg-group-bundled-php-modules']);
  }
  const buttons = editorialById.get('chg-removed-enable-button');
  assert.equal(buttons.members.length, 2);
  assert.ok(buttons.evidence.length >= buttons.members[0].evidence.length);
  const duplicate = structuredClone(buttons);
  duplicate.id = 'another-group';
  const document = { schema_version: 1, sources: [], changes: [buttons, duplicate],
    coverage: {}, latest: {}, semantic_search: {} };
  assert.throws(() => validateCatalog(document), /invalidCatalog/);
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

test('version menus prevent source greater than target and retain equal-version assessment', () => {
  const latest = { release: '21 R4', status: 'verified', verified_at: '2026-10-26' };
  for (const source of VERSION_BUCKETS) {
    for (const target of VERSION_BUCKETS) {
      if (VERSION_BUCKETS.indexOf(source) > VERSION_BUCKETS.indexOf(target)) continue;
      for (const side of ['source', 'target']) {
        const choices = versionChoices(side, source, target, latest);
        assert.equal(choices.find(c => c.bucket === (side === 'source' ? source : target)).disabled, false);
        for (const choice of choices) {
          const from = side === 'source' ? choice.bucket : source;
          const to = side === 'target' ? choice.bucket : target;
          assert.equal(choice.disabled, VERSION_BUCKETS.indexOf(from) > VERSION_BUCKETS.indexOf(to));
        }
      }
    }
  }
  assert.equal(versionChoices('target', 'v21', 'v21', latest).find(c => c.bucket === 'latest').disabled, false);
  assert.equal(versionChoices('target', 'latest', 'latest', latest).find(c => c.bucket === 'v21').disabled, true);
  for (const side of ['source', 'target']) {
    assert.equal(versionChoices(side, 'v16', 'v21').find(c => c.bucket === 'latest').disabled, true);
  }
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

test('two platform choices retain internal unknowns; topics preserve union and intersection semantics', () => {
  const records = [
    change('windows', 'v20', { platforms: ['windows'], modules: ['language'] }),
    change('mac', 'v20', { platforms: ['macos'], modules: ['sql'] }),
    change('unknown', 'v20', { platforms: ['unknown'], modules: ['unknown'] }),
    change('missing', 'v20', { platforms: [], modules: [] }),
  ];
  assert.deepEqual(filterChanges(records, { platforms: ['windows'], modules: ['language'] }).map(c => c.id),
    ['windows']);
  assert.deepEqual(filterChanges(records, { platforms: ['windows'], modules: ['unknown'] }).map(c => c.id),
    ['missing', 'unknown']);
  assert.deepEqual(filterChanges(records, { platforms: ['windows', 'macos'], modules: ['language', 'sql'] }).map(c => c.id),
    ['mac', 'windows']);
  for (const key of ['platforms', 'modules']) {
    assert.equal(filterChanges(records, { [key]: [] }).length, 0);
  }
  assert.deepEqual(filterOptions(records, 'platforms'), ['windows', 'macos']);
  assert.ok(filterOptions(records, 'modules').includes('unknown'));
  const universal = change('universal', 'v20', { platforms: ['all'] });
  assert.equal(filterChanges([universal], { platforms: ['windows'] }).length, 1);
  assert.equal(filterChanges([universal], { platforms: ['unknown'] }).length, 0);
  const universalModule = change('universal-module', 'v20', { modules: ['all'] });
  assert.equal(filterChanges([universalModule]).length, 1);
  assert.equal(filterChanges([universalModule], { modules: [] }).length, 0);
  assert.equal(filterChanges([universalModule], { modules: ['unknown'] }).length, 0);
  assert.equal(filterChanges(records).length, 4);
});

test('Windows/macOS-only visitor filters never reassign unknown or Linux-only evidence', () => {
  const records = [
    change('windows', 'v20', { platforms: ['windows'] }),
    change('macos', 'v20', { platforms: ['macos'] }),
    change('unknown', 'v20', { platforms: ['unknown'] }),
    change('missing', 'v20', { platforms: [] }),
    change('all', 'v20', { platforms: ['all'] }),
    change('linux-only', 'v20', { platforms: ['linux'] }),
  ];
  const original = structuredClone(records);
  assert.deepEqual(filterOptions(records, 'platforms'), ['windows', 'macos']);
  for (const [platforms, expected] of [
    [['windows'], ['all', 'missing', 'unknown', 'windows']],
    [['macos'], ['all', 'macos', 'missing', 'unknown']],
    [['windows', 'macos'], ['all', 'macos', 'missing', 'unknown', 'windows']],
    [[], []], [['linux'], []], [['unknown'], []],
  ]) {
    const filters = { source: 'v19', target: 'v21', platforms };
    const before = structuredClone(filters);
    assert.deepEqual(filterChanges(records, filters).map(c => c.id), expected);
    assert.deepEqual(filters, before);
  }
  assert.deepEqual(records, original);
  assert.ok(!editorialChanges.some(c => c.platforms.includes('linux')));
  const other = { en: 'Other', fr: 'Autres', de: 'Sonstige', es: 'Otros', ja: 'その他' };
  for (const language of LANGUAGES) {
    assert.equal(translate(language, 'otherTopics'), other[language]);
    assert.notEqual(translate(language, 'unknown'), other[language]);
    assert.ok(!Object.hasOwn(translations[language], 'linux'));
  }
});

test('evidence uses source locale, English fallback, and retains all substantive member citations', () => {
  const sources = [{ id: 'modern-en', language: 'en' }, { id: 'legacy-fr', language: 'fr' },
    { id: 'other', language: 'ja' }];
  const records = [
    { source_id: 'modern-en', block_id: 'one', excerpt: 'First English support' },
    { source_id: 'modern-en', block_id: 'two', excerpt: 'Distinct member support' },
    { source_id: 'legacy-fr', block_id: 'un', excerpt: 'Preuve française' },
    { source_id: 'other', block_id: 'jp', excerpt: '日本語の根拠' },
  ];
  const before = structuredClone(records);
  assert.deepEqual(evidenceForLanguage(records, sources, 'en'), records.slice(0, 2));
  assert.deepEqual(evidenceForLanguage(records, sources, 'de'), records.slice(0, 2));
  assert.deepEqual(evidenceForLanguage(records, sources, 'fr'), [records[2]]);
  assert.deepEqual(evidenceForLanguage(records, sources, 'ja'), [records[3]]);
  assert.deepEqual(evidenceForLanguage([records[2]], sources, 'de'), []);
  assert.deepEqual(evidenceForLanguage([{ source_id: 'missing' }], sources, 'de'), []);
  assert.deepEqual(records, before);
  for (const language of LANGUAGES) {
    assert.ok(translate(language, 'evidenceUnavailable'));
    assert.ok(!Object.hasOwn(translations[language], 'detailLanguageNote'));
  }
});

test('all five evidence locales retain grouped member support without changing aliases or filtering', async () => {
  const catalog = JSON.parse(await readFile(new URL('./data/catalog.json', import.meta.url), 'utf8'));
  const group = catalog.changes.find(c => c.id === 'chg-group-legacy-resource-commands');
  const sourceLanguages = new Map(catalog.sources.map(s => [s.id, s.language]));
  const before = structuredClone(group);
  for (const language of LANGUAGES) {
    const chosen = evidenceForLanguage(group.evidence, catalog.sources, language);
    assert.ok(chosen.length >= 11);
    assert.ok(chosen.every(e => sourceLanguages.get(e.source_id) === language));
    assert.deepEqual(chosen, group.evidence.filter(e => sourceLanguages.get(e.source_id) === language));
    for (const query of ['DELETE RESOURCE', 'SUPPRIMER RESSOURCE']) {
      assert.ok(filterChanges([group], { source: 'v16', target: 'v21', query,
        platforms: ['windows', 'macos'], modules: filterOptions([group], 'modules') }, catalog.latest).length);
    }
    const names = group.localizations[language].identifiers.join(' ');
    assert.ok(names.includes(language === 'fr' ? '_o_SUPPRIMER RESSOURCE' : '_o_DELETE RESOURCE'));
    assert.ok(!names.includes(language === 'fr' ? '_o_DELETE RESOURCE' : '_o_SUPPRIMER RESSOURCE'));
  }
  assert.deepEqual(group, before);
});

test('severity is highest first independent of stage, with unknown last and stable ID ties', () => {
  const records = [
    change('low', 'v18', { criticality: 'low', stage: 'syntax' }),
    change('block', 'v20', { criticality: 'blocking', stage: 'testing' }),
    change('unknown', 'v19', { criticality: null }),
  ];
  assert.equal(priorityForChange(records[1]), 0);
  assert.equal(stagePriorityForChange(records[0]), 0);
  assert.deepEqual(filterChanges(records).map(c => c.id), ['block', 'low', 'unknown']);
  assert.deepEqual(records.map(c => c.id), ['low', 'block', 'unknown']);
  const withinStage = [
    change('a-low', 'v20', { stage: 'syntax', criticality: 'low' }),
    change('z-block', 'v20', { stage: 'syntax', criticality: 'blocking' }),
    change('runtime-block', 'v20', { stage: 'runtime', criticality: 'blocking' }),
    change('modernization-block', 'v20', { stage: 'modernization', criticality: 'blocking' }),
  ];
  assert.deepEqual(filterChanges(withinStage).map(c => c.id),
    ['modernization-block', 'runtime-block', 'z-block', 'a-low']);
  assert.deepEqual(filterChanges([...withinStage].reverse()).map(c => c.id),
    filterChanges(withinStage).map(c => c.id));
});

const complexity = level => ({ level, basis: 'Documented replacement procedure.',
  evidence_source_ids: ['source'] });
test('complexity is remediation difficulty, simple to complex, unknown last; ties by severity then stable ID', () => {
  const records = [
    change('unknown', 'v20', { criticality: 'blocking' }),
    change('complex', 'v20', { criticality: 'low', complexity: complexity('complex') }),
    change('moderate', 'v20', { complexity: complexity('moderate') }),
    change('simple-low', 'v20', { criticality: 'low', complexity: complexity('simple') }),
    change('simple-a', 'v20', { complexity: complexity('simple') }),
    change('simple-b', 'v20', { complexity: complexity('simple') }),
    change('unknown-explicit', 'v20', { complexity: { level: 'unknown' } }),
  ];
  assert.deepEqual(COMPLEXITY_LEVELS, ['simple', 'moderate', 'complex', 'unknown']);
  assert.equal(complexityForChange(records[0]), 'unknown');
  const filters = { source: 'v19', target: 'v21', platforms: ['windows'], modules: ['language'], sort: 'complexity' };
  const snapshot = structuredClone(filters);
  assert.deepEqual(filterChanges(records, filters).map(c => c.id),
    ['simple-a', 'simple-b', 'simple-low', 'moderate', 'complex', 'unknown', 'unknown-explicit']);
  assert.deepEqual(filters, snapshot);
  assert.deepEqual(filterChanges([...records].reverse(), filters), filterChanges(records, filters));
  assert.equal(filterChanges(records, { ...filters, sort: 'severity' })[0].id, 'moderate');
});

test('complexity validation requires a supported level and documented evidence for known difficulty', () => {
  const base = { schema_version: 1, coverage: {}, latest: {}, semantic_search: {}, sources: [], changes: [] };
  for (const level of COMPLEXITY_LEVELS) {
    const record = change(level, 'v20', { complexity: complexity(level), evidence: [{ source_id: 'source' }] });
    assert.equal(validateCatalog({ ...base, changes: [record] }).changes[0], record);
  }
  for (const invalid of [null, [], 'simple', { level: 'easy' }, { level: 'simple' },
    { level: 'moderate', basis: ' ', evidence_source_ids: ['source'] },
    { level: 'complex', basis: 'Reason', evidence_source_ids: ['unrelated'] }]) {
    assert.throws(() => validateCatalog({ ...base, changes: [change('bad', 'v20', { complexity: invalid })] }), /invalidCatalog/);
  }
});

test('version icons use exact supplied palette, including concrete latest, without invented future colors', () => {
  assert.deepEqual(VERSION_COLORS, {
    v15: '#D74635', v16: '#8331AE', v17: '#3E8B93', v18: '#EB8E5F',
    v19: '#5682DF', v20: '#E23089', v21: '#3B69E9',
  });
  for (const [version, color] of Object.entries(VERSION_COLORS)) assert.equal(versionColor(version), color);
  assert.equal(versionColor('latest', { release: '21 R4' }), VERSION_COLORS.v21);
  assert.equal(versionColor('latest', { release: '22' }), null);
  assert.equal(versionColor('latest'), null);
});

test('directory has no planner controls, API or storage access and retains preferences and filters', async () => {
  const [html, app, logic, css] = await Promise.all(
    ['index.html', 'app.mjs', 'logic.mjs', 'styles.css'].map(path =>
      readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of [html, app, logic, css]) {
    assert.doesNotMatch(source, /checklist|textarea|check-label|button-group|\beffort\b|import-file|createObjectURL/i);
    assert.doesNotMatch(source, /(?:type\s*=\s*["']|\.type\s*=\s*["'])file["']/i);
  }
  for (const id of ['search', 'source-version', 'target-version', 'platform', 'module', 'sort', 'language', 'theme']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(app, /const PREFS = '4d-migration-preferences-v1'/);
  assert.deepEqual([...app.matchAll(/localStorage\.(\w+)\(([^,\n)]+)/g)].map(match => match.slice(1)),
    [['getItem', 'PREFS'], ['setItem', 'PREFS']]);
  assert.match(app, /JSON\.stringify\(\{ language: state\.language, theme: state\.theme \}\)/);
  assert.match(app, /checkbox\.type = 'checkbox'/);
  assert.doesNotMatch(html, /id="coverage"|view-nav|scope-notice|semantic-status/);
  assert.doesNotMatch(app, /renderCoverage|renderSources|renderClarifications/);
  assert.deepEqual([...html.matchAll(/<option value="(severity|complexity)"/g)].map(m => m[1]), ['severity', 'complexity']);
  for (const language of LANGUAGES) {
    assert.ok(translations[language].preferencesError);
    for (const key of ['checklist', 'localOnly', 'export', 'import', 'complete', 'effort', 'saved',
      'storageError', 'exported', 'imported', 'invalidImport', 'importReadError', 'importTooLarge']) {
      assert.equal(Object.hasOwn(translations[language], key), false, `${language}:${key}`);
    }
  }
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

test('known sample module/platform and complexity labels are localized', () => {
  assert.equal(translate('en', 'criticality'), 'Severity');
  assert.equal(translate('en', 'complexity'), 'Complexity');
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

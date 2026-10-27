import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { LANGUAGES, VERSION_BUCKETS, versionBucket, versionNumber, releaseKey, versionChoices, isLatestAvailable, crossesVersion,
  priorityForChange, stagePriorityForChange, filterChanges, validateCatalog, translations, translate,
  complexityForChange, COMPLEXITY_LEVELS, filterOptions, VERSION_COLORS, versionColor, evidenceForLanguage,
  sourceMatchesPath, evidenceForPath, projectChangeForPath, referencesForLanguage } from './logic.mjs';

const change = (id, bucket = 'v20', extra = {}) => ({
  id, threshold: { exact: /^v\d+$/.test(bucket) ? bucket.slice(1) : null, bucket, kind: 'introduced' }, type: 'restriction',
  criticality: 'blocking', platforms: ['all'], modules: ['language'],
  identifiers: ['OLD COMMAND:42'], localizations: {
    en: { one_line: 'Use a project', paragraph: 'Opening works.', action: 'Use a project.',
      conditions: ['The application uses this command.'], action_basis: 'Based on documented behavior.' },
    fr: { one_line: 'Utiliser un projet', paragraph: 'L’ouverture fonctionne.', action: 'Utilisez un projet.',
      conditions: ['L’application utilise cette commande.'], action_basis: 'Fondé sur le comportement documenté.' },
    de: { one_line: 'Ein Projekt verwenden', paragraph: 'Das Öffnen funktioniert.', action: 'Verwenden Sie ein Projekt.',
      conditions: ['Die Anwendung verwendet diesen Befehl.'], action_basis: 'Auf Grundlage des dokumentierten Verhaltens.' },
    es: { one_line: 'Utilizar un proyecto', paragraph: 'La apertura funciona.', action: 'Utilice un proyecto.',
      conditions: ['La aplicación utiliza este comando.'], action_basis: 'Basado en el comportamiento documentado.' },
    ja: { one_line: 'プロジェクトの変更', paragraph: '移行対象', action: 'プロジェクトを使用してください。',
      conditions: ['アプリケーションがこのコマンドを使用しています。'], action_basis: '文書化された動作に基づきます。' },
  },
  ...extra,
});

execFileSync('python3', ['-m', 'tools.catalog'], { cwd: new URL('../', import.meta.url) });
const editorialCatalog = JSON.parse(await readFile(new URL('./data/catalog.json', import.meta.url)));
const editorialChanges = editorialCatalog.changes;
const editorialById = new Map(editorialChanges.flatMap(record =>
  [record.id, ...record.member_ids].map(id => [id, record])));

test('reference URLs include every registered source in the selected language without fallback', () => {
  const original = JSON.stringify(editorialCatalog.sources);
  const cited = new Set(editorialChanges.flatMap(change => change.evidence.map(e => e.source_id)));
  const counts = { en: 58, fr: 40, de: 35, es: 40, ja: 40 };
  for (const language of LANGUAGES) {
    const sources = referencesForLanguage(editorialCatalog.sources, language);
    assert.equal(sources.length, counts[language]);
    assert.deepEqual(sources.map(s => s.id).sort(),
      editorialCatalog.sources.filter(s => s.language === language).map(s => s.id).sort());
    assert.ok(sources.some(s => !cited.has(s.id)), 'Uncited sources must not disappear');
    assert.ok(sources.every(s => s.title && s.edition && /^https?:\/\//.test(s.url)));
  }
  assert.deepEqual(referencesForLanguage(editorialCatalog.sources.filter(s => s.language === 'en'), 'ja'), []);
  assert.equal(JSON.stringify(editorialCatalog.sources), original);
});

test('reference titles sort by language, then numeric edition and stable ID', () => {
  const sources = [
    { id: 'later', language: 'en', title: 'Release notes', edition: '20' },
    { id: 'b', language: 'en', title: 'Release notes', edition: '9' },
    { id: 'a', language: 'en', title: 'Release notes', edition: '9' },
    { id: 'first', language: 'en', title: 'Compatibility', edition: '21' },
  ];
  assert.deepEqual(referencesForLanguage(sources, 'en').map(s => s.id), ['first', 'a', 'b', 'later']);
});

test('original KB secondary evidence keeps edition context before locale preference', () => {
  const sources = editorialCatalog.sources;
  const latest = editorialCatalog.latest;
  const lists = editorialById.get('chg-project-save-list-call');
  const old = projectChangeForPath(lists, sources, 'v17', 'v18', latest);
  assert.ok(old.evidence.length);
  assert.ok(old.evidence.every(e => !e.source_id.startsWith('kb-')));
  assert.equal(old.evidence_disposition, 'in_path');
  const modern = projectChangeForPath(lists, sources, 'v16', 'v21', latest);
  const english = evidenceForLanguage(modern.evidence, sources, 'en');
  assert.ok(english.some(e => e.source_id === 'kb-78951-en' && e.pdf.page === 3));
  assert.ok(english.some(e => e.source_id === 'kb-79155-en' && e.pdf.page === 12));
  assert.ok(english.some(e => e.source_id === 'legacy-v18-deprecated-en'));
  const french = evidenceForLanguage(modern.evidence, sources, 'fr');
  assert.ok(french.length && french.every(e => e.source_id.endsWith('-fr')));
  for (const language of LANGUAGES) {
    const identity = projectChangeForPath(editorialById.get('chg-project-standalone-designer-identity'),
      sources, 'v16', 'v21', latest);
    const selected = evidenceForLanguage(identity.evidence, sources, language);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].url, 'https://kb.4d.com/assetid=79155');
    assert.equal(selected[0].pdf.page, 4);
  }
  const historicalIdentity = projectChangeForPath(editorialById.get('chg-project-standalone-designer-identity'),
    sources, 'v17', 'v18', latest);
  assert.equal(historicalIdentity.evidence_disposition, 'unresolved');
  assert.deepEqual(historicalIdentity.evidence, []);
  assert.equal(sourceMatchesPath({ edition: '19 R' }, 'v16', 'v19'), false);
  assert.equal(sourceMatchesPath({ edition: '19 R' }, 'v16', 'v20'), true);
  assert.equal(sourceMatchesPath({ edition: '20 R' }, 'v20', '20 R6'), false);
  assert.equal(sourceMatchesPath({ edition: '20 R' }, 'v20', 'v21'), true);
  assert.equal(sourceMatchesPath({ edition: '20 R' }, '20 R6', 'v21'), false);
  assert.equal(sourceMatchesPath({ edition: '21 R' }, 'v21', 'latest', latest), false);
});

test('real catalog crosses historical removal buckets, not document editions or source-equal thresholds', () => {
  assert.equal(editorialChanges.length, 202);
  assert.equal(editorialChanges.flatMap(c => c.member_ids).length, 276);
  assert.equal(editorialChanges.filter(c => c.member_ids.length > 1).length, 28);
  assert.equal(editorialChanges.filter(c => c.member_ids.length > 1).flatMap(c => c.member_ids).length, 102);
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
    ['chg-colon-identifiers', 'chg-cs-class-assignment-check', 'chg-group-v19-compiler-settings']);
  assert.ok(sorted.every(c => complexityForChange(c) === 'unknown'));
  assert.deepEqual(filterChanges(editorialChanges, { sort: 'complexity' }).map(c => c.id),
    sorted.map(c => c.id));
});

test('upgrade filtering keeps applicability counts independent of catalog totals', () => {
  const upgrade = target => editorialChanges.map(c =>
    projectChangeForPath(c, editorialCatalog.sources, 'v16', target, editorialCatalog.latest))
    .filter(Boolean);
  assert.equal(filterChanges(upgrade('v21'), { includeRoutine: true }).length, 190);
  assert.equal(filterChanges(upgrade('latest'), { target: 'latest', includeRoutine: true }, editorialCatalog.latest).length, 199);
  assert.equal(filterChanges(upgrade('v21')).length, 181);
  assert.equal(filterChanges(upgrade('latest'), { target: 'latest' }, editorialCatalog.latest).length, 189);
  for (const target of ['v21', 'latest']) {
    const records = upgrade(target);
    const pruned = filterChanges(records, { target }, editorialCatalog.latest);
    const included = filterChanges(records, { target, includeRoutine: true }, editorialCatalog.latest);
    assert.deepEqual(pruned.map(c => c.id), included.filter(c => !c.default_visibility).map(c => c.id));
    assert.ok(pruned.some(c => c.id === 'chg-object-index-rare-corruption'));
    assert.ok(pruned.some(c => c.id === 'chg-legacy-network-layer-deprecation'));
  }
});

test('the client 20.7 minimum is opt-in in every language without changing authored content', () => {
  const record = editorialById.get('chg-client-minimum-20-7');
  assert.equal(record.default_visibility.category, 'routine_check');
  for (const query of ['chg-client-minimum-20-7', ...LANGUAGES.map(language => record.localizations[language].one_line)]) {
    assert.deepEqual(filterChanges([record], { query }), []);
    assert.deepEqual(filterChanges([record], { query, includeRoutine: true }).map(c => c.id), [record.id]);
  }
});

test('routine checks are hidden by explicit metadata, not severity, and remain available on request', () => {
  const routine = change('routine', 'v20', {
    default_visibility: { category: 'routine_check', reason: 'Standard minimum version.' },
  });
  const actionable = change('actionable', 'v20', { criticality: 'low' });
  assert.deepEqual(filterChanges([routine, actionable]).map(c => c.id), ['actionable']);
  assert.deepEqual(filterChanges([routine], { query: 'routine' }), []);
  assert.deepEqual(filterChanges([routine, actionable], { includeRoutine: true }).map(c => c.id),
    ['routine', 'actionable']);
  assert.deepEqual(filterChanges([routine], { includeRoutine: true, platforms: [] }), []);
  assert.deepEqual(filterChanges([routine], { includeRoutine: true, modules: [] }), []);
  assert.deepEqual(filterChanges([routine], { includeRoutine: true, target: 'v19' }), []);
  assert.deepEqual(filterChanges([routine], { includeRoutine: true, source: 'v20' }), []);
  assert.deepEqual(filterChanges([routine], { includeRoutine: true, query: 'no-such-command' }), []);
});

test('invalid default visibility metadata fails catalog validation instead of silently hiding entries', () => {
  const record = change('metadata');
  const document = { schema_version: 1, sources: [], changes: [record],
    coverage: {}, latest: {}, semantic_search: {} };
  for (const metadata of [null, true, [], {}, { category: 'important', reason: 'Keep' },
    { category: 'routine_check', reason: ' ' }, { category: 'routine_check', reason: 'Routine', extra: true }]) {
    record.default_visibility = metadata;
    assert.throws(() => validateCatalog(document), /invalidCatalog/);
  }
  record.default_visibility = { category: 'routine_check', reason: 'Standard minimum version.' };
  assert.equal(validateCatalog(document), document);
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
  assert.equal(new Set(membership).size, 276);
  for (const id of membership) {
    const entity = editorialById.get(id);
    const target = entity.applicability?.target_releases?.[0] ?? (entity.applies_until ? 'v20' : 'v21');
    assert.ok(filterChanges(editorialChanges, { source: 'unknown', target, query: id, includeRoutine: true })
      .some(c => c.id === entity.id), id);
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

test('exact release ordering preserves patches, R cycles, HF and build provenance', () => {
  const ordered = ['19.7 build288986', '20', '20.2 build100956', '20.3', '20 R2',
    '20 R2 HF1 build100440', '20 R3', '21', '21 R3', '21 R4', '21 R5'];
  const compare = (a, b) => a.map((value, i) => value - b[i]).find(value => value) ?? 0;
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(compare(releaseKey(ordered[i - 1]), releaseKey(ordered[i])) < 0);
  }
  assert.deepEqual(releaseKey('4D v20R2 HF1 (build 100440)'), releaseKey('20 R2 HF1 build100440'));
  for (const invalid of ['release 20', '20 R', '20 build1)', '20 beta', null]) {
    assert.equal(releaseKey(invalid), null);
  }
  const latest = { release: '21 R4' };
  const record = exact => change('exact', 'latest', {
    threshold: { exact, bucket: exact.startsWith('20 R') ? 'v21' :
      exact.startsWith('20.') ? 'v20' : 'latest', kind: 'introduced' },
  });
  for (const [exact, from, to, expected] of [
    ['21 R3', 'v21', 'v21', false],
    ['21 R3', 'v21', 'latest', true],
    ['21 R5', 'v21', 'latest', false],
    ['20 R3', 'v21', 'latest', false],
    ['20 R3', 'v20', 'v21', true],
    ['20.3', 'v20', 'latest', true],
    ['20.3', 'v20', 'v20', true],
    ['20.3', '20.3', 'latest', false],
    ['20 R2 HF1 build100440', '20 R2 HF1 build100439', '20 R2 HF1 build100440', true],
    ['20 R2 HF1 build100440', '20 R2 HF1 build100440', 'latest', false],
  ]) assert.equal(crossesVersion(record(exact), from, to, latest), expected, `${exact}: ${from} → ${to}`);
});

test('branch cutoffs are alternatives and exclusive bounds concern only the final target', () => {
  const alternatives = ['19.7 build288986', '20.2 build100956', '20 R2 HF1 build100440', '20 R3'];
  const branched = change('branches', 'v19', {
    threshold: { exact: alternatives[0], bucket: 'v19', kind: 'target_requirement', alternatives },
  });
  const latest = { release: '21 R4' };
  assert.equal(crossesVersion(branched, 'v20', 'latest', latest), true);
  assert.equal(crossesVersion(branched, 'v21', 'latest', latest), false);
  assert.deepEqual(filterChanges([branched], {
    source: 'v20', target: 'latest', query: '100440',
  }, latest).map(c => c.id), ['branches']);
  assert.deepEqual(branched.threshold.alternatives, alternatives);
  const workaround = change('workaround', 'v19', { applies_until: '20 R3' });
  for (const [to, expected] of [['v20', true], ['20 R2', true], ['20 R3', false],
    ['v21', false], ['latest', false]]) {
    assert.equal(crossesVersion(workaround, 'v18', to, latest), expected, to);
  }
  assert.equal(crossesVersion({ ...workaround, type: 'deprecation' }, 'v20', 'v21', latest), false);
  assert.equal(crossesVersion({ ...workaround, applies_until: 'v21' }, 'v18', 'v21', latest), false);
});

test('canonical backports already reached on the source branch are not applied twice', () => {
  const latest = { release: '21 R4' };
  // Exact alternatives from the Stage 3 canonical records; source branch matters
  // even though the visitor UI currently exposes only coarse major selectors.
  for (const [alternatives, cases] of [
    [['20.7 HF2', '20 R10'], [
      ['v20', true], ['20.7 HF1', true], ['20.7 HF2', false], ['20.8', false],
      ['20 R9', true], ['20 R10', false],
    ]],
    [['20.3', '20 R4'], [
      ['v20', true], ['20.2', true], ['20.3', false], ['20.4', false],
      ['20 R3', true], ['20 R4', false],
    ]],
    [['20.1 HF1', '20.2', '20 R2'], [
      ['v20', true], ['20.1', true], ['20.1 HF1', false], ['20.2', false],
      ['20 R1', true], ['20 R2', false],
    ]],
    [['19.7 build 288986', '20.2 build 100956', '20 R2 HF1 build 100440', '20 R3'], [
      ['v19', true], ['19.7 build 288985', true], ['19.7 build 288986', false],
      ['19.8', false], ['v20', true], ['20.2 build 100955', true],
      ['20.2 build 100956', false], ['20.3', false], ['20 R2', true],
      ['20 R2 HF1 build 100439', true], ['20 R2 HF1 build 100440', false],
      ['20 R3', false], ['20 R4', false],
    ]],
  ]) {
    const record = change('canonical', 'v20', {
      threshold: { exact: alternatives[0], bucket: alternatives[0].startsWith('19.') ? 'v19' : 'v20',
        kind: 'introduced', alternatives },
    });
    const original = structuredClone(record);
    for (const [source, expected] of cases) {
      assert.equal(crossesVersion(record, source, 'latest', latest), expected,
        `${alternatives.join(' / ')} from ${source}`);
      assert.equal(crossesVersion({ ...record, type: 'deprecation' }, source, 'latest', latest), true,
        `deprecation continues from ${source}`);
    }
    assert.deepEqual(record, original);
  }
});

test('documented exact-target requirements do not force an invented intermediate client/server pair', () => {
  const record = change('icu-pair', 'v20', {
    threshold: { exact: '20.1', bucket: 'v20', kind: 'introduced' },
    applies_until: null, applicability: { target_releases: ['20.1'] },
  });
  const latest = { release: '21 R4' };
  for (const [source, target, expected] of [
    ['v19', 'v20', true], ['v20', 'v20', true], ['v20', '20.1', true],
    ['v20', '20.2', false], ['v20', 'v21', false], ['v19', 'latest', false],
    ['v20', 'latest', false], ['unknown', 'v21', false], ['unknown', 'v20', true],
  ]) assert.equal(crossesVersion(record, source, target, latest), expected, `${source} → ${target}`);
  assert.equal(crossesVersion(record, 'v20', 'latest', { release: '20.1' }), true);
  assert.equal(record.applies_until, null);
  const catalog = changes => ({ schema_version: 1, coverage: {}, latest: {}, semantic_search: {}, sources: [], changes });
  validateCatalog(catalog([record]));
  for (const targets of [null, [], ['latest'], ['20.1', '20.1'], ['invalid'], [20.1]]) {
    assert.throws(() => validateCatalog(catalog([{ ...record, applicability: { target_releases: targets } }])),
      /invalidCatalog/);
  }
  const members = ['a', 'b'].map(id => ({ ...structuredClone(record), id }));
  const group = { ...record, id: 'pair-group', members, member_ids: ['a', 'b'] };
  validateCatalog(catalog([group]));
  members[1].applicability.target_releases = ['20.2'];
  assert.throws(() => validateCatalog(catalog([group])), /invalidCatalog/);
});

test('citation path selection precedes locale selection and retains every distinct English fallback', () => {
  const sources = [
    { id: 'old', edition: '16', language: 'en' },
    { id: 'source', edition: '17', language: 'en' },
    { id: 'target', edition: '18.2', language: 'en' },
    { id: 'r-cycle', edition: '17 R5', language: 'en' },
    { id: 'later-fr', edition: '19', language: 'fr' },
    { id: 'moving', edition: '18', language: 'fr', documentation_channel: 'moving-current' },
    { id: 'unknown', edition: 'unverified', language: 'fr' },
  ];
  const records = sources.map(source => ({ source_id: source.id, excerpt: source.id }));
  records.push({ source_id: 'target', excerpt: 'a second distinct supporting block' }, { ...records[2] });
  const selected = evidenceForPath(records, sources, 'v17', 'v18');
  assert.deepEqual(selected.map(record => record.source_id), ['target', 'target', 'r-cycle', 'source']);
  assert.deepEqual(evidenceForLanguage(selected, sources, 'fr'), selected);
  assert.equal(sourceMatchesPath(sources[2], 'v17', '18.1'), false);
  assert.equal(sourceMatchesPath(sources[3], 'v17', 'v17'), false);
  assert.equal(sourceMatchesPath(sources[3], 'v17', 'v18'), true);
  assert.deepEqual(evidenceForPath(records, sources, 'unknown', 'v18'), []);
  assert.deepEqual(evidenceForPath(records, sources, 'v19', 'v18'), []);
  const latest = { release: '21 R4' };
  assert.equal(sourceMatchesPath({ edition: '21 R4' }, 'v21', 'latest', latest), true);
  assert.equal(sourceMatchesPath({ edition: '21 R5' }, 'v21', 'latest', latest), false);
  assert.equal(sourceMatchesPath({ edition: '21 R4', documentation_channel: 'moving-current' },
    'v21', 'latest', latest), false);
  assert.equal(sourceMatchesPath({ edition: '21 R4', fetch: { documentation: { channel_label: 'BETA' } } },
    'v21', 'latest', latest), false);
  assert.equal(sourceMatchesPath({ edition: '19.7 / 20.2 / 20 R2 HF1 / 20 R3' }, 'v20', 'v21'), true);
  const unavailable = { id: 'target', edition: '18.2', language: 'en',
    fetch: { status: 'failed', error: 'Source temporarily unavailable' } };
  assert.deepEqual(evidenceForPath([records[2]], [unavailable], 'v17', 'v18'), [records[2]]);
  assert.equal(sourceMatchesPath({ ...unavailable, edition: '19' }, 'v17', 'v18'), false);
});

test('path projections retain applicable facts, isolate group members and signal unresolved support', () => {
  const sources = [{ id: 'v18', edition: '18', language: 'en' },
    { id: 'v19', edition: '19', language: 'fr' }];
  const first = change('first', 'v18', { evidence: [{ source_id: 'v18', excerpt: 'first' }] });
  const unresolved = change('unresolved', 'v18', { evidence: [{ source_id: 'v19', excerpt: 'too late' }] });
  const future = change('future', 'v19', { evidence: [{ source_id: 'v18', excerpt: 'not yet applicable' }] });
  const group = change('group', 'v18', { members: [first, unresolved, future],
    member_ids: ['first', 'unresolved', 'future'],
    evidence: [{ source_id: 'v18', excerpt: 'group-only supplemental workaround' }] });
  const original = structuredClone(group);
  const projection = projectChangeForPath(group, sources, 'v17', 'v18');
  assert.deepEqual(projection.member_ids, original.member_ids);
  assert.deepEqual(projection.visible_member_ids, ['first', 'unresolved']);
  assert.deepEqual(projection.members.map(member => member.id), ['first', 'unresolved']);
  assert.deepEqual(projection.evidence, first.evidence);
  assert.deepEqual(projection.unresolved_member_ids, ['unresolved']);
  assert.equal(projection.evidence_disposition, 'partial');
  assert.equal(projection.evidence_path_unresolved, true);
  assert.equal(projection.members[1].evidence_disposition, 'unresolved');
  assert.deepEqual(projection.members[1].evidence, []);
  assert.deepEqual(filterChanges([projection], { source: 'v17', target: 'v18', query: 'future' }), []);
  assert.equal(projectChangeForPath(future, sources, 'v17', 'v18'), null);
  assert.equal(projectChangeForPath(group, sources, 'v18', 'v18'), null);
  const unsupported = projectChangeForPath(unresolved, sources, 'v17', 'v18');
  assert.equal(unsupported.id, unresolved.id);
  assert.deepEqual(unsupported.evidence, []);
  assert.equal(unsupported.evidence_disposition, 'unresolved');
  assert.equal(unsupported.evidence_path_unresolved, true);
  projection.members[0].localizations.en.paragraph = 'modified visible copy';
  projection.evidence[0].excerpt = 'modified visible citation';
  projection.member_ids.pop();
  assert.deepEqual(group, original);
});

test('live historical XSLT projection never borrows v19/v20 workaround citations for v17 to v18', () => {
  const original = editorialById.get('chg-removed-xslt-apply-transformation');
  const before = structuredClone(original);
  const projected = projectChangeForPath(original, editorialCatalog.sources, 'v17', 'v18', editorialCatalog.latest);
  assert.ok(projected);
  assert.equal(projected.evidence_disposition, 'in_path');
  assert.equal(projected.evidence_path_unresolved, false);
  assert.ok(projected.evidence.some(record => record.source_id === 'legacy-v18-deprecated-en'));
  assert.ok(projected.evidence.every(record =>
    sourceMatchesPath(editorialCatalog.sources.find(source => source.id === record.source_id),
      'v17', 'v18', editorialCatalog.latest)));
  assert.ok(!projected.evidence.some(record => /legacy-v(?:19|20)-/.test(record.source_id)));
  for (const language of LANGUAGES) {
    const localized = evidenceForLanguage(projected.evidence, editorialCatalog.sources, language);
    assert.ok(localized.length);
    assert.ok(localized.every(record => !/legacy-v(?:19|20)-/.test(record.source_id)));
    assert.equal(editorialCatalog.sources.find(source => source.id === localized[0].source_id).edition, '18.2');
  }
  assert.deepEqual(original, before);
});

test('live later-only support stays explicitly unresolved on earlier migration paths', () => {
  for (const [id, from, to] of [
    ['chg-cpu-priority-settings', 'v16', 'v17'],
    ['chg-interprocess-variable-deprecation', 'v16', 'v17'],
    ['chg-interprocess-variable-deprecation', 'v17', 'v18'],
    ['chg-project-save-list-call', 'v16', 'v17'],
  ]) {
    const record = editorialById.get(id);
    assert.equal(record.threshold.kind, 'unknown');
    assert.equal(crossesVersion(record, from, to, editorialCatalog.latest), true);
    const projected = projectChangeForPath(record, editorialCatalog.sources, from, to, editorialCatalog.latest);
    assert.ok(projected, id);
    assert.equal(projected.evidence_path_unresolved, true, id);
    assert.equal(projected.evidence_disposition, 'unresolved', id);
    assert.deepEqual(projected.evidence, [], id);
    for (const language of LANGUAGES) {
      assert.deepEqual(evidenceForLanguage(projected.evidence, editorialCatalog.sources, language), []);
    }
  }
});

test('live numeric-action group prefers v18.2 and never borrows future citations on v17 to v18', () => {
  const record = editorialById.get('chg-numeric-standard-actions');
  const projected = projectChangeForPath(record, editorialCatalog.sources, 'v17', 'v18', editorialCatalog.latest);
  assert.ok(projected);
  assert.equal(projected.evidence_path_unresolved, false);
  assert.deepEqual(projected.visible_member_ids, record.member_ids);
  assert.ok(projected.evidence.every(evidence => !/legacy-v(?:19|20)-/.test(evidence.source_id)));
  for (const language of LANGUAGES) {
    const selected = evidenceForLanguage(projected.evidence, editorialCatalog.sources, language);
    assert.ok(selected.length);
    assert.equal(editorialCatalog.sources.find(source => source.id === selected[0].source_id).edition, '18.2');
  }
  assert.equal(projectChangeForPath(editorialById.get('chg-removed-enable-button'),
    editorialCatalog.sources, 'v17', 'v18', editorialCatalog.latest), null);
});

test('catalog validates branch lists, exact bounds and complete grouped applicability', () => {
  const threshold = { exact: '19.7 build288986', bucket: 'v19', kind: 'introduced',
    alternatives: ['19.7 build288986', '20.2 build100956', '20 R3'] };
  const record = change('branch', 'v19', { threshold, applies_until: '21 R3' });
  const catalog = changes => ({ schema_version: 1, coverage: {}, latest: {}, semantic_search: {}, sources: [], changes });
  assert.equal(validateCatalog(catalog([record])).changes[0], record);
  assert.throws(() => validateCatalog(catalog([{ ...record,
    threshold: { ...threshold, exact: '20 R3', bucket: 'v20' } }])), /invalidCatalog/);
  for (const alternatives of [null, [], '20 R3', ['20 R3'], [threshold.exact, threshold.exact],
    [threshold.exact, 'garbage']]) {
    assert.throws(() => validateCatalog(catalog([{ ...record,
      threshold: { ...threshold, alternatives } }])), /invalidCatalog/);
  }
  for (const bound of ['20 R3', '19', '', 'invalid', 21]) {
    assert.throws(() => validateCatalog(catalog([{ ...record, applies_until: bound }])), /invalidCatalog/);
  }
  const members = ['a', 'b'].map(id => ({ ...structuredClone(record), id }));
  const group = { ...record, id: 'group', members, member_ids: ['a', 'b'] };
  assert.equal(validateCatalog(catalog([group])).changes[0], group);
  members[1].applies_until = '21 R4';
  assert.throws(() => validateCatalog(catalog([group])), /invalidCatalog/);
  members[1].applies_until = record.applies_until;
  members[1].threshold.alternatives.pop();
  assert.throws(() => validateCatalog(catalog([group])), /invalidCatalog/);
  members[1].threshold = structuredClone(record.threshold);
  members[1].threshold.bucket = 'v20';
  assert.throws(() => validateCatalog(catalog([group])), /invalidCatalog/);
});

test('catalog requires authored localized conditions, actions and applicable rationales', () => {
  const record = change('localized', 'v20', { action_basis: 'Based on documented behavior.' });
  const catalog = changes => ({ schema_version: 1, coverage: {}, latest: {}, semantic_search: {}, sources: [], changes });
  assert.equal(validateCatalog(catalog([record])).changes[0], record);
  for (const language of LANGUAGES) {
    for (const [field, value] of [['conditions', undefined], ['conditions', []], ['conditions', [' ']],
      ['action', undefined], ['action', ' '], ['action_basis', undefined], ['action_basis', ' ']]) {
      const invalid = structuredClone(record);
      if (value === undefined) delete invalid.localizations[language][field];
      else invalid.localizations[language][field] = value;
      assert.throws(() => validateCatalog(catalog([invalid])), /invalidCatalog/, `${language}: ${field}`);
    }
  }
  for (const field of ['conditions', 'action_basis']) {
    const invalid = structuredClone(record);
    invalid.localizations.fr[field] = structuredClone(invalid.localizations.en[field]);
    assert.throws(() => validateCatalog(catalog([invalid])), /invalidCatalog/);
  }
  const invariant = structuredClone(record);
  for (const text of Object.values(invariant.localizations)) {
    text.conditions = ['_o_COMMAND', 'OLD COMMAND:42'];
    text.action_basis = '_o_COMMAND';
  }
  assert.equal(validateCatalog(catalog([invariant])).changes[0], invariant);
  for (const text of Object.values(invariant.localizations)) text.conditions = ['Application uses _o_COMMAND.'];
  assert.throws(() => validateCatalog(catalog([invariant])), /invalidCatalog/);
  const group = { ...record, member_ids: ['a', 'b'], members: ['a', 'b'].map(id => ({ ...structuredClone(record), id })) };
  delete group.members[1].localizations.ja.action;
  assert.throws(() => validateCatalog(catalog([group])), /invalidCatalog/);
});

test('path evidence notices and Stage 3 module labels are authored in all five locales', () => {
  for (const language of LANGUAGES) {
    const dictionary = translations[language];
    for (const key of ['pathEvidenceUnavailable', 'JSON', 'SQL', 'network', 'components', 'deployment']) {
      assert.ok(typeof dictionary[key] === 'string' && dictionary[key].trim(), `${language}: ${key}`);
    }
    assert.equal(dictionary.JSON, 'JSON');
    assert.equal(dictionary.SQL, 'SQL');
    if (language !== 'en') {
      for (const key of ['pathEvidenceUnavailable', 'network', 'components', 'deployment']) {
        assert.notEqual(dictionary[key], translations.en[key], `${language}: ${key}`);
      }
    }
  }
});

test('exclusive final-target bounds are labelled explicitly in all five locales', () => {
  for (const [language, expected] of Object.entries({
    en: 'Before target release', fr: 'Avant la version cible', de: 'Vor Zielversion',
    es: 'Antes de la versión de destino', ja: 'この移行先バージョンより前まで',
  })) assert.equal(translate(language, 'appliesUntil'), expected);
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
  for (const id of ['include-routine', 'search', 'source-version', 'target-version', 'platform', 'module', 'sort', 'language', 'theme']) {
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
    assert.ok(translate(language, 'resultCount', { count: 3 }).includes('3'));
  }
});

test('result counts display only matches and the catalog mode selector is absent', async () => {
  const [html, app] = await Promise.all(['index.html', 'app.mjs'].map(path =>
    readFile(new URL(path, import.meta.url), 'utf8')));
  assert.doesNotMatch(html, /browse-mode|catalog-note/);
  assert.doesNotMatch(app, /catalogResultCount|total: catalog\.changes\.length/);
  for (const language of LANGUAGES) {
    assert.deepEqual([...translations[language].resultCount.matchAll(/\{\w+\}/g)].map(m => m[0]), ['{count}']);
    for (const key of ['browseMode', 'forMyUpgrade', 'allCatalogEntries', 'catalogResultCount', 'catalogNote']) {
      assert.equal(Object.hasOwn(translations[language], key), false, `${language}:${key}`);
    }
    for (const count of [0, 1, 190, 199]) {
      const label = translate(language, 'resultCount', { count });
      assert.ok(label.includes(String(count)));
      assert.ok(!label.includes('202'));
    }
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

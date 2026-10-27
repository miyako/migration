import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corpusRows, normalizedVector, scoreFacts, hybridFilter, entityScore } from './semantic.mjs';
import { filterChanges, projectChangeForPath } from './logic.mjs';
import { searchLabels } from './search-labels.mjs';
import { runInNewContext } from 'node:vm';

const catalog = JSON.parse(readFileSync(new URL('./data/catalog.json', import.meta.url)));
test('all five visitor notices are brief and contain no opt-in or technical budget prose', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /meaning-enable|meaning-budget|meaning-cancel/);
  assert.match(html, /id="meaning-progress"/);
  assert.match(html, /id="meaning-retry"/);
  for (const labels of Object.values(searchLabels)) {
    assert.ok(labels.notice && labels.ready && labels.loading && labels.unavailable && labels.error && labels.retry);
    assert.ok(labels.notice.length < 100);
    assert.doesNotMatch(JSON.stringify(labels), /0\.74|threshold|236|2 GB|2 Go|任意|Optional|Facultatif|Opcional|selected sort|tri choisi|Sortierung|orden elegido|並び順|query is not sent|requête n’est pas envoyée|検索文は外部/);
    assert.equal(labels.enable, undefined);
    assert.equal(labels.budget, undefined);
  }
});
// Unit doubles exercise lifecycle races and deadlines, not semantic inference.
function lifecycle(adapter = async () => ({})) {
  const elements = new Map();
  const timers = new Map();
  const workers = [];
  let nextTimer = 0;
  const source = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('const $ ='), source.indexOf("const PREFS ="))
    .replaceAll('import.meta.url', JSON.stringify(new URL('./app.mjs', import.meta.url).href));
  const context = {
    searchLabels, URL, Map, navigator: {gpu: {requestAdapter: adapter}},
    corpusRows: () => [], renderChanges() {},
    document: {getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        dataset: {}, classList: {toggle() {}}, attributes: {},
        setAttribute(key, value) {this.attributes[key] = value;},
        removeAttribute(key) {delete this.attributes[key];},
      });
      return elements.get(id);
    }},
    setTimeout(callback, ms) {
      const id = ++nextTimer;
      timers.set(id, {callback, ms});
      return id;
    },
    clearTimeout(id) {timers.delete(id);},
    Worker: class {
      constructor() {this.messages = []; workers.push(this);}
      postMessage(message) {this.messages.push(message);}
      terminate() {this.terminated = true;}
    },
  };
  const api = runInNewContext(`${code}
    const state = {language:'en',query:'',catalog:{semantic_search:{status:'automatic'}}};
    ({meaning,state,enableMeaning,queryMeaning,stopMeaning});`, context);
  const fire = ms => {
    const [id, timer] = [...timers].find(([, timer]) => timer.ms === ms) ?? [];
    assert.ok(timer, `Expected ${ms} ms timer`);
    timers.delete(id);
    timer.callback();
  };
  return {...api, workers, timers, elements, fire};
}
test('loading keeps its generation while typing and runs only the current query and locale', async () => {
  const app = lifecycle();
  await app.enableMeaning();
  const worker = app.workers[0];
  const generation = app.meaning.generation;
  app.state.query = 'old query';
  app.queryMeaning();
  app.state.language = 'fr';
  app.state.query = 'current query';
  app.queryMeaning();
  assert.equal(app.meaning.generation, generation);
  assert.equal(app.workers.length, 1);
  worker.onmessage({data:{type:'progress',file:'model',loaded:1,total:1,progress:100}});
  assert.equal(app.meaning.progress, null, 'Metadata range is not a complete model download');
  worker.onmessage({data:{type:'progress',file:'model',loaded:25,total:100}});
  assert.equal(app.meaning.progress, 25);
  worker.onmessage({data:{type:'ready'}});
  app.fire(250);
  assert.equal(worker.messages[1].query, 'current query');
  assert.equal(worker.messages[1].language, 'fr');
  const staleSequence = worker.messages[1].sequence;
  app.state.query = 'newer query';
  app.queryMeaning();
  worker.onmessage({data:{type:'results',sequence:staleSequence,scores:[['stale',1]]}});
  assert.equal(app.meaning.scores, null, 'Old inference cannot display stale matches');
  app.fire(250);
  worker.onmessage({data:{type:'results',sequence:app.meaning.sequence,scores:[['current',.8]]}});
  assert.equal(app.meaning.scores.get('current'), .8);
  assert.equal(app.meaning.status, 'ready');
  assert.equal(app.timers.size, 0);
});
test('query deadline is localized, kills the worker, and late callbacks cannot undo retry', async () => {
  const app = lifecycle();
  await app.enableMeaning();
  const old = app.workers[0];
  app.state.query = 'query';
  old.onmessage({data:{type:'ready'}});
  app.fire(250);
  app.state.language = 'ja';
  app.fire(60000);
  assert.equal(app.meaning.status, 'error');
  assert.equal(app.meaning.detail, searchLabels.ja.queryTimeout);
  assert.equal(old.terminated, true);
  assert.equal(app.meaning.enabled, false);
  assert.equal(app.timers.size, 0, 'No automatic retry');
  await app.enableMeaning();
  old.onmessage({data:{type:'ready'}});
  old.onerror({message:'late worker error'});
  assert.equal(app.meaning.status, 'loading');
  assert.equal(app.workers.length, 2);
  app.stopMeaning();
  assert.equal(app.workers[1].terminated, true);
  assert.equal(app.timers.size, 0);
});
test('load deadline and page cleanup invalidate a pending adapter without downloading runtime', async () => {
  for (const timeout of [true,false]) {
    let resolveAdapter;
    const app = lifecycle(() => new Promise(resolve => {resolveAdapter = resolve;}));
    const loading = app.enableMeaning();
    if (timeout) {
      app.fire(180000);
      assert.equal(app.meaning.status, 'error');
      assert.equal(app.meaning.detail, searchLabels.en.loadTimeout);
    } else app.stopMeaning();
    resolveAdapter({});
    await loading;
    assert.equal(app.workers.length, 0);
    assert.equal(app.timers.size, 0);
  }
});
test('missing adapter and unsupported model config stop before any worker or runtime download', async () => {
  for (const config of ['automatic','unavailable']) {
    const app = lifecycle(async () => null);
    app.state.catalog.semantic_search.status = config;
    await app.enableMeaning();
    assert.equal(app.meaning.status, 'unavailable');
    assert.equal(app.meaning.enabled, false);
    assert.equal(app.workers.length, 0);
    assert.equal(app.timers.size, 0);
  }
});
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
test('semantic matches cannot reintroduce routine or advisory items unless explicitly included', () => {
  const actionable = catalog.changes.find(c => !c.default_visibility);
  const routine = { ...actionable, id: 'routine', member_ids: ['routine-member'],
    threshold: { kind: 'unknown', exact: null, bucket: null }, applies_until: null, applicability: {},
    default_visibility: { category: 'routine_check', reason: 'Standard minimum version.' } };
  const advisory = { ...routine, id: 'advisory', member_ids: ['advisory-member'],
    default_visibility: { category: 'optional_adoption', reason: 'Opt-in option.', target_releases: ['21'] } };
  const scores = new Map([['routine-member', 1], ['advisory-member', 1]]);
  const filters = { source: 'unknown', target: 'v21' };
  const records = [actionable, routine, advisory];
  assert.deepEqual(hybridFilter(filterChanges(records, filters), [], scores, .74), []);
  assert.deepEqual(hybridFilter(filterChanges(records, { ...filters, includeRoutine: true }),
    [], scores, .74).map(c => c.id).sort(), ['advisory', 'routine']);
  assert.deepEqual(hybridFilter(filterChanges(records, { ...filters, target: '22' }),
    [], scores, .74).map(c => c.id), ['advisory']);
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
    const eligible = filterChanges(projected,{source:item.source,target:item.target,includeRoutine:true},catalog.latest);
    for (const id of item.expected_entity_ids) assert.ok(eligible.some(c => c.id === id),`${item.id}: ${id}`);
  }
  for (const language of ['en','fr','de','es','ja']) {
    assert.equal(fixture.cases.filter(c => c.language === language && c.expected_entity_ids.length).length,6);
    assert.equal(fixture.cases.filter(c => c.language === language && !c.expected_entity_ids.length).length,2);
  }
});

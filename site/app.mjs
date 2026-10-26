import {
  LANGUAGES, translations, translate, filterChanges,
  versionNumber, versionChoices, isLatestAvailable, validateCatalog, validateChecklist,
} from './logic.mjs';

const $ = id => document.getElementById(id);
const STORAGE = '4d-migration-checklist-v1';
const PREFS = '4d-migration-preferences-v1';
const state = {
  language: LANGUAGES.includes(navigator.language?.slice(0, 2)) ? navigator.language.slice(0, 2) : 'en',
  theme: 'system', catalog: null, loading: true, checklist: Object.create(null),
  source: 'v16', target: 'v21', query: '', platform: 'all', module: 'all', sort: 'priority',
  message: null, error: false,
};
try {
  const prefs = JSON.parse(localStorage.getItem(PREFS) ?? 'null');
  if (LANGUAGES.includes(prefs?.language)) state.language = prefs.language;
  if (['system', 'light', 'dark'].includes(prefs?.theme)) state.theme = prefs.theme;
  const saved = localStorage.getItem(STORAGE);
  if (saved) state.checklist = validateChecklist(JSON.parse(saved));
} catch {
  state.message = 'storageError';
  state.error = true;
}
const t = (key, vars) => translate(state.language, key, vars);
const valueLabel = value => {
  if (value == null || value === '') return t('unknown');
  if (value === 'language') return t('languageModule');
  return Object.hasOwn(translations.en, value) ? t(value) : String(value);
};
const listLabel = list => Array.isArray(list) && list.length ? list.map(valueLabel).join(' · ') : t('unknown');
const rawText = value => {
  if (value == null || value === '') return t('notProvided');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function link(text, url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return node('span', text);
    const a = node('a', text);
    a.href = parsed.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  } catch {
    return node('span', text);
  }
}
function dateLabel(value) {
  if (!value) return t('unknown');
  const date = new Date(value);
  const options = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium', timeStyle: 'short' };
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(state.language, options).format(date);
}
const latestLabelKey = latest => latest?.channel === 'feature' ? 'latestFeature' : latest?.channel === 'lts' ? 'latestLts' : 'latest';
const latestLabel = latest => t(latestLabelKey(latest));
function line(key, text) {
  const p = node('p');
  p.append(node('strong', `${t(key)}: `), document.createTextNode(rawText(text)));
  return p;
}
function detail(dl, key, value) {
  dl.append(node('dt', t(key)));
  const dd = node('dd');
  dd.append(value instanceof Node ? value : document.createTextNode(rawText(value)));
  dl.append(dd);
}
function empty(title, body) {
  const div = node('div', undefined, 'empty');
  div.append(node('h3', t(title)), node('p', t(body)));
  return div;
}
function setMessage(key, error = false) {
  state.message = key;
  state.error = error;
  $('message').textContent = key ? t(key) : '';
  $('message').classList.toggle('error', error);
}
function savePreferences() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ language: state.language, theme: state.theme }));
  } catch {
    setMessage('storageError', true);
  }
}
function checklistDocument() {
  return { schema_version: 1, updated_at: new Date().toISOString(), items: state.checklist };
}
function saveChecklist() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(checklistDocument()));
    setMessage('saved');
  } catch {
    setMessage('storageError', true);
  }
}
function applyTheme() {
  if (state.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
  $('theme').value = state.theme;
}
function renderCoverage() {
  const area = $('coverage');
  area.replaceChildren();
  const heading = node('h2', t('coverage'));
  heading.id = 'coverage-title';
  area.append(heading);
  if (!state.catalog) {
    area.append(node('p', t(state.loading ? 'loading' : 'loadError')));
    return;
  }
  const { coverage, latest, generated_at: generatedAt } = state.catalog;
  const metrics = node('div', undefined, 'metrics');
  for (const [key, value] of [
    ['seeds', coverage.english_seeds], ['registered', coverage.registered_sources],
    ['candidates', coverage.candidate_changes], ['reviewedCount', coverage.reviewed_changes],
  ]) {
    const metric = node('div', undefined, 'metric');
    metric.append(node('strong', value ?? t('unknown')), node('span', t(key)));
    metrics.append(metric);
  }
  area.append(metrics);
  area.append(line('fetchStatus', Object.entries(coverage.fetch_status ?? {})
    .map(([status, count]) => `${valueLabel(status)}: ${count}`).join(' · ') || t('unknown')));
  if (coverage.superseded_url_probes) area.append(line('urlHistory', coverage.superseded_url_probes));
  if (Array.isArray(state.catalog.discoveries)) {
    const counts = new Map();
    for (const discovery of state.catalog.discoveries) {
      const status = discovery.status ?? 'unknown';
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    area.append(line('discoveries', `${state.catalog.discoveries.length} — ${
      [...counts].map(([status, count]) => `${valueLabel(status)}: ${count}`).join(' · ') || '—'}`));
    area.append(node('p', t('discoveryNote')));
  }
  area.append(line('processed', Array.isArray(coverage.processed_source_ids)
    ? `${coverage.processed_source_ids.length} — ${coverage.processed_source_ids.join(', ') || '—'}`
    : t('unknown')));
  area.append(line('generatedAt', dateLabel(generatedAt)));
  const latestLine = line(isLatestAvailable(latest) ? latestLabelKey(latest) : 'latest', isLatestAvailable(latest)
    ? `${latest.release} · ${t('verifiedAt')}: ${dateLabel(latest.verified_at)}`
    : t('latestUnavailable'));
  if (latest.url) latestLine.append(' · ', link(t('evidence'), latest.url));
  area.append(latestLine);
  if (isLatestAvailable(latest) && latest.released_at) area.append(line('releasedAt', dateLabel(latest.released_at)));
  if (isLatestAvailable(latest) && latest.channel === 'feature') area.append(node('p', t('featureChannelNote')));
  if (coverage.note) area.append(line('coverageNote', coverage.note));
}
function renderSelectors() {
  const available = isLatestAvailable(state.catalog?.latest);
  for (const key of ['source', 'target']) {
    if (state[key] === 'latest' && !available) state[key] = 'v21';
  }
  for (const [id, key] of [['source-version', 'source'], ['target-version', 'target']]) {
    const select = $(id);
    select.replaceChildren();
    for (const { bucket, disabled } of versionChoices(key, state.source, state.target, state.catalog?.latest)) {
      const option = node('option', bucket === 'latest'
        ? (available ? `${latestLabel(state.catalog.latest)} (${state.catalog.latest.release})` : t('latestUnavailable'))
        : bucket);
      option.value = bucket;
      option.disabled = disabled;
      select.append(option);
    }
    select.value = state[key];
  }
  const modules = [...new Set((state.catalog?.changes ?? []).flatMap(c => c.modules ?? []))]
    .filter(value => !['all', 'unknown'].includes(value)).sort();
  $('module').replaceChildren();
  for (const value of ['all', ...modules]) {
    const option = node('option', value === 'all' ? t('allModules') : valueLabel(value));
    option.value = value;
    $('module').append(option);
  }
  $('module').value = state.module;
}
function metadataItem(parent, label, value) {
  const span = node('span');
  span.append(node('strong', `${t(label)}: `), document.createTextNode(rawText(value)));
  parent.append(span);
}
function evidenceList(records = []) {
  if (!records.length) return node('p', t('noEvidence'), 'muted');
  const list = node('ul', undefined, 'evidence-list');
  for (const record of records) {
    const item = node('li');
    const source = state.catalog.sources.find(s => s.id === record.source_id);
    item.append(link(record.heading || record.source_id || t('evidence'), record.url || source?.url));
    const meta = node('div', undefined, 'metadata');
    metadataItem(meta, 'sourceId', record.source_id);
    metadataItem(meta, 'sourceEdition', source?.edition);
    metadataItem(meta, 'sourceLanguage', source?.language);
    item.append(meta);
    if (record.excerpt) {
      const disclosure = node('details');
      disclosure.append(node('summary', t('excerpt')), node('blockquote', record.excerpt));
      item.append(disclosure);
    }
    list.append(item);
  }
  return list;
}
function changeCard(change) {
  const card = node('article', undefined, 'card');
  const locale = change.localizations[state.language] ?? change.localizations.en;
  const top = node('div', undefined, 'card-top');
  const reviewKey = change.review_status === 'candidate' ? 'candidate'
    : change.review_status === 'reviewed' ? 'reviewed' : 'reviewUnknown';
  top.append(node('span', t(reviewKey), 'badge candidate'));
  for (const [key, value] of [['criticality', change.criticality], ['stage', change.stage], ['type', change.type]]) {
    top.append(node('span', `${t(key)}: ${valueLabel(value)}`, `badge${key === 'criticality' && ['blocking', 'critical'].includes(value) ? ' severe' : ''}`));
  }
  const heading = node('h3', locale?.one_line || change.id);
  card.append(top, heading, node('p', change.id, 'stable-id'));
  if (!change.localizations[state.language]) card.append(node('p', t('fallback'), 'muted'));
  if (locale?.paragraph) card.append(node('p', locale.paragraph, 'card-body'));
  const metadata = node('div', undefined, 'metadata');
  for (const [key, value] of [
    ['release', change.threshold?.exact ?? t('unknown')], ['bucket', change.threshold?.bucket ?? t('unknown')],
    ['platform', listLabel(change.platforms)], ['module', listLabel(change.modules)],
    ['provenance', valueLabel(locale?.provenance)], ['confidence', valueLabel(change.confidence)],
  ]) metadataItem(metadata, key, value);
  card.append(metadata);
  if (change.identifiers?.length) card.append(line('identifiers', change.identifiers.join(' · ')));
  const applicability = node('details');
  applicability.append(node('summary', t('applicability')));
  const dl = node('dl', undefined, 'detail-content');
  detail(dl, 'relevance', `${valueLabel(change.relevance?.status)}${change.relevance?.reason ? ` — ${change.relevance.reason}` : ''}`);
  detail(dl, 'formats', listLabel(change.applicability?.formats));
  detail(dl, 'conditions', change.applicability?.conditions?.join('\n') || t('notProvided'));
  detail(dl, 'action', locale?.action || change.action || t('unknown'));
  detail(dl, 'actionBasis', change.action_basis);
  if (change.applies_until != null) detail(dl, 'appliesUntil', change.applies_until);
  detail(dl, 'reviewStatus', valueLabel(change.review_status));
  if (change.notices?.length) detail(dl, 'notices', change.notices.map(rawText).join('\n'));
  applicability.append(dl);
  card.append(applicability);
  const evidence = node('details');
  evidence.append(node('summary', `${t('evidence')} (${change.evidence?.length ?? 0})`));
  const evidenceBody = node('div', undefined, 'detail-content');
  evidenceBody.append(evidenceList(change.evidence));
  evidence.append(evidenceBody);
  card.append(evidence);
  const checklist = node('div', undefined, 'checklist-row');
  const checkedLabel = node('label', undefined, 'check-label');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = state.checklist[change.id]?.checked ?? false;
  check.setAttribute('aria-label', `${t('complete')}: ${locale?.one_line || change.id}`);
  checkedLabel.append(check, document.createTextNode(t('complete')));
  const effortLabel = node('label');
  effortLabel.append(node('span', t('effort')));
  const effort = document.createElement('textarea');
  effort.rows = 2;
  effort.maxLength = 10000;
  effort.value = state.checklist[change.id]?.effort ?? '';
  effort.setAttribute('aria-label', `${t('effort')}: ${locale?.one_line || change.id}`);
  effortLabel.append(effort);
  const update = () => {
    state.checklist[change.id] = { checked: check.checked, effort: effort.value };
    saveChecklist();
  };
  check.addEventListener('change', update);
  effort.addEventListener('input', update);
  checklist.append(checkedLabel, effortLabel);
  card.append(checklist);
  return card;
}
function renderChanges() {
  const area = $('change-list');
  area.replaceChildren();
  const catalog = state.catalog;
  if (!catalog) {
    $('result-count').textContent = t('unknown');
    area.append(empty(state.loading ? 'loading' : 'unavailable', state.loading ? 'loading' : 'loadError'));
    return;
  }
  const filtered = filterChanges(catalog.changes, state, catalog.latest);
  $('result-count').textContent = t('resultCount', { count: filtered.length, total: catalog.changes.length });
  $('version-warning').hidden = !(versionNumber(state.target, catalog.latest) <= versionNumber(state.source, catalog.latest));
  if (!filtered.length) area.append(empty(catalog.changes.length ? 'noResults' : 'noChanges', 'noResultsBody'));
  else area.append(...filtered.map(changeCard));
}
function renderClarifications() {
  const area = $('clarification-list');
  area.replaceChildren();
  if (!state.catalog) {
    area.append(empty(state.loading ? 'loading' : 'unavailable', state.loading ? 'loading' : 'loadError'));
    return;
  }
  const entries = state.catalog.clarifications ?? [];
  if (!entries.length) area.append(empty('noClarifications', 'noClarificationsBody'));
  for (const entry of entries) {
    const card = node('article', undefined, 'card');
    card.append(node('span', `${t('status')}: ${valueLabel(entry.status)}`, 'badge'));
    card.append(node('h3', rawText(entry.title || entry.id)));
    if (entry.id) card.append(node('p', entry.id, 'stable-id'));
    if (entry.disposition) card.append(line('disposition', entry.disposition));
    if (entry.change_ids?.length) card.append(line('relatedChanges', entry.change_ids.join(' · ')));
    if (entry.issue_url) card.append(link(t('issue'), entry.issue_url));
    card.append(node('h4', t('evidence')), evidenceList(entry.evidence));
    area.append(card);
  }
}
function renderSources() {
  const area = $('source-list');
  area.replaceChildren();
  if (!state.catalog) {
    area.append(empty(state.loading ? 'loading' : 'unavailable', state.loading ? 'loading' : 'loadError'));
    return;
  }
  if (!state.catalog.sources.length) area.append(empty('noSources', 'noSourcesBody'));
  for (const source of state.catalog.sources) {
    const card = node('article', undefined, 'card');
    card.append(node('span', `${t('fetchStatus')}: ${valueLabel(source.fetch?.status)}`, 'badge'));
    card.append(node('h3', source.id || t('unknown')));
    const dl = node('dl', undefined, 'detail-content');
    detail(dl, 'sourceEdition', source.edition);
    detail(dl, 'sourceLanguage', source.language);
    detail(dl, 'family', valueLabel(source.family));
    if (source.publisher) detail(dl, 'publisher', source.publisher);
    if (source.authority) detail(dl, 'authority', valueLabel(source.authority));
    if (source.host_operator) detail(dl, 'hostOperator', source.host_operator);
    detail(dl, 'originalUrl', link(source.url || t('unknown'), source.url));
    detail(dl, 'resolvedUrl', link(source.resolved_url || t('unknown'), source.resolved_url));
    detail(dl, 'fetchedAt', dateLabel(source.fetch?.fetched_at));
    if (source.fetch?.checked_at) detail(dl, 'checkedAt', dateLabel(source.fetch.checked_at));
    if (source.fetch?.http_status) detail(dl, 'httpStatus', source.fetch.http_status);
    if (source.fetch?.error) detail(dl, 'fetchError', source.fetch.error);
    detail(dl, 'checksum', source.fetch?.sha256);
    card.append(dl);
    if (source.discovery?.chain?.length) {
      const trace = node('details');
      trace.append(node('summary', t('archiveTrace')));
      const list = node('ol');
      for (const url of source.discovery.chain) {
        const item = node('li');
        item.append(link(url, url));
        list.append(item);
      }
      trace.append(list);
      card.append(trace);
    }
    if (source.url_history?.length) {
      const history = node('details');
      history.append(node('summary', t('urlHistory')));
      for (const attempt of source.url_history) {
        const entry = node('div', undefined, 'detail-content');
        entry.append(link(attempt.url, attempt.url), line('fetchStatus', valueLabel(attempt.fetch.status)));
        if (attempt.fetch.http_status) entry.append(line('httpStatus', attempt.fetch.http_status));
        if (attempt.fetch.checked_at) entry.append(line('checkedAt', dateLabel(attempt.fetch.checked_at)));
        history.append(entry);
      }
      card.append(history);
    }
    area.append(card);
  }
  const discoveries = state.catalog.discoveries;
  if (Array.isArray(discoveries) && discoveries.length) {
    const disclosure = node('details', undefined, 'card');
    disclosure.append(node('summary', `${t('discoveries')} (${discoveries.length})`), node('p', t('discoveryNote')));
    const list = node('ul', undefined, 'evidence-list');
    for (const discovery of discoveries) {
      const item = node('li');
      item.append(node('span', `${valueLabel(discovery.status)} · ${rawText(discovery.language)} · ${rawText(discovery.parent)} — `),
        link(discovery.url || t('unknown'), discovery.url));
      list.append(item);
    }
    disclosure.append(list);
    area.append(disclosure);
  }
}
function renderView() {
  const view = ['changes', 'clarifications', 'sources'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'changes';
  for (const name of ['changes', 'clarifications', 'sources']) $(`${name}-view`).hidden = name !== view;
  for (const a of document.querySelectorAll('[data-view]')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
function render() {
  document.documentElement.lang = state.language;
  document.title = `4D · ${t('appTitle')}`;
  $('language').value = state.language;
  applyTheme();
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria]')) element.setAttribute('aria-label', t(element.dataset.i18nAria));
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  renderCoverage();
  renderSelectors();
  $('semantic-status').replaceChildren();
  $('semantic-status').append(document.createTextNode(t('semanticUnavailable')));
  const reason = state.catalog?.semantic_search?.reason;
  if (reason) $('semantic-status').append(document.createTextNode(` · ${t('semanticReason')}: ${reason}`));
  renderChanges();
  renderClarifications();
  renderSources();
  renderView();
  setMessage(state.message, state.error);
  $('export').disabled = !Object.keys(state.checklist).length;
}

$('filters').addEventListener('submit', event => event.preventDefault());
for (const [id, key] of [
  ['source-version', 'source'], ['target-version', 'target'], ['platform', 'platform'],
  ['module', 'module'], ['sort', 'sort'], ['search', 'query'],
]) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', event => {
    state[key] = event.target.value;
    if (key === 'source' || key === 'target') renderSelectors();
    renderChanges();
  });
}
$('language').addEventListener('change', event => {
  state.language = event.target.value;
  savePreferences();
  render();
});
$('theme').addEventListener('change', event => {
  state.theme = event.target.value;
  applyTheme();
  savePreferences();
});
$('reset').addEventListener('click', () => {
  Object.assign(state, { source: 'v16', target: 'v21', query: '', platform: 'all', module: 'all', sort: 'priority' });
  $('search').value = '';
  for (const key of ['platform', 'module', 'sort']) $(key).value = state[key];
  renderSelectors();
  renderChanges();
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(checklistDocument(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = node('a');
  a.href = url;
  a.download = `4d-migration-checklist-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setMessage('exported');
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return setMessage('importTooLarge', true);
  let text;
  try { text = await file.text(); } catch { return setMessage('importReadError', true); }
  let entries;
  try { entries = validateChecklist(JSON.parse(text)); } catch { return setMessage('invalidImport', true); }
  state.checklist = Object.assign(Object.create(null), state.checklist, entries);
  saveChecklist();
  if (!state.error) setMessage('imported');
  renderChanges();
  $('export').disabled = !Object.keys(state.checklist).length;
});
// Export must also become available after the first edit, without rebuilding a focused card.
$('change-list').addEventListener('input', () => { $('export').disabled = false; });
window.addEventListener('hashchange', renderView);
render();
try {
  const response = await fetch('./data/catalog.json', { credentials: 'omit' });
  if (!response.ok) throw new Error('loadError');
  state.catalog = validateCatalog(await response.json());
} catch {
  state.catalog = null;
  setMessage('loadError', true);
} finally {
  state.loading = false;
  render();
}

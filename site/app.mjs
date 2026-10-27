import {
  LANGUAGES, translations, translate, filterChanges, filterOptions, complexityForChange, evidenceForLanguage,
  versionChoices, versionColor, isLatestAvailable, validateCatalog, projectChangeForPath, referencesForLanguage,
  defaultVisibilityCategory, partitionChanges,
} from './logic.mjs';
import { corpusRows, hybridFilter } from './semantic.mjs';
import { searchLabels } from './search-labels.mjs';

const $ = id => document.getElementById(id);
const meaning = { worker: null, enabled: false, status: 'loading', detail: '', progress: null, scores: null,
  sequence: 0, generation: 0, timer: null, deadline: null };
const meaningText = key => searchLabels[state.language][key];
function renderMeaning() {
  $('meaning-status').dataset.state = meaning.status;
  $('meaning-notice').textContent = meaningText('notice');
  $('meaning-notice').hidden = meaning.status !== 'loading';
  $('meaning-status').textContent = `${meaningText(meaning.status)}${meaning.detail ? ` ${meaning.detail}` : ''}`;
  $('meaning-status').classList.toggle('error', ['error', 'unavailable'].includes(meaning.status));
  $('meaning-retry').textContent = meaningText('retry');
  $('meaning-retry').hidden = meaning.status !== 'error';
  $('meaning-progress').hidden = meaning.status !== 'loading';
  $('meaning-progress').setAttribute('aria-label', meaningText('loading'));
  if (meaning.progress === null) $('meaning-progress').removeAttribute('value');
  else $('meaning-progress').value = meaning.progress;
}
function failMeaning(detail) {
  clearTimeout(meaning.deadline);
  clearTimeout(meaning.timer);
  meaning.generation++;
  meaning.status = 'error'; meaning.detail = detail; meaning.scores = null; meaning.enabled = false;
  meaning.worker?.terminate(); meaning.worker = null;
  renderMeaning(); renderChanges();
}
function stopMeaning() {
  meaning.worker?.terminate();
  clearTimeout(meaning.timer);
  clearTimeout(meaning.deadline);
  Object.assign(meaning, { worker: null, enabled: false, detail: '', progress: null, scores: null,
    sequence: meaning.sequence + 1, generation: meaning.generation + 1 });
}
function queryMeaning() {
  clearTimeout(meaning.timer);
  if (['ready', 'searching'].includes(meaning.status)) clearTimeout(meaning.deadline);
  meaning.sequence++;
  meaning.scores = null;
  if (!meaning.enabled || !['ready', 'searching'].includes(meaning.status)) return;
  meaning.status = state.query.trim() ? 'searching' : 'ready';
  renderMeaning();
  if (!state.query.trim()) return;
  const sequence = meaning.sequence;
  meaning.timer = setTimeout(() => {
    meaning.deadline = setTimeout(() => failMeaning(meaningText('queryTimeout')), 60000);
    meaning.worker?.postMessage({
      type: 'search', sequence, query: state.query, language: state.language,
      rows: corpusRows(state.catalog, state.language),
    });
  }, 250);
}
async function enableMeaning() {
  stopMeaning();
  meaning.enabled = true;
  meaning.status = 'loading';
  renderMeaning();
  renderChanges();
  const generation = meaning.generation;
  meaning.deadline = setTimeout(() => failMeaning(meaningText('loadTimeout')), 180000);
  try {
    if (state.catalog?.semantic_search.status !== 'automatic' ||
        !navigator.gpu || !await navigator.gpu.requestAdapter()) {
      if (generation === meaning.generation) {
        clearTimeout(meaning.deadline);
        meaning.enabled = false; meaning.status = 'unavailable'; renderMeaning();
      }
      return;
    }
    if (!meaning.enabled || generation !== meaning.generation) return;
    meaning.worker = new Worker(new URL('./search-worker.mjs', import.meta.url), { type: 'module' });
    meaning.worker.onerror = event => {
      if (generation === meaning.generation) failMeaning(event.message);
    };
    meaning.worker.onmessage = ({ data }) => {
      if (generation !== meaning.generation) return;
      if (data.type === 'progress') {
        meaning.progress = data.total > 1 && data.loaded > 1
          ? Math.min(100, Math.floor(data.loaded / data.total * 100)) : null;
        meaning.detail = data.file
          ? `${data.file}${meaning.progress === null ? '' : ` ${meaning.progress}%`}` : '';
        renderMeaning();
      } else if (data.type === 'ready') {
        clearTimeout(meaning.deadline);
        meaning.status = 'ready'; meaning.detail = '';
        queryMeaning(); renderMeaning();
      } else if (data.type === 'results' && data.sequence === meaning.sequence) {
        clearTimeout(meaning.deadline);
        meaning.scores = new Map(data.scores); meaning.status = 'ready'; meaning.detail = '';
        renderMeaning(); renderChanges();
      } else if (data.type === 'error') failMeaning(data.error);
    };
    meaning.worker.postMessage({ type: 'load', config: state.catalog.semantic_search });
  } catch (error) {
    if (generation !== meaning.generation) return;
    failMeaning(String(error.message ?? error));
  }
}
const PREFS = '4d-migration-preferences-v1';
const state = {
  language: LANGUAGES.includes(navigator.language?.slice(0, 2)) ? navigator.language.slice(0, 2) : 'en',
  theme: 'system', catalog: null, loading: true,
  source: 'v16', target: 'v21', query: '', platforms: null, modules: null, sort: 'severity', includeRoutine: false,
  message: null, error: false,
};
try {
  const prefs = JSON.parse(localStorage.getItem(PREFS) ?? 'null');
  if (LANGUAGES.includes(prefs?.language)) state.language = prefs.language;
  if (['system', 'light', 'dark'].includes(prefs?.theme)) state.theme = prefs.theme;
} catch {
  state.message = 'preferencesError';
  state.error = true;
}
const t = (key, vars) => translate(state.language, key, vars);
const valueLabel = value => {
  if (value == null || value === '') return t('unknown');
  if (value === 'language') return t('languageModule');
  return Object.hasOwn(translations.en, value) ? t(value) : String(value);
};
const listLabel = list => list?.length ? list.map(valueLabel).join(' · ') : t('unknown');
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
function detail(dl, key, value) {
  dl.append(node('dt', t(key)), node('dd', value || t('unknown')));
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
    setMessage('preferencesError', true);
  }
}
function applyTheme() {
  if (state.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;
  $('theme').value = state.theme;
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
      const latestKey = state.catalog?.latest?.channel === 'feature' ? 'latestFeature'
        : state.catalog?.latest?.channel === 'lts' ? 'latestLts' : 'latest';
      const option = node('option', bucket === 'latest'
        ? (available ? `${t(latestKey)} (${state.catalog.latest.release})` : t('latestUnavailable')) : bucket);
      option.value = bucket;
      option.disabled = disabled;
      select.append(option);
    }
    select.value = state[key];
    const icon = $(`${key}-icon`);
    const color = versionColor(state[key], state.catalog?.latest);
    icon.hidden = color === null;
    icon.style.color = color ?? '';
  }
}
function optionsFor(key) {
  return filterOptions(state.catalog?.changes ?? [], key);
}
function renderCheckboxes() {
  for (const [id, key] of [['platform-options', 'platforms'], ['module-options', 'modules']]) {
    const area = $(id);
    area.replaceChildren();
    for (const value of optionsFor(key)) {
      const label = node('label');
      const checkbox = node('input');
      checkbox.type = 'checkbox';
      checkbox.name = key;
      checkbox.value = value;
      checkbox.checked = (state[key] ?? optionsFor(key)).includes(value);
      checkbox.addEventListener('change', () => {
        state[key] = [...area.querySelectorAll('input:checked')].map(input => input.value);
        renderChanges();
      });
      label.append(checkbox, node('span', key === 'modules' && value === 'unknown'
        ? t('otherTopics') : valueLabel(value)));
      area.append(label);
    }
  }
}
function evidenceList(records = []) {
  if (!records.length) return node('p', t('noEvidence'), 'muted');
  const list = node('ul', undefined, 'evidence-list');
  for (const record of records) {
    const item = node('li');
    const source = state.catalog.sources.find(s => s.id === record.source_id);
    item.dataset.sourceId = source.id;
    item.dataset.sourceLanguage = source.language;
    item.dataset.blockId = record.block_id;
    item.append(link(record.heading || t('evidence'), record.url || source?.url));
    item.append(node('p', `${t('sourceEdition')}: ${source?.edition ?? t('unknown')} · ${t('sourceLanguage')}: ${source?.language ?? t('unknown')}`, 'muted'));
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
  card.dataset.changeId = change.id;
  const locale = change.localizations[state.language] ?? change.localizations.en;
  const top = node('div', undefined, 'card-top');
  for (const [key, value] of [['criticality', change.criticality], ['complexity', complexityForChange(change)]]) {
    top.append(node('span', `${t(key)}: ${valueLabel(value)}`, `badge${key === 'criticality' && ['blocking', 'critical'].includes(value) ? ' severe' : ''}`));
  }
  const visibility = defaultVisibilityCategory(change, state.target, state.catalog.latest);
  if (visibility) {
    const label = { routine_check: 'routineCheck', deferred_modernization: 'deferredModernization',
      optional_adoption: 'optionalAdoption' }[visibility];
    top.append(node('span', t(label), 'badge'));
  }
  card.append(top, node('h3', locale?.one_line || change.id));
  if (!change.localizations[state.language]) card.append(node('p', t('fallback'), 'muted'));
  if (locale?.paragraph) card.append(node('p', locale.paragraph, 'card-body'));
  if (change.review_status !== 'reviewed' ||
      !['official_translation', 'human_reviewed'].includes(locale?.provenance)) {
    card.append(node('p', t('summaryCaveat'), 'muted summary-caveat'));
  }
  const visibleEvidence = evidenceForLanguage(change.evidence ?? [], state.catalog.sources, state.language);
  if (['partial', 'unresolved'].includes(change.evidence_disposition)) {
    const warning = node('p', t('pathEvidenceUnavailable'), 'warning path-evidence-warning');
    warning.dataset.evidenceDisposition = change.evidence_disposition;
    card.append(warning);
  }
  const unchecked = [...new Set(visibleEvidence.map(record =>
    state.catalog.sources.find(source => source.id === record.source_id)))]
    .filter(source => source?.fetch?.status !== 'available');
  if (unchecked.length) {
    card.append(node('p', t('sourceCaveat'), 'warning'));
    for (const source of unchecked) {
      if (source?.fetch?.error) card.append(node('p', source.fetch.error, 'warning'));
    }
  }
  const metadata = node('p', undefined, 'metadata');
  metadata.textContent = `${t('release')}: ${change.threshold?.exact ?? t('unknown')} · ${t('platform')}: ${listLabel(change.platforms)} · ${t('topics')}: ${listLabel(change.modules)}`;
  card.append(metadata);
  const displayIdentifiers = locale?.identifiers ?? change.identifiers;
  if (displayIdentifiers?.length) card.append(node('p', `${t('identifiers')}: ${displayIdentifiers.join(' · ')}`));
  const applicability = node('details');
  applicability.append(node('summary', t('applicability')));
  const dl = node('dl', undefined, 'detail-content');
  detail(dl, 'formats', listLabel(change.applicability?.formats));
  detail(dl, 'conditions', locale?.conditions?.join('\n'));
  detail(dl, 'action', locale?.action);
  if (change.action_basis) detail(dl, 'actionBasis', locale?.action_basis);
  if (change.applicability?.target_releases?.length) {
    detail(dl, 'targetReleases', change.applicability.target_releases.join(' · '));
  }
  if (change.applies_until != null) detail(dl, 'appliesUntil', change.applies_until);
  if (change.notices?.length) detail(dl, 'notices', (locale?.notices ?? change.notices).join('\n'));
  if (complexityForChange(change) !== 'unknown') detail(dl, 'complexityBasis', change.complexity.basis);
  applicability.append(dl);
  card.append(applicability);
  const evidence = node('details');
  evidence.append(node('summary', t('evidence')), visibleEvidence.length
    ? evidenceList(visibleEvidence) : node('p', t('evidenceUnavailable'), 'muted'));
  card.append(evidence);
  return card;
}
function renderChanges() {
  const area = $('change-list');
  area.replaceChildren();
  for (const id of ['deprecation-list', 'undated-list']) $(id).replaceChildren();
  for (const id of ['deprecations', 'undated-changes', 'undated-warning', 'deprecation-notice']) $(id).hidden = true;
  for (const id of ['deprecation-count', 'undated-count']) $(id).textContent = '';
  $('sort-hint').textContent = t(state.sort === 'complexity' ? 'complexityDirection' : 'severityDirection');
  const catalog = state.catalog;
  if (!catalog) {
    $('result-count').textContent = '';
    area.append(node('p', t(state.loading ? 'loading' : 'loadError')));
    return;
  }
  const projected = catalog.changes.map(change =>
    projectChangeForPath(change, catalog.sources, state.source, state.target, catalog.latest)).filter(Boolean);
  const filters = {
    ...state, platforms: state.platforms ?? optionsFor('platforms'), modules: state.modules ?? optionsFor('modules'),
  };
  const lexical = filterChanges(projected, filters, catalog.latest);
  const filtered = meaning.enabled && meaning.scores && state.query.trim()
    ? hybridFilter(filterChanges(projected, { ...filters, query: '' }, catalog.latest),
      lexical, meaning.scores, catalog.semantic_search.threshold) : lexical;
  const buckets = partitionChanges(filtered);
  $('result-count').textContent = t('resultCount', { count: buckets.upgrade.length });
  $('version-warning').hidden = state.target !== state.source;
  $('undated-warning').hidden = buckets.undated.length === 0;
  $('deprecation-notice').hidden = buckets.deprecations.length === 0;
  for (const [key, section, list, count] of [
    ['deprecations', 'deprecations', 'deprecation-list', 'deprecation-count'],
    ['undated', 'undated-changes', 'undated-list', 'undated-count'],
  ]) {
    const records = buckets[key];
    $(section).hidden = records.length === 0;
    $(count).textContent = t('resultCount', { count: records.length });
    $(list).append(...records.map(changeCard));
    if (state.query.trim() && records.length) $(section).open = true;
  }
  if (!buckets.upgrade.length) {
    const empty = node('div', undefined, 'empty');
    empty.append(node('h3', t('noUpgradeChanges')), node('p',
      t(filtered.length ? 'secondaryResultsRemain' : 'emptyDirectory')));
    area.append(empty);
  } else area.append(...buckets.upgrade.map(changeCard));
}
function renderReferences() {
  const area = $('reference-list');
  area.replaceChildren();
  if (!state.catalog) {
    area.append(node('p', t(state.loading ? 'loading' : 'loadError')));
    return;
  }
  const sources = referencesForLanguage(state.catalog.sources, state.language);
  if (!sources.length) {
    area.append(node('p', t('noReferences'), 'muted'));
    return;
  }
  const list = node('ul', undefined, 'reference-links');
  for (const source of sources) {
    const item = node('li');
    item.dataset.referenceId = source.id;
    item.append(node('p', `${source.title} · ${t('sourceEdition')}: ${source.edition}`),
      link(source.url, source.url));
    list.append(item);
  }
  area.append(list);
}
function render() {
  document.documentElement.lang = state.language;
  document.title = `4D · ${t('appTitle')}`;
  $('language').value = state.language;
  $('include-routine').checked = state.includeRoutine;
  applyTheme();
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria]')) element.setAttribute('aria-label', t(element.dataset.i18nAria));
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  renderSelectors();
  renderCheckboxes();
  renderChanges();
  renderReferences();
  renderMeaning();
  setMessage(state.message, state.error);
}

$('filters').addEventListener('submit', event => event.preventDefault());
for (const [link, section] of [['review-undated', 'undated-changes'], ['review-deprecations', 'deprecations']]) {
  $(link).addEventListener('click', () => {
    $(section).open = true;
    $(section).querySelector('summary').focus();
  });
}
$('include-routine').addEventListener('change', event => {
  state.includeRoutine = event.target.checked;
  renderChanges();
});
for (const [id, key] of [
  ['source-version', 'source'], ['target-version', 'target'], ['sort', 'sort'], ['search', 'query'],
]) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', event => {
    state[key] = event.target.value;
    if (key === 'query') queryMeaning();
    if (key === 'source' || key === 'target') renderSelectors();
    renderChanges();
  });
}
for (const button of document.querySelectorAll('[data-group]')) {
  button.addEventListener('click', () => {
    const key = button.dataset.group;
    state[key] = button.dataset.select === 'all' ? optionsFor(key) : [];
    renderCheckboxes();
    renderChanges();
  });
}
$('language').addEventListener('change', event => {
  state.language = event.target.value;
  queryMeaning();
  savePreferences();
  render();
});
$('theme').addEventListener('change', event => {
  state.theme = event.target.value;
  applyTheme();
  savePreferences();
});
$('reset').addEventListener('click', () => {
  Object.assign(state, { query: '', platforms: null, modules: null, sort: 'severity', includeRoutine: false });
  $('search').value = '';
  queryMeaning();
  $('sort').value = state.sort;
  $('include-routine').checked = state.includeRoutine;
  renderCheckboxes();
  renderChanges();
});
render();
$('meaning-retry').addEventListener('click', () => {
  if (meaning.status === 'error') enableMeaning();
});
window.addEventListener('pagehide', stopMeaning);
window.addEventListener('pageshow', event => {
  if (event.persisted && state.catalog) enableMeaning();
});
try {
  const response = await fetch(new URL('./data/catalog.json', import.meta.url), { credentials: 'omit' });
  if (!response.ok) throw new Error('loadError');
  state.catalog = validateCatalog(await response.json());
} catch {
  state.catalog = null;
  setMessage('loadError', true);
} finally {
  state.loading = false;
  if (!state.catalog) meaning.status = 'unavailable';
  render();
}
if (state.catalog) enableMeaning();

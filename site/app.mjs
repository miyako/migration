import {
  LANGUAGES, translations, translate, filterChanges, filterOptions, complexityForChange, evidenceForLanguage,
  versionChoices, versionColor, isLatestAvailable, validateCatalog, projectChangeForPath,
} from './logic.mjs';

const $ = id => document.getElementById(id);
const PREFS = '4d-migration-preferences-v1';
const state = {
  language: LANGUAGES.includes(navigator.language?.slice(0, 2)) ? navigator.language.slice(0, 2) : 'en',
  theme: 'system', catalog: null, loading: true,
  source: 'v16', target: 'v21', query: '', platforms: null, modules: null, sort: 'severity',
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
  $('sort-hint').textContent = t(state.sort === 'complexity' ? 'complexityDirection' : 'severityDirection');
  const catalog = state.catalog;
  if (!catalog) {
    $('result-count').textContent = '';
    area.append(node('p', t(state.loading ? 'loading' : 'loadError')));
    return;
  }
  const projected = catalog.changes.map(change =>
    projectChangeForPath(change, catalog.sources, state.source, state.target, catalog.latest)).filter(Boolean);
  const filtered = filterChanges(projected, {
    ...state, platforms: state.platforms ?? optionsFor('platforms'), modules: state.modules ?? optionsFor('modules'),
  }, catalog.latest);
  $('result-count').textContent = t('resultCount', { count: filtered.length, total: catalog.changes.length });
  $('version-warning').hidden = state.target !== state.source;
  if (!filtered.length) {
    const empty = node('div', undefined, 'empty');
    empty.append(node('h3', t('noResults')), node('p', t('emptyDirectory')));
    area.append(empty);
  } else area.append(...filtered.map(changeCard));
}
function render() {
  document.documentElement.lang = state.language;
  document.title = `4D · ${t('appTitle')}`;
  $('language').value = state.language;
  applyTheme();
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria]')) element.setAttribute('aria-label', t(element.dataset.i18nAria));
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  renderSelectors();
  renderCheckboxes();
  renderChanges();
  setMessage(state.message, state.error);
}

$('filters').addEventListener('submit', event => event.preventDefault());
for (const [id, key] of [
  ['source-version', 'source'], ['target-version', 'target'], ['sort', 'sort'], ['search', 'query'],
]) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', event => {
    state[key] = event.target.value;
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
  savePreferences();
  render();
});
$('theme').addEventListener('change', event => {
  state.theme = event.target.value;
  applyTheme();
  savePreferences();
});
$('reset').addEventListener('click', () => {
  Object.assign(state, { query: '', platforms: null, modules: null, sort: 'severity' });
  $('search').value = '';
  $('sort').value = state.sort;
  renderCheckboxes();
  renderChanges();
});
render();
try {
  const response = await fetch(new URL('./data/catalog.json', import.meta.url), { credentials: 'omit' });
  if (!response.ok) throw new Error('loadError');
  state.catalog = validateCatalog(await response.json());
} catch {
  state.catalog = null;
  setMessage('loadError', true);
} finally {
  state.loading = false;
  render();
}

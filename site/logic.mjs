export const LANGUAGES = ['en', 'fr', 'de', 'es', 'ja'];
export const VERSION_BUCKETS = ['v16', 'v17', 'v18', 'v19', 'v20', 'v21', 'latest'];
export const VERSION_COLORS = {
  v15: '#D74635', v16: '#8331AE', v17: '#3E8B93', v18: '#EB8E5F',
  v19: '#5682DF', v20: '#E23089', v21: '#3B69E9',
};

export function versionColor(value, latest = null) {
  return VERSION_COLORS[versionBucket(value === 'latest' ? latest?.release : value)] ?? null;
}

// Release identity stays in threshold.exact; this is only a major-version bucket.
export function versionBucket(value) {
  if (value === 'latest') return 'latest';
  const match = String(value ?? '').match(/^(?:4D\s+)?v?(\d+)(?:\b|[.rR])/i);
  return match ? `v${Number(match[1])}` : 'unknown';
}

export function versionNumber(value, latest = null) {
  const bucket = versionBucket(value === 'latest' ? latest?.release : value);
  return /^v\d+$/.test(bucket) ? Number(bucket.slice(1)) : null;
}

export function releaseKey(value) {
  const match = typeof value === 'string' && value.trim().match(
    /^(?:4D\s*)?v?(\d+)((?:\.\d+){0,3})(?:\s*R(\d+))?(?:\s*HF\s*(\d+))?(?:\s*(?:build\s*(\d+)|\(build\s*(\d+)\)))?$/i);
  if (!match) return null;
  const patches = match[2].split('.').filter(Boolean).map(Number);
  return [Number(match[1]), Number(match[3] ?? 0),
    ...patches, ...Array(3 - patches.length).fill(0), Number(match[4] ?? 0), Number(match[5] ?? match[6] ?? 0)];
}

function compareRelease(left, right) {
  return left.map((value, index) => value - right[index]).find(value => value !== 0) ?? 0;
}

function thresholdBucket(value) {
  const release = releaseKey(value);
  if (!release) return null;
  return release[1] ? (release[0] === 21 ? 'latest' : `v${release[0] + 1}`) : `v${release[0]}`;
}

function validVersionApplicability(change) {
  const targets = change.applicability?.target_releases;
  if (targets !== undefined && (!Array.isArray(targets) || !targets.length ||
      new Set(targets).size !== targets.length || targets.some(target => !releaseKey(target)))) return false;
  const threshold = change.threshold;
  if (!threshold || typeof threshold !== 'object') return false;
  const alternatives = threshold.alternatives;
  let releases = [];
  if (threshold.kind === 'unknown') {
    if (threshold.exact !== null || threshold.bucket !== null || alternatives !== undefined) return false;
  } else {
    if (!['introduced', 'target_requirement'].includes(threshold.kind) ||
        thresholdBucket(threshold.exact) !== threshold.bucket || !releaseKey(threshold.exact)) return false;
    if (alternatives !== undefined && (!Array.isArray(alternatives) || !alternatives.length ||
        new Set(alternatives).size !== alternatives.length || !alternatives.includes(threshold.exact) ||
        alternatives.some(value => !releaseKey(value)))) return false;
    releases = (alternatives ?? [threshold.exact]).map(releaseKey);
  }
  const bound = change.applies_until;
  if (bound === undefined || bound === null || bound === 'latest') return true;
  const until = releaseKey(bound);
  return Boolean(until && releases.every(release => compareRelease(release, until) < 0));
}

function sameThreshold(left, right) {
  const entries = value => Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function validLocalizedApplicability(change) {
  const localizations = change.localizations;
  const nonempty = value => typeof value === 'string' && Boolean(value.trim());
  if (!localizations || typeof localizations !== 'object' || Array.isArray(localizations) ||
      Object.keys(localizations).length !== LANGUAGES.length ||
      LANGUAGES.some(language => !localizations[language])) return false;
  const english = localizations.en;
  const invariant = value => (change.identifiers ?? []).includes(value) ||
    /^_o_[a-z][a-z0-9_ ]*$/i.test(value);
  return LANGUAGES.every(language => {
    const text = localizations[language];
    if (!text || typeof text !== 'object' || Array.isArray(text) ||
        !Array.isArray(text.conditions) || !text.conditions.length || !text.conditions.every(nonempty) ||
        !nonempty(text.action) ||
        (('action_basis' in change || 'action_basis' in text) && !nonempty(text.action_basis))) return false;
    if (language === 'en') return true;
    return text.conditions.every(condition => !english.conditions?.includes(condition) || invariant(condition)) &&
      (!('action_basis' in change) || text.action_basis !== english.action_basis || invariant(text.action_basis));
  });
}

export function isLatestAvailable(latest) {
  return Boolean(latest?.release && latest.status === 'verified' && latest.verified_at &&
    Number.isFinite(Date.parse(latest.verified_at)) && releaseKey(latest.release));
}

export function versionChoices(side, source, target, latest = null) {
  if (!['source', 'target'].includes(side)) throw new TypeError('Unknown version selector');
  const boundary = VERSION_BUCKETS.indexOf(side === 'source' ? target : source);
  // "latest" follows v21 even when its concrete release belongs to the 21 R cycle.
  return VERSION_BUCKETS.map((bucket, index) => ({
    bucket,
    disabled: (bucket === 'latest' && !isLatestAvailable(latest)) ||
      (side === 'source' ? index > boundary : index < boundary),
  }));
}

export function priorityForChange(change) {
  return ({ blocking: 0, critical: 1, high: 2, medium: 3, low: 4, informational: 5 })[change.criticality] ?? 6;
}

export function stagePriorityForChange(change) {
  return ({ syntax: 0, compilation: 1, runtime: 2, testing: 3, deployment: 4, modernization: 5 })[change.stage] ?? 6;
}

/** @typedef {'simple' | 'moderate' | 'complex' | 'unknown'} ComplexityLevel */
/** @typedef {{level: ComplexityLevel, basis?: string, evidence_source_ids?: string[]}} RemediationComplexity */
export const COMPLEXITY_LEVELS = ['simple', 'moderate', 'complex', 'unknown'];

export function complexityForChange(change) {
  return change.complexity?.level ?? 'unknown';
}

export function validComplexity(change) {
  /** @type {RemediationComplexity | undefined} */
  const value = change.complexity;
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !COMPLEXITY_LEVELS.includes(value.level)) return false;
  if (value.level === 'unknown') return true;
  return typeof value.basis === 'string' && Boolean(value.basis.trim()) &&
    Array.isArray(value.evidence_source_ids) && value.evidence_source_ids.length > 0 &&
    value.evidence_source_ids.every(id => (change.evidence ?? []).some(e => e.source_id === id));
}

export function evidenceForLanguage(records, sources, language) {
  const sourceLanguages = new Map(sources.map(source => [source.id, source.language]));
  const localized = records.filter(record => sourceLanguages.get(record.source_id) === language);
  return localized.length ? localized : records.filter(record => sourceLanguages.get(record.source_id) === 'en');
}

function sourcePathReleaseKeys(source, from, to, latest = null) {
  if (!source || source.documentation_channel === 'moving-current' ||
      /\bbeta\b/i.test(source.fetch?.documentation?.channel_label ?? '')) return [];
  const resolve = value => releaseKey(value === 'latest' ? latest?.release : value);
  const start = resolve(from);
  const end = resolve(to);
  if (!start || !end || compareRelease(start, end) > 0) return [];
  // Historical R editions belong to the next base-major migration bucket.
  // Coarse targets include their patch editions (e.g. v18 includes 18.2),
  // whereas exact targets/latest must never borrow a later edition.
  const pathMajor = release => release[0] + (release[1] ? 1 : 0);
  return String(source.edition ?? '').split(/\s*\/\s*/)
    .map(edition => releaseKey(edition.replace(/(\d)-R/gi, '$1 R'))).filter(release => {
    return release && pathMajor(release) >= pathMajor(start) && pathMajor(release) <= pathMajor(end) &&
      (/^v\d+$/.test(from) || compareRelease(release, start) >= 0) &&
      (/^v\d+$/.test(to) || compareRelease(release, end) <= 0);
  });
}

export function sourceMatchesPath(source, from, to, latest = null) {
  return sourcePathReleaseKeys(source, from, to, latest).length > 0;
}

export function evidenceForPath(records, sources, from, to, latest = null) {
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const releaseById = new Map();
  const seen = new Set();
  return records.filter(record => {
    if (!releaseById.has(record.source_id)) {
      const releases = sourcePathReleaseKeys(sourceById.get(record.source_id), from, to, latest);
      releaseById.set(record.source_id, releases.sort(compareRelease).at(-1));
    }
    if (!releaseById.get(record.source_id)) return false;
    const identity = JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  // Prefer the closest in-path edition before locale selection, without losing
  // distinct supporting blocks or the English fallback for other member facts.
  }).sort((left, right) => compareRelease(releaseById.get(right.source_id), releaseById.get(left.source_id)));
}

export function projectChangeForPath(change, sources, from, to, latest = null) {
  const grouped = Array.isArray(change.members) && change.members.length > 0;
  if (!grouped && !crossesVersion(change, from, to, latest)) return null;
  const projection = structuredClone(change);
  if (grouped) {
    projection.members = change.members.map(member => projectChangeForPath(member, sources, from, to, latest))
      .filter(Boolean);
    if (!projection.members.length) return null;
    projection.visible_member_ids = projection.members.map(member => member.id);
    projection.unresolved_member_ids = projection.members.filter(member =>
      member.evidence_disposition !== 'in_path').map(member => member.id);
    // Group-only supplemental citations can describe later workarounds. Build
    // the visible union from applicable atomic facts, never from those extras.
    projection.evidence = evidenceForPath(projection.members.flatMap(member => member.evidence),
      sources, from, to, latest);
    projection.identifiers = [...new Set(projection.members.flatMap(member => member.identifiers ?? []))];
  } else {
    projection.visible_member_ids = [change.id];
    projection.evidence = evidenceForPath(projection.evidence ?? [], sources, from, to, latest);
    projection.unresolved_member_ids = projection.evidence.length ? [] : [change.id];
  }
  projection.evidence_disposition = !projection.evidence.length ? 'unresolved' :
    projection.unresolved_member_ids.length ? 'partial' : 'in_path';
  projection.evidence_path_unresolved = projection.evidence_disposition !== 'in_path';
  return projection;
}

export function filterOptions(changes, key) {
  if (key === 'platforms') return ['windows', 'macos'];
  const values = [...new Set(changes.flatMap(change => change[key] ?? []))];
  const known = values.filter(value => !['all', 'unknown'].includes(value)).sort();
  return (known.length || !values.includes('all') ? known : ['all']).concat('unknown');
}

function matchesOptions(values, selected, options, includeUnknown = false) {
  if (!selected.length) return false;
  const applicable = values?.length ? values : ['unknown'];
  return applicable.some(value => value === 'all' || (includeUnknown && value === 'unknown')
    ? selected.some(option => option !== 'unknown' && options.includes(option))
    : selected.includes(value));
}

export function crossesVersion(change, source, target, latest = null) {
  const resolve = value => releaseKey(value === 'latest' ? latest?.release : value);
  const from = resolve(source);
  const to = resolve(target);
  const targets = change.applicability?.target_releases;
  // An exact-target instruction is not an intermediate upgrade requirement.
  // A coarse major may include its documented patch, but not a later R cycle.
  if (targets && to && !targets.some(value => {
    const release = resolve(value);
    return !release || (/^v\d+$/.test(target) ? release[0] === to[0] && release[1] === 0 :
      compareRelease(release, to) === 0);
  })) return false;
  const until = resolve(change.applies_until);
  // Bounds concern the final target, not whether the migration traverses the workaround.
  if (until && to && compareRelease(to, until) >= 0) return false;
  if (!from || !to || change.threshold?.kind === 'unknown') return true;
  if (compareRelease(from, to) > 0) return false;
  const releases = change.threshold?.alternatives ?? [change.threshold?.exact ?? change.threshold?.bucket];
  const deprecated = ['deprecated', 'deprecation'].includes(change.type) ||
    change.threshold?.kind === 'deprecated';
  // Alternatives describe one canonical fix, not a new action on every branch.
  // Only a reached cutoff on the source's own major/LTS-or-R branch proves it
  // already has the fix; an LTS cutoff cannot establish an R source's status.
  if (!deprecated && change.threshold?.alternatives && releases.some(value => {
    const release = resolve(value);
    return release && release[0] === from[0] && Boolean(release[1]) === Boolean(from[1]) &&
      compareRelease(release, from) <= 0;
  })) return false;
  return releases.some(value => {
    const release = resolve(value);
    if (!release) return true; // Unknown applicability is never silently discarded.
    // A major selector is a coarse base, not proof of an installed patch/HF/build.
    // Include possible same-base patches conservatively, but never its later R cycle.
    const inTarget = compareRelease(release, to) <= 0 ||
      (/^v\d+$/.test(target) && release[0] === to[0] && release[1] === 0);
    return inTarget && (deprecated || compareRelease(release, from) > 0);
  });
}

export function filterChanges(changes, filters = {}, latest = null) {
  const platformOptions = filterOptions(changes, 'platforms');
  const moduleOptions = filterOptions(changes, 'modules');
  const { source = 'v16', target = 'v21', platforms = platformOptions,
    modules = moduleOptions, query = '', sort = 'severity' } = filters;
  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  return changes.filter(change => {
    if (!crossesVersion(change, source, target, latest)) return false;
    if (!matchesOptions(change.platforms, platforms.filter(value => platformOptions.includes(value)),
      platformOptions, true)) return false;
    if (!matchesOptions(change.modules, modules, moduleOptions)) return false;
    const searchable = [
      change.id, ...(change.visible_member_ids ?? change.member_ids ?? []), ...(change.identifiers ?? []),
      change.action, change.threshold?.exact,
      ...(change.threshold?.alternatives ?? []),
      ...Object.values(change.localizations ?? {}).flatMap(l => [l.one_line, l.paragraph]),
      ...(change.members ?? []).flatMap(member =>
        Object.values(member.localizations ?? {}).flatMap(l => [l.one_line, l.paragraph])),
      ...(change.evidence ?? []).flatMap(e => [e.heading, e.excerpt]),
    ].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  }).sort((a, b) => {
    const complexityOrder = COMPLEXITY_LEVELS.indexOf(complexityForChange(a)) -
      COMPLEXITY_LEVELS.indexOf(complexityForChange(b));
    const severityOrder = priorityForChange(a) - priorityForChange(b);
    return (sort === 'complexity' ? complexityOrder || severityOrder : severityOrder) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

export function validateCatalog(data) {
  if (!data || data.schema_version !== 1 || !Array.isArray(data.changes) || !Array.isArray(data.sources) ||
      !data.coverage || !data.latest || !data.semantic_search ||
      (data.clarifications !== undefined && !Array.isArray(data.clarifications))) throw new Error('invalidCatalog');
  const ids = new Set();
  const memberIds = new Set();
  for (const change of data.changes) {
    if (!change || typeof change.id !== 'string' || !change.id || ids.has(change.id) ||
        !change.threshold || !change.localizations || typeof change.localizations !== 'object' ||
        Array.isArray(change.localizations) || !validComplexity(change) || !validVersionApplicability(change) ||
        !validLocalizedApplicability(change) ||
        ['platforms', 'modules', 'identifiers', 'evidence', 'notices'].some(key =>
          change[key] !== undefined && !Array.isArray(change[key]))) throw new Error('invalidCatalog');
    ids.add(change.id);
    if (change.member_ids !== undefined) {
      if (!Array.isArray(change.member_ids) || !change.member_ids.length ||
          change.member_ids.some(id => typeof id !== 'string' || !id || memberIds.has(id)) ||
          new Set(change.member_ids).size !== change.member_ids.length) throw new Error('invalidCatalog');
      for (const id of change.member_ids) memberIds.add(id);
      if (change.member_ids.length > 1 && (!Array.isArray(change.members) ||
          change.members.length !== change.member_ids.length ||
          change.members.some((member, index) => member?.id !== change.member_ids[index] ||
            !validVersionApplicability(member) ||
            !validLocalizedApplicability(member) ||
            !sameThreshold(member.threshold, change.threshold) ||
            JSON.stringify(member.applicability?.target_releases) !==
              JSON.stringify(change.applicability?.target_releases) ||
            member.applies_until !== change.applies_until))) {
        throw new Error('invalidCatalog');
      }
    }
  }
  if (data.sources.some(source => !source || typeof source.id !== 'string') ||
      (data.clarifications ?? []).some(entry => !entry || typeof entry !== 'object')) throw new Error('invalidCatalog');
  return data;
}

export const translations = {
  en: {
    directoryTitle: 'Find your migration changes', versions: 'Versions', filters: 'Filters', topics: 'Topics',
    versionDirection: 'From current version to target version', otherTopics: 'Other',
    selectAll: 'Select all', unselectAll: 'Unselect all',
    selectPlatforms: 'Select all platforms', unselectPlatforms: 'Unselect all platforms',
    selectTopics: 'Select all topics', unselectTopics: 'Unselect all topics',
    complexity: 'Complexity', simple: 'Simple', moderate: 'Moderate', complex: 'Complex',
    severityDirection: 'Highest severity first; unknown last.',
    complexityDirection: 'Remediation difficulty: Simple → Moderate → Complex; Unknown last.',
    complexityBasis: 'Why this difficulty',
    summaryCaveat: 'This summary has not been independently checked. Verify the instructions in the linked source.',
    sourceCaveat: 'This source could not be checked. Open the link to verify the claim before acting.',
    evidenceUnavailable: 'No evidence is available in this language or English.',
    pathEvidenceUnavailable: 'Evidence for this migration path is unavailable for one or more applicable facts. Later source editions are not treated as historical verification.',
    emptyDirectory: 'Check your versions and filters. No results does not mean there are no migration issues.',
    'documentation-release-notes': 'Current official documentation · Release Notes',
    official_documentation: 'Official documentation', documentationChannel: 'Documentation route',
    'moving-current': 'Moving current (unversioned)', versioned: 'Versioned',
    observedVersionLabel: 'Observed documentation version label (not released-latest verification)',
    unlinkedLocales: 'Locales not linked by official navigation',
    unlinkedLocalesNote: 'No counterpart is advertised in these editions. No guessed URL was requested; this is not an HTTP 404 result. Portuguese is advertised but outside the app language scope.',
    siteLanguages: 'Languages advertised by this documentation site',
    manual: 'Manual', 'language-reference': 'Language Reference', 'design-reference': 'Design Reference',
    'whats-new': "What's new", 'obsolete-deprecated-commands': 'Obsolete / deprecated commands',
    contentKind: 'Extracted surface', navigation_index: 'Navigation index', article: 'Article',
    navigationEntries: 'Entries in the extracted index view', selectedTab: 'Selected tab (not a change threshold)',
    manualParent: 'Linked same-edition manual',
    navigationNote: 'Only this index view was extracted. Entries and other tabs are not automatically followed or cataloged.',
    urlHistory: 'Superseded URL attempts (not missing translations)', archiveTrace: 'Verified archive link path', upgrade: 'Upgrade',
    actionBasis: 'Why this action',
    php: 'PHP', printing: 'Printing', windows: 'Windows', macos: 'macOS',
    forms: 'Forms', logging: 'Logging', database: 'Database', backup: 'Backup',
    mail: 'Mail', web: 'Web', 'file I/O': 'File I/O', 'plug-ins': 'Plug-ins',
    ORDA: 'ORDA', XML: 'XML', '4D Write Pro': '4D Write Pro', '4D View Pro': '4D View Pro',
    JSON: 'JSON', SQL: 'SQL', network: 'Network', components: 'Components',
    latestFeature: 'Latest feature release', latestLts: 'Latest LTS release', releasedAt: 'Released on',
    featureChannelNote: 'Feature-release channel, not LTS or account-only hotfix/build verification.',
    discoveries: 'Discovered URLs (separate from registered sources)', discoveryNote: 'Pending discoveries have not been retrieved or included in registered-source retrieval totals.',
    editorialNote: 'Generated candidate summaries, conditions, actions and rationales are editorial translations, not official translations. Technical identifiers and original evidence retain their source spelling.',
    removal: 'Removal', modernization: 'Modernization', publisher: 'Publisher', authority: 'Source authority',
    official_documentation_mirror: 'Official documentation mirror', official: 'Official', hostOperator: 'Host operator',
    httpStatus: 'HTTP status', fetchError: 'Retrieval error', checkedAt: 'Checked at',
    appTitle: 'Migration Atlas', poc: 'Evidence-led · Proof of concept', skip: 'Skip to content', language: 'Language', theme: 'Appearance', system: 'System', light: 'Light', dark: 'Dark',
    introLabel: 'EVIDENCE-BASED DIRECTORY', headline: 'Know what changes. Keep the unknowns in view.', intro: 'Browse migration changes, read concise summaries, and follow the original evidence.',
    scopeTitle: 'Scope: an application already opened or converted', scope: 'Opening or conversion failures belong with official 4D support. A binary-to-project conversion is not assumed. This catalogue is not a guarantee of upgrade safety.', support: 'Official 4D support ↗',
    views: 'Views', changes: 'Changes', clarifications: 'Clarifications', sources: 'Sources', coverage: 'Coverage & verification', seeds: 'English seed sources', registered: 'Registered sources', candidates: 'Candidate changes', reviewedCount: 'Reviewed changes',
    generatedAt: 'Catalogue generated', processed: 'Sources used for sample (partial)', fetchStatus: 'Retrieval status', coverageNote: 'Coverage note', latest: 'Latest', latestUnavailable: 'Latest — unverified, unavailable', verifiedAt: 'Verified at', unavailable: 'Unavailable', unknown: 'Unknown', notProvided: 'Not provided',
    sourceVersion: 'From version', targetVersion: 'To version', search: 'Keyword or exact identifier', searchPlaceholder: 'Command, identifier, or keyword', platform: 'Platform', allPlatforms: 'All platforms', module: 'Module', allModules: 'All modules', sort: 'Sort', priority: 'Stage, then severity', release: 'Original release', reset: 'Reset filters',
    offlineSearch: 'Keyword and identifier matching runs locally, without models. This is not semantic search.', semanticUnavailable: 'Semantic search unavailable', semanticReason: 'Reason',
    preferencesError: 'Language/theme preferences could not be loaded or saved. Your current selection still applies to this page.',
    versionWarning: 'Choose a target later than the source to see newly crossed changes. Existing deprecations and unknown thresholds remain visible.', resultCount: '{count} of {total} changes', noResults: 'No matching records', noResultsBody: 'No results does not mean a safe upgrade. Check your filters, source coverage, and unresolved questions.',
    candidate: 'Candidate · not human-reviewed', reviewed: 'Reviewed (catalogue status)', reviewUnknown: 'Review status unknown', generated_candidate: 'Generated candidate', human_reviewed: 'Human-reviewed', provenance: 'Text provenance', reviewStatus: 'Review status', stage: 'Stage', criticality: 'Severity', type: 'Type', bucket: 'Version bucket', identifiers: 'Identifiers', applicability: 'Applicability & action', formats: 'Application formats', conditions: 'Conditions', action: 'Action', relevance: 'Scope relevance', evidence: 'Evidence', sourceEdition: 'Source edition', sourceLanguage: 'Source language', confidence: 'Confidence', notices: 'Notices', appliesUntil: 'Before target release', fallback: 'Translation unavailable; showing English or catalogue text.', noEvidence: 'No evidence recorded.', sourceId: 'Source ID', family: 'Family', fetchedAt: 'Retrieved at', checksum: 'SHA-256', originalUrl: 'Registered URL', resolvedUrl: 'Resolved URL', excerpt: 'Original source excerpt', noChanges: 'No changes published yet.',
    clarificationsIntro: 'Open questions and documented dispositions are separate from migration changes. A resolved question does not imply human review of a change.', noClarifications: 'No clarifications published', noClarificationsBody: 'No recorded questions does not mean there are no uncertainties.', disposition: 'Disposition', relatedChanges: 'Related change IDs', issue: 'Tracking issue ↗', status: 'Status',
    sourcesIntro: 'Registration is not proof of successful retrieval or complete coverage. Source editions and original release thresholds are distinct from version buckets.', noSources: 'No sources published', noSourcesBody: 'Coverage cannot yet be assessed.',
    loading: 'Loading the static catalogue…', loadError: 'The catalogue could not be loaded. Coverage is unknown; no safety conclusion can be drawn. Check that ./data/catalog.json is published and valid, then reload.', invalidCatalog: 'Unsupported or invalid catalogue.', footer: 'Static catalogue · No backend · No runtime GitHub calls · No on-demand AI',
    blocking: 'Blocking', critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', informational: 'Informational', restriction: 'Restriction', removed: 'Removed', deprecated: 'Deprecated', deprecation: 'Deprecation', introduced: 'Introduced', behavior: 'Behavior', syntax: 'Syntax', compilation: 'Compilation', runtime: 'Runtime', deployment: 'Deployment', testing: 'Testing', design: 'Design', languageModule: 'Language', all: 'All', binary: 'Binary', project: 'Project', in_scope: 'In scope', out_of_scope: 'Out of scope', conditional: 'Conditional', available: 'Available', failed: 'Failed', pending: 'Pending', resolved: 'Resolved', superseded: 'Superseded', unverified: 'Unverified', verified: 'Verified', missing: 'Missing', blocked: 'Blocked', error: 'Error', fetched: 'Retrieved', partial: 'Partial', not_attempted: 'Not attempted',
  },
  fr: {
    directoryTitle: 'Trouvez les changements pour votre migration', versions: 'Versions', filters: 'Filtres', topics: 'Thèmes',
    versionDirection: 'De la version actuelle à la version cible', otherTopics: 'Autres',
    selectAll: 'Tout sélectionner', unselectAll: 'Tout désélectionner',
    selectPlatforms: 'Sélectionner toutes les plateformes', unselectPlatforms: 'Désélectionner toutes les plateformes',
    selectTopics: 'Sélectionner tous les thèmes', unselectTopics: 'Désélectionner tous les thèmes',
    complexity: 'Complexité', simple: 'Simple', moderate: 'Modérée', complex: 'Complexe',
    severityDirection: 'Gravité décroissante ; inconnue en dernier.',
    complexityDirection: 'Difficulté de mise en œuvre : simple → modérée → complexe ; inconnue en dernier.',
    complexityBasis: 'Justification de la difficulté',
    summaryCaveat: 'Ce résumé n’a pas été vérifié indépendamment. Vérifiez les instructions dans la source liée.',
    sourceCaveat: 'Cette source n’a pas pu être vérifiée. Consultez le lien pour vérifier l’affirmation avant d’agir.',
    evidenceUnavailable: 'Aucune preuve disponible dans cette langue ou en anglais.',
    pathEvidenceUnavailable: 'Les preuves correspondant à ce parcours de migration sont indisponibles pour un ou plusieurs faits applicables. Les éditions ultérieures ne constituent pas une vérification historique.',
    emptyDirectory: 'Vérifiez vos versions et filtres. L’absence de résultats ne signifie pas l’absence de problèmes de migration.',
    'documentation-release-notes': 'Documentation officielle actuelle · Notes de version',
    official_documentation: 'Documentation officielle', documentationChannel: 'Route de documentation',
    'moving-current': 'Version courante évolutive (sans version dans l’URL)', versioned: 'Versionnée',
    observedVersionLabel: 'Libellé de version observé (pas une vérification de la dernière version publiée)',
    unlinkedLocales: 'Langues non liées par la navigation officielle',
    unlinkedLocalesNote: 'Aucune page correspondante n’est annoncée pour ces éditions. Aucune URL devinée n’a été demandée ; il ne s’agit pas d’un résultat HTTP 404. Le portugais est proposé mais hors des langues de l’application.',
    siteLanguages: 'Langues annoncées par ce site de documentation',
    manual: 'Manuel', 'language-reference': 'Référence du langage', 'design-reference': 'Référence du mode Développement',
    'whats-new': 'Nouveautés', 'obsolete-deprecated-commands': 'Commandes obsolètes / dépréciées',
    contentKind: 'Contenu extrait', navigation_index: 'Index de navigation', article: 'Article',
    navigationEntries: 'Entrées de la vue extraite de l’index', selectedTab: 'Onglet sélectionné (pas un seuil de changement)',
    manualParent: 'Manuel lié de la même édition',
    navigationNote: 'Seule cette vue de l’index a été extraite. Les entrées et autres onglets ne sont pas automatiquement suivis ni catalogués.',
    urlHistory: 'Tentatives d’URL remplacées (pas des traductions absentes)', archiveTrace: 'Chemin vérifié des liens de l’archive', upgrade: 'Mise à niveau',
    actionBasis: 'Pourquoi cette action',
    php: 'PHP', printing: 'Impression', windows: 'Windows', macos: 'macOS',
    forms: 'Formulaires', logging: 'Journaux', database: 'Base de données', backup: 'Sauvegarde',
    mail: 'Messagerie', web: 'Web', 'file I/O': 'Entrées/sorties de fichiers', 'plug-ins': 'Plug-ins',
    ORDA: 'ORDA', XML: 'XML', '4D Write Pro': '4D Write Pro', '4D View Pro': '4D View Pro',
    JSON: 'JSON', SQL: 'SQL', network: 'Réseau', components: 'Composants',
    latestFeature: 'Dernière version évolutive', latestLts: 'Dernière version LTS', releasedAt: 'Publié le',
    featureChannelNote: 'Canal des versions évolutives, distinct du LTS et sans vérification des correctifs/builds réservés aux comptes.',
    discoveries: 'URL découvertes (distinctes des sources enregistrées)', discoveryNote: 'Les découvertes en attente ne sont ni récupérées ni incluses dans les totaux de récupération des sources enregistrées.',
    editorialNote: 'Les résumés, conditions, actions et justifications des candidats générés sont des traductions éditoriales, et non officielles. Les identifiants techniques et les preuves originales conservent leur graphie source.',
    removal: 'Suppression', modernization: 'Modernisation', publisher: 'Éditeur', authority: 'Autorité de la source',
    official_documentation_mirror: 'Miroir de documentation officielle', official: 'Officiel', hostOperator: 'Opérateur de l’hôte',
    httpStatus: 'État HTTP', fetchError: 'Erreur de récupération', checkedAt: 'Contrôlé le',
    appTitle: 'Atlas de migration', poc: 'Fondé sur les preuves · Prototype', skip: 'Aller au contenu', language: 'Langue', theme: 'Apparence', system: 'Système', light: 'Clair', dark: 'Sombre',
    introLabel: 'RÉPERTOIRE FONDÉ SUR LES SOURCES', headline: 'Comprendre les changements. Garder les inconnues en vue.', intro: 'Parcourez les changements de migration, lisez des résumés concis et consultez les sources originales.',
    scopeTitle: 'Périmètre : application déjà ouverte ou convertie', scope: 'Les échecs d’ouverture ou de conversion relèvent du support officiel 4D. Une conversion binaire vers projet n’est pas présumée. Ce catalogue ne garantit pas une migration sans risque.', support: 'Support officiel 4D ↗',
    views: 'Vues', changes: 'Changements', clarifications: 'Clarifications', sources: 'Sources', coverage: 'Couverture et vérification', seeds: 'Sources initiales anglaises', registered: 'Sources enregistrées', candidates: 'Changements candidats', reviewedCount: 'Changements revus',
    generatedAt: 'Catalogue généré le', processed: 'Sources utilisées pour l’échantillon (partiel)', fetchStatus: 'État de récupération', coverageNote: 'Note de couverture', latest: 'Dernière version', latestUnavailable: 'Dernière version — non vérifiée, indisponible', verifiedAt: 'Vérifié le', unavailable: 'Indisponible', unknown: 'Inconnu', notProvided: 'Non renseigné',
    sourceVersion: 'Version de départ', targetVersion: 'Version cible', search: 'Mot-clé ou identifiant exact', searchPlaceholder: 'Commande, identifiant ou mot-clé', platform: 'Plateforme', allPlatforms: 'Toutes les plateformes', module: 'Module', allModules: 'Tous les modules', sort: 'Tri', priority: 'Étape, puis gravité', release: 'Version d’origine', reset: 'Réinitialiser les filtres',
    offlineSearch: 'La recherche par mots-clés et identifiants s’effectue localement, sans modèle. Ce n’est pas une recherche sémantique.', semanticUnavailable: 'Recherche sémantique indisponible', semanticReason: 'Motif',
    preferencesError: 'Impossible de charger ou d’enregistrer les préférences de langue et de thème. Votre sélection actuelle reste appliquée à cette page.',
    versionWarning: 'Choisissez une cible postérieure à la source pour voir les nouveaux changements traversés. Les dépréciations existantes et les seuils inconnus restent visibles.', resultCount: '{count} changements sur {total}', noResults: 'Aucun résultat', noResultsBody: 'L’absence de résultats ne signifie pas une migration sans risque. Vérifiez les filtres, la couverture et les questions ouvertes.',
    candidate: 'Candidat · sans revue humaine', reviewed: 'Revu (état du catalogue)', reviewUnknown: 'État de revue inconnu', generated_candidate: 'Candidat généré', human_reviewed: 'Revu par un humain', provenance: 'Provenance du texte', reviewStatus: 'État de revue', stage: 'Étape', criticality: 'Gravité', type: 'Type', bucket: 'Groupe de versions', identifiers: 'Identifiants', applicability: 'Applicabilité et action', formats: 'Formats d’application', conditions: 'Conditions', action: 'Action', relevance: 'Pertinence pour le périmètre', evidence: 'Preuves', sourceEdition: 'Édition source', sourceLanguage: 'Langue source', confidence: 'Confiance', notices: 'Avertissements', appliesUntil: 'Avant la version cible', fallback: 'Traduction indisponible ; texte anglais ou du catalogue affiché.', noEvidence: 'Aucune preuve enregistrée.', sourceId: 'Identifiant source', family: 'Famille', fetchedAt: 'Récupéré le', checksum: 'SHA-256', originalUrl: 'URL enregistrée', resolvedUrl: 'URL résolue', excerpt: 'Extrait original de la source', noChanges: 'Aucun changement publié.',
    clarificationsIntro: 'Les questions ouvertes et leurs conclusions sont séparées des changements. Une question résolue n’implique pas de revue humaine d’un changement.', noClarifications: 'Aucune clarification publiée', noClarificationsBody: 'L’absence de questions enregistrées ne signifie pas l’absence d’incertitudes.', disposition: 'Conclusion', relatedChanges: 'Identifiants des changements liés', issue: 'Ticket de suivi ↗', status: 'État',
    sourcesIntro: 'L’enregistrement ne prouve ni une récupération réussie ni une couverture complète. Les éditions sources et versions d’origine sont distinctes des groupes de versions.', noSources: 'Aucune source publiée', noSourcesBody: 'La couverture ne peut pas encore être évaluée.',
    loading: 'Chargement du catalogue statique…', loadError: 'Impossible de charger le catalogue. La couverture est inconnue ; aucune conclusion de sécurité n’est possible. Vérifiez la publication et la validité de ./data/catalog.json, puis rechargez.', invalidCatalog: 'Catalogue invalide ou non pris en charge.', footer: 'Catalogue statique · Sans serveur · Sans appel GitHub à l’exécution · Sans IA à la demande',
    blocking: 'Bloquant', critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible', informational: 'Informatif', restriction: 'Restriction', removed: 'Supprimé', deprecated: 'Déprécié', deprecation: 'Dépréciation', introduced: 'Introduit', behavior: 'Comportement', syntax: 'Syntaxe', compilation: 'Compilation', runtime: 'Exécution', deployment: 'Déploiement', testing: 'Tests', design: 'Conception', languageModule: 'Langage', all: 'Tous', binary: 'Binaire', project: 'Projet', in_scope: 'Dans le périmètre', out_of_scope: 'Hors périmètre', conditional: 'Conditionnel', available: 'Disponible', failed: 'Échec', pending: 'En attente', resolved: 'Résolu', superseded: 'Remplacé', unverified: 'Non vérifié', verified: 'Vérifié', missing: 'Manquant', blocked: 'Bloqué', error: 'Erreur', fetched: 'Récupéré', partial: 'Partiel', not_attempted: 'Non tenté',
  },
  de: {
    directoryTitle: 'Änderungen für Ihre Migration finden', versions: 'Versionen', filters: 'Filter', topics: 'Themen',
    versionDirection: 'Von der aktuellen Version zur Zielversion', otherTopics: 'Sonstige',
    selectAll: 'Alle auswählen', unselectAll: 'Alle abwählen',
    selectPlatforms: 'Alle Plattformen auswählen', unselectPlatforms: 'Alle Plattformen abwählen',
    selectTopics: 'Alle Themen auswählen', unselectTopics: 'Alle Themen abwählen',
    complexity: 'Komplexität', simple: 'Einfach', moderate: 'Mittel', complex: 'Komplex',
    severityDirection: 'Höchster Schweregrad zuerst; unbekannt zuletzt.',
    complexityDirection: 'Schwierigkeit der Umsetzung: einfach → mittel → komplex; unbekannt zuletzt.',
    complexityBasis: 'Begründung der Schwierigkeit',
    summaryCaveat: 'Diese Zusammenfassung wurde nicht unabhängig geprüft. Prüfen Sie die Anweisungen in der verlinkten Quelle.',
    sourceCaveat: 'Diese Quelle konnte nicht geprüft werden. Prüfen Sie die Aussage über den Link, bevor Sie handeln.',
    evidenceUnavailable: 'Keine Belege in dieser Sprache oder auf Englisch verfügbar.',
    pathEvidenceUnavailable: 'Für mindestens einen zutreffenden Sachverhalt fehlen Belege für diesen Migrationspfad. Spätere Quellausgaben gelten nicht als historische Bestätigung.',
    emptyDirectory: 'Prüfen Sie Versionen und Filter. Keine Ergebnisse bedeuten nicht, dass es keine Migrationsprobleme gibt.',
    'documentation-release-notes': 'Aktuelle offizielle Dokumentation · Versionshinweise',
    official_documentation: 'Offizielle Dokumentation', documentationChannel: 'Dokumentationsroute',
    'moving-current': 'Fortlaufend aktuell (unversionierte URL)', versioned: 'Versioniert',
    observedVersionLabel: 'Beobachtete Dokumentationsversion (kein Nachweis der neuesten Veröffentlichung)',
    unlinkedLocales: 'Nicht von der offiziellen Navigation verlinkte Sprachen',
    unlinkedLocalesNote: 'Für diese Ausgaben wird kein Gegenstück angeboten. Keine erratene URL wurde abgerufen; dies ist kein HTTP-404-Ergebnis. Portugiesisch wird angeboten, gehört aber nicht zu den App-Sprachen.',
    siteLanguages: 'Von dieser Dokumentationsseite angebotene Sprachen',
    manual: 'Handbuch', 'language-reference': 'Sprachreferenz', 'design-reference': 'Designreferenz',
    'whats-new': 'Neuheiten', 'obsolete-deprecated-commands': 'Veraltete / abgekündigte Befehle',
    contentKind: 'Extrahierter Inhalt', navigation_index: 'Navigationsindex', article: 'Artikel',
    navigationEntries: 'Einträge in der extrahierten Indexansicht', selectedTab: 'Ausgewählter Reiter (keine Änderungsschwelle)',
    manualParent: 'Verlinktes Handbuch derselben Ausgabe',
    navigationNote: 'Nur diese Indexansicht wurde extrahiert. Einträge und andere Reiter werden nicht automatisch verfolgt oder katalogisiert.',
    urlHistory: 'Ersetzte URL-Versuche (keine fehlenden Übersetzungen)', archiveTrace: 'Verifizierter Linkpfad im Archiv', upgrade: 'Upgrade',
    actionBasis: 'Begründung der Maßnahme',
    php: 'PHP', printing: 'Drucken', windows: 'Windows', macos: 'macOS',
    forms: 'Formulare', logging: 'Protokollierung', database: 'Datenbank', backup: 'Datensicherung',
    mail: 'E-Mail', web: 'Web', 'file I/O': 'Datei-Ein-/Ausgabe', 'plug-ins': 'Plug-ins',
    ORDA: 'ORDA', XML: 'XML', '4D Write Pro': '4D Write Pro', '4D View Pro': '4D View Pro',
    JSON: 'JSON', SQL: 'SQL', network: 'Netzwerk', components: 'Komponenten',
    latestFeature: 'Neueste Feature-Version', latestLts: 'Neueste LTS-Version', releasedAt: 'Veröffentlicht am',
    featureChannelNote: 'Feature-Versionskanal, nicht LTS; keine Prüfung kontogebundener Hotfixes/Builds.',
    discoveries: 'Entdeckte URLs (getrennt von registrierten Quellen)', discoveryNote: 'Ausstehende Entdeckungen wurden noch nicht abgerufen und sind nicht in den Abrufzahlen registrierter Quellen enthalten.',
    editorialNote: 'Zusammenfassungen, Bedingungen, Maßnahmen und Begründungen generierter Kandidaten sind redaktionelle, keine offiziellen Übersetzungen. Technische Kennungen und Originalbelege behalten die Schreibweise der Quelle.',
    removal: 'Entfernung', modernization: 'Modernisierung', publisher: 'Herausgeber', authority: 'Quellenautorität',
    official_documentation_mirror: 'Spiegel offizieller Dokumentation', official: 'Offiziell', hostOperator: 'Hostbetreiber',
    httpStatus: 'HTTP-Status', fetchError: 'Abruffehler', checkedAt: 'Geprüft am',
    appTitle: 'Migrationsatlas', poc: 'Belegbasiert · Machbarkeitsstudie', skip: 'Zum Inhalt', language: 'Sprache', theme: 'Darstellung', system: 'System', light: 'Hell', dark: 'Dunkel',
    introLabel: 'QUELLENBASIERTES VERZEICHNIS', headline: 'Änderungen verstehen. Unbekanntes im Blick behalten.', intro: 'Durchsuchen Sie Migrationsänderungen, lesen Sie kurze Zusammenfassungen und folgen Sie den Originalquellen.',
    scopeTitle: 'Umfang: eine bereits geöffnete oder konvertierte Anwendung', scope: 'Bei Öffnungs- oder Konvertierungsfehlern hilft der offizielle 4D-Support. Eine Konvertierung von Binär zu Projekt wird nicht vorausgesetzt. Dieser Katalog garantiert kein sicheres Upgrade.', support: 'Offizieller 4D-Support ↗',
    views: 'Ansichten', changes: 'Änderungen', clarifications: 'Klärungen', sources: 'Quellen', coverage: 'Abdeckung und Verifizierung', seeds: 'Englische Ausgangsquellen', registered: 'Registrierte Quellen', candidates: 'Änderungskandidaten', reviewedCount: 'Geprüfte Änderungen',
    generatedAt: 'Katalog erstellt', processed: 'Für die Stichprobe verwendete Quellen (teilweise)', fetchStatus: 'Abrufstatus', coverageNote: 'Hinweis zur Abdeckung', latest: 'Neueste Version', latestUnavailable: 'Neueste — ungeprüft, nicht verfügbar', verifiedAt: 'Verifiziert am', unavailable: 'Nicht verfügbar', unknown: 'Unbekannt', notProvided: 'Nicht angegeben',
    sourceVersion: 'Ausgangsversion', targetVersion: 'Zielversion', search: 'Stichwort oder genaue Kennung', searchPlaceholder: 'Befehl, Kennung oder Stichwort', platform: 'Plattform', allPlatforms: 'Alle Plattformen', module: 'Modul', allModules: 'Alle Module', sort: 'Sortierung', priority: 'Phase, dann Schweregrad', release: 'Ursprüngliche Version', reset: 'Filter zurücksetzen',
    offlineSearch: 'Stichwort- und Kennungssuche erfolgen lokal, ohne Modelle. Dies ist keine semantische Suche.', semanticUnavailable: 'Semantische Suche nicht verfügbar', semanticReason: 'Grund',
    preferencesError: 'Sprach- und Darstellungseinstellungen konnten nicht geladen oder gespeichert werden. Die aktuelle Auswahl gilt weiterhin für diese Seite.',
    versionWarning: 'Wählen Sie eine Zielversion nach der Ausgangsversion, um neu überschrittene Änderungen zu sehen. Bestehende Abkündigungen und unbekannte Schwellen bleiben sichtbar.', resultCount: '{count} von {total} Änderungen', noResults: 'Keine passenden Einträge', noResultsBody: 'Keine Ergebnisse bedeuten kein sicheres Upgrade. Prüfen Sie Filter, Quellenabdeckung und offene Fragen.',
    candidate: 'Kandidat · nicht menschlich geprüft', reviewed: 'Geprüft (Katalogstatus)', reviewUnknown: 'Prüfstatus unbekannt', generated_candidate: 'Generierter Kandidat', human_reviewed: 'Menschlich geprüft', provenance: 'Textherkunft', reviewStatus: 'Prüfstatus', stage: 'Phase', criticality: 'Schweregrad', type: 'Typ', bucket: 'Versionsgruppe', identifiers: 'Kennungen', applicability: 'Anwendbarkeit und Maßnahme', formats: 'Anwendungsformate', conditions: 'Bedingungen', action: 'Maßnahme', relevance: 'Umfangsrelevanz', evidence: 'Belege', sourceEdition: 'Quellausgabe', sourceLanguage: 'Quellsprache', confidence: 'Vertrauen', notices: 'Hinweise', appliesUntil: 'Vor Zielversion', fallback: 'Übersetzung nicht verfügbar; englischer oder Katalogtext wird angezeigt.', noEvidence: 'Keine Belege erfasst.', sourceId: 'Quellen-ID', family: 'Familie', fetchedAt: 'Abgerufen am', checksum: 'SHA-256', originalUrl: 'Registrierte URL', resolvedUrl: 'Aufgelöste URL', excerpt: 'Originalquellenauszug', noChanges: 'Noch keine Änderungen veröffentlicht.',
    clarificationsIntro: 'Offene Fragen und dokumentierte Entscheidungen sind von Änderungen getrennt. Eine geklärte Frage bedeutet keine menschliche Prüfung einer Änderung.', noClarifications: 'Keine Klärungen veröffentlicht', noClarificationsBody: 'Keine erfassten Fragen bedeuten nicht, dass keine Unsicherheiten bestehen.', disposition: 'Entscheidung', relatedChanges: 'Verknüpfte Änderungs-IDs', issue: 'Nachverfolgung ↗', status: 'Status',
    sourcesIntro: 'Registrierung belegt weder erfolgreichen Abruf noch vollständige Abdeckung. Quellausgaben und ursprüngliche Versionsschwellen sind von Versionsgruppen zu unterscheiden.', noSources: 'Keine Quellen veröffentlicht', noSourcesBody: 'Die Abdeckung kann noch nicht bewertet werden.',
    loading: 'Statischer Katalog wird geladen…', loadError: 'Katalog konnte nicht geladen werden. Die Abdeckung ist unbekannt; eine Sicherheitsbewertung ist nicht möglich. Prüfen Sie, ob ./data/catalog.json veröffentlicht und gültig ist, und laden Sie neu.', invalidCatalog: 'Nicht unterstützter oder ungültiger Katalog.', footer: 'Statischer Katalog · Kein Backend · Keine GitHub-Aufrufe zur Laufzeit · Keine KI auf Abruf',
    blocking: 'Blockierend', critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig', informational: 'Informativ', restriction: 'Einschränkung', removed: 'Entfernt', deprecated: 'Abgekündigt', deprecation: 'Abkündigung', introduced: 'Eingeführt', behavior: 'Verhalten', syntax: 'Syntax', compilation: 'Kompilierung', runtime: 'Laufzeit', deployment: 'Bereitstellung', testing: 'Tests', design: 'Entwurf', languageModule: 'Sprache', all: 'Alle', binary: 'Binär', project: 'Projekt', in_scope: 'Im Umfang', out_of_scope: 'Außerhalb des Umfangs', conditional: 'Bedingt', available: 'Verfügbar', failed: 'Fehlgeschlagen', pending: 'Ausstehend', resolved: 'Geklärt', superseded: 'Ersetzt', unverified: 'Unverifiziert', verified: 'Verifiziert', missing: 'Fehlend', blocked: 'Blockiert', error: 'Fehler', fetched: 'Abgerufen', partial: 'Teilweise', not_attempted: 'Nicht versucht',
  },
  es: {
    directoryTitle: 'Encuentre los cambios para su migración', versions: 'Versiones', filters: 'Filtros', topics: 'Temas',
    versionDirection: 'De la versión actual a la versión de destino', otherTopics: 'Otros',
    selectAll: 'Seleccionar todo', unselectAll: 'Deseleccionar todo',
    selectPlatforms: 'Seleccionar todas las plataformas', unselectPlatforms: 'Deseleccionar todas las plataformas',
    selectTopics: 'Seleccionar todos los temas', unselectTopics: 'Deseleccionar todos los temas',
    complexity: 'Complejidad', simple: 'Simple', moderate: 'Moderada', complex: 'Compleja',
    severityDirection: 'Mayor gravedad primero; desconocida al final.',
    complexityDirection: 'Dificultad de aplicación: simple → moderada → compleja; desconocida al final.',
    complexityBasis: 'Justificación de la dificultad',
    summaryCaveat: 'Este resumen no se ha verificado de forma independiente. Verifique las instrucciones en la fuente enlazada.',
    sourceCaveat: 'No se pudo verificar esta fuente. Abra el enlace para comprobar la afirmación antes de actuar.',
    evidenceUnavailable: 'No hay pruebas disponibles en este idioma ni en inglés.',
    pathEvidenceUnavailable: 'No hay pruebas para este recorrido de migración sobre uno o varios hechos aplicables. Las ediciones posteriores de las fuentes no se consideran una verificación histórica.',
    emptyDirectory: 'Revise las versiones y los filtros. La ausencia de resultados no significa que no haya problemas de migración.',
    'documentation-release-notes': 'Documentación oficial actual · Notas de versión',
    official_documentation: 'Documentación oficial', documentationChannel: 'Ruta de documentación',
    'moving-current': 'Actual en evolución (URL sin versión)', versioned: 'Versionada',
    observedVersionLabel: 'Etiqueta de versión observada (no verifica la última versión publicada)',
    unlinkedLocales: 'Idiomas no enlazados por la navegación oficial',
    unlinkedLocalesNote: 'No se anuncia una página equivalente para estas ediciones. No se consultó ninguna URL inventada; no es un resultado HTTP 404. Se ofrece portugués, fuera de los idiomas de la aplicación.',
    siteLanguages: 'Idiomas anunciados por este sitio de documentación',
    manual: 'Manual', 'language-reference': 'Referencia del lenguaje', 'design-reference': 'Referencia de diseño',
    'whats-new': 'Novedades', 'obsolete-deprecated-commands': 'Comandos obsoletos / desaprobados',
    contentKind: 'Contenido extraído', navigation_index: 'Índice de navegación', article: 'Artículo',
    navigationEntries: 'Entradas en la vista extraída del índice', selectedTab: 'Pestaña seleccionada (no un umbral de cambio)',
    manualParent: 'Manual enlazado de la misma edición',
    navigationNote: 'Solo se extrajo esta vista del índice. Las entradas y otras pestañas no se siguen ni se catalogan automáticamente.',
    urlHistory: 'Intentos de URL sustituidos (no traducciones ausentes)', archiveTrace: 'Ruta de enlaces del archivo verificada', upgrade: 'Actualización',
    actionBasis: 'Motivo de esta medida',
    php: 'PHP', printing: 'Impresión', windows: 'Windows', macos: 'macOS',
    forms: 'Formularios', logging: 'Registros', database: 'Base de datos', backup: 'Copia de seguridad',
    mail: 'Correo', web: 'Web', 'file I/O': 'Entrada/salida de archivos', 'plug-ins': 'Plug-ins',
    ORDA: 'ORDA', XML: 'XML', '4D Write Pro': '4D Write Pro', '4D View Pro': '4D View Pro',
    JSON: 'JSON', SQL: 'SQL', network: 'Red', components: 'Componentes',
    latestFeature: 'Última versión de funciones', latestLts: 'Última versión LTS', releasedAt: 'Publicado el',
    featureChannelNote: 'Canal de versiones de funciones, no LTS ni verificación de correcciones/compilaciones exclusivas de cuentas.',
    discoveries: 'URL descubiertas (separadas de las fuentes registradas)', discoveryNote: 'Los descubrimientos pendientes no se han recuperado ni se incluyen en los totales de recuperación de fuentes registradas.',
    editorialNote: 'Los resúmenes, condiciones, acciones y justificaciones de los candidatos generados son traducciones editoriales, no oficiales. Los identificadores técnicos y las pruebas originales conservan la grafía de la fuente.',
    removal: 'Eliminación', modernization: 'Modernización', publisher: 'Editor', authority: 'Autoridad de la fuente',
    official_documentation_mirror: 'Espejo de documentación oficial', official: 'Oficial', hostOperator: 'Operador del alojamiento',
    httpStatus: 'Estado HTTP', fetchError: 'Error de recuperación', checkedAt: 'Comprobado el',
    appTitle: 'Atlas de migración', poc: 'Basado en pruebas · Prototipo', skip: 'Ir al contenido', language: 'Idioma', theme: 'Apariencia', system: 'Sistema', light: 'Claro', dark: 'Oscuro',
    introLabel: 'DIRECTORIO CON FUENTES', headline: 'Conozca los cambios. Mantenga visibles las incógnitas.', intro: 'Explore los cambios de migración, lea resúmenes concisos y consulte las fuentes originales.',
    scopeTitle: 'Alcance: una aplicación ya abierta o convertida', scope: 'Los fallos de apertura o conversión corresponden al soporte oficial de 4D. No se presupone una conversión de binario a proyecto. Este catálogo no garantiza una actualización segura.', support: 'Soporte oficial de 4D ↗',
    views: 'Vistas', changes: 'Cambios', clarifications: 'Aclaraciones', sources: 'Fuentes', coverage: 'Cobertura y verificación', seeds: 'Fuentes iniciales en inglés', registered: 'Fuentes registradas', candidates: 'Cambios candidatos', reviewedCount: 'Cambios revisados',
    generatedAt: 'Catálogo generado', processed: 'Fuentes usadas para la muestra (parcial)', fetchStatus: 'Estado de recuperación', coverageNote: 'Nota de cobertura', latest: 'Última versión', latestUnavailable: 'Última — sin verificar, no disponible', verifiedAt: 'Verificado el', unavailable: 'No disponible', unknown: 'Desconocido', notProvided: 'No indicado',
    sourceVersion: 'Versión de origen', targetVersion: 'Versión de destino', search: 'Palabra clave o identificador exacto', searchPlaceholder: 'Comando, identificador o palabra clave', platform: 'Plataforma', allPlatforms: 'Todas las plataformas', module: 'Módulo', allModules: 'Todos los módulos', sort: 'Orden', priority: 'Etapa y luego gravedad', release: 'Versión original', reset: 'Restablecer filtros',
    offlineSearch: 'La búsqueda de palabras clave e identificadores se ejecuta localmente, sin modelos. No es una búsqueda semántica.', semanticUnavailable: 'Búsqueda semántica no disponible', semanticReason: 'Motivo',
    preferencesError: 'No se pudieron cargar o guardar las preferencias de idioma y tema. La selección actual sigue aplicada a esta página.',
    versionWarning: 'Elija un destino posterior al origen para ver cambios nuevos atravesados. Las obsolescencias existentes y los umbrales desconocidos siguen visibles.', resultCount: '{count} de {total} cambios', noResults: 'No hay registros coincidentes', noResultsBody: 'La ausencia de resultados no significa una actualización segura. Revise los filtros, la cobertura y las preguntas abiertas.',
    candidate: 'Candidato · sin revisión humana', reviewed: 'Revisado (estado del catálogo)', reviewUnknown: 'Estado de revisión desconocido', generated_candidate: 'Candidato generado', human_reviewed: 'Revisado por una persona', provenance: 'Procedencia del texto', reviewStatus: 'Estado de revisión', stage: 'Etapa', criticality: 'Gravedad', type: 'Tipo', bucket: 'Grupo de versiones', identifiers: 'Identificadores', applicability: 'Aplicabilidad y acción', formats: 'Formatos de aplicación', conditions: 'Condiciones', action: 'Acción', relevance: 'Relevancia para el alcance', evidence: 'Pruebas', sourceEdition: 'Edición de la fuente', sourceLanguage: 'Idioma de la fuente', confidence: 'Confianza', notices: 'Avisos', appliesUntil: 'Antes de la versión de destino', fallback: 'Traducción no disponible; se muestra el texto inglés o del catálogo.', noEvidence: 'No hay pruebas registradas.', sourceId: 'ID de fuente', family: 'Familia', fetchedAt: 'Recuperado el', checksum: 'SHA-256', originalUrl: 'URL registrada', resolvedUrl: 'URL resuelta', excerpt: 'Extracto original de la fuente', noChanges: 'Todavía no hay cambios publicados.',
    clarificationsIntro: 'Las preguntas abiertas y sus conclusiones están separadas de los cambios. Una pregunta resuelta no implica la revisión humana de un cambio.', noClarifications: 'No hay aclaraciones publicadas', noClarificationsBody: 'La ausencia de preguntas registradas no implica que no existan incertidumbres.', disposition: 'Conclusión', relatedChanges: 'IDs de cambios relacionados', issue: 'Incidencia de seguimiento ↗', status: 'Estado',
    sourcesIntro: 'El registro no demuestra una recuperación correcta ni una cobertura completa. Las ediciones de las fuentes y las versiones originales son distintas de los grupos de versiones.', noSources: 'No hay fuentes publicadas', noSourcesBody: 'La cobertura aún no puede evaluarse.',
    loading: 'Cargando el catálogo estático…', loadError: 'No se pudo cargar el catálogo. La cobertura es desconocida; no puede concluirse que sea seguro. Compruebe que ./data/catalog.json está publicado y es válido, y recargue.', invalidCatalog: 'Catálogo no válido o no compatible.', footer: 'Catálogo estático · Sin servidor · Sin llamadas GitHub en ejecución · Sin IA bajo demanda',
    blocking: 'Bloqueante', critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', informational: 'Informativo', restriction: 'Restricción', removed: 'Eliminado', deprecated: 'Obsoleto', deprecation: 'Obsolescencia', introduced: 'Introducido', behavior: 'Comportamiento', syntax: 'Sintaxis', compilation: 'Compilación', runtime: 'Ejecución', deployment: 'Despliegue', testing: 'Pruebas', design: 'Diseño', languageModule: 'Lenguaje', all: 'Todos', binary: 'Binario', project: 'Proyecto', in_scope: 'Dentro del alcance', out_of_scope: 'Fuera del alcance', conditional: 'Condicional', available: 'Disponible', failed: 'Fallido', pending: 'Pendiente', resolved: 'Resuelto', superseded: 'Sustituido', unverified: 'Sin verificar', verified: 'Verificado', missing: 'Ausente', blocked: 'Bloqueado', error: 'Error', fetched: 'Recuperado', partial: 'Parcial', not_attempted: 'No intentado',
  },
  ja: {
    directoryTitle: '移行に関係する変更を探す', versions: 'バージョン', filters: 'フィルター', topics: '分野',
    versionDirection: '現在のバージョンから移行先のバージョンへ', otherTopics: 'その他',
    selectAll: 'すべて選択', unselectAll: 'すべて選択解除',
    selectPlatforms: 'すべてのプラットフォームを選択', unselectPlatforms: 'すべてのプラットフォームの選択を解除',
    selectTopics: 'すべての分野を選択', unselectTopics: 'すべての分野の選択を解除',
    complexity: '対応の難易度', simple: '簡単', moderate: '中程度', complex: '複雑',
    severityDirection: '重大度の高い順。不明は最後。',
    complexityDirection: '対応を実施する難しさ：簡単 → 中程度 → 複雑。不明は最後。',
    complexityBasis: '難易度の根拠',
    summaryCaveat: 'この要約は第三者による確認を受けていません。リンク先の出典で対応内容を確認してください。',
    sourceCaveat: 'この出典は確認できませんでした。対応する前にリンク先で内容を確認してください。',
    evidenceUnavailable: 'この言語または英語の根拠はありません。',
    pathEvidenceUnavailable: 'この移行経路に適用される項目の一部には、対応する版の根拠がありません。後の版の出典を過去の適用状況の確認には使用しません。',
    emptyDirectory: 'バージョンとフィルターを確認してください。結果がなくても移行の問題がないとは限りません。',
    'documentation-release-notes': '現行の公式ドキュメント · リリースノート',
    official_documentation: '公式ドキュメント', documentationChannel: 'ドキュメントの URL 系統',
    'moving-current': '更新される現行版（バージョン指定なし）', versioned: 'バージョン指定版',
    observedVersionLabel: '確認したドキュメントの版表示（最新正式リリースの検証ではありません）',
    unlinkedLocales: '公式ナビゲーションに対応リンクがない言語',
    unlinkedLocalesNote: 'これらの版には対応ページが案内されていません。推測した URL は取得しておらず、HTTP 404 の結果ではありません。ポルトガル語は案内されていますが、このアプリの対象言語外です。',
    siteLanguages: 'このドキュメントサイトが案内している言語',
    manual: 'マニュアル', 'language-reference': 'ランゲージリファレンス', 'design-reference': 'デザインリファレンス',
    'whats-new': '新機能', 'obsolete-deprecated-commands': '旧式・廃止予定のコマンド',
    contentKind: '抽出したページ種別', navigation_index: 'ナビゲーション索引', article: '記事',
    navigationEntries: '抽出した索引ビュー内の項目数', selectedTab: '選択されたタブ（変更の導入時期ではありません）',
    manualParent: 'リンクされている同一版のマニュアル',
    navigationNote: 'この索引ビューのみを抽出しました。リンク先の項目や他のタブを自動取得・カタログ化したわけではありません。',
    urlHistory: '置き換え済みの URL 試行（翻訳の欠落ではありません）', archiveTrace: '確認済みのアーカイブ内リンク経路', upgrade: 'アップグレード',
    actionBasis: '対応の根拠',
    php: 'PHP', printing: '印刷', windows: 'Windows', macos: 'macOS',
    forms: 'フォーム', logging: 'ログ', database: 'データベース', backup: 'バックアップ',
    mail: 'メール', web: 'Web', 'file I/O': 'ファイル入出力', 'plug-ins': 'プラグイン',
    ORDA: 'ORDA', XML: 'XML', '4D Write Pro': '4D Write Pro', '4D View Pro': '4D View Pro',
    JSON: 'JSON', SQL: 'SQL', network: 'ネットワーク', components: 'コンポーネント',
    latestFeature: '最新フィーチャーリリース', latestLts: '最新 LTS リリース', releasedAt: 'リリース日',
    featureChannelNote: 'フィーチャーリリースの公開チャネルです。LTS とは別であり、アカウント限定の修正・ビルドを検証するものではありません。',
    discoveries: '発見された URL（登録済み出典とは別集計）', discoveryNote: '未処理の発見 URL は未取得であり、登録済み出典の取得件数には含まれません。',
    editorialNote: '自動生成された候補の要約、条件、対応、理由は編集上の翻訳であり、公式翻訳ではありません。技術的な識別子と出典の原文は元の表記を保持します。',
    removal: '削除', modernization: 'モダナイゼーション', publisher: '発行者', authority: '出典の権威区分',
    official_documentation_mirror: '公式ドキュメントのミラー', official: '公式', hostOperator: 'ホスト運営者',
    httpStatus: 'HTTP ステータス', fetchError: '取得エラー', checkedAt: '確認日時',
    appTitle: '移行アトラス', poc: '根拠に基づく · 概念実証', skip: '本文へ移動', language: '言語', theme: '表示', system: 'システム設定', light: 'ライト', dark: 'ダーク',
    introLabel: '根拠に基づく変更ディレクトリ', headline: '変更を把握し、不明点を見失わない。', intro: '移行に関する変更を検索し、簡潔な要約と元の出典を確認できます。',
    scopeTitle: '対象：すでに開くか変換できたアプリケーション', scope: '開けない場合や変換に失敗する場合は、4D 公式サポートへお問い合わせください。バイナリからプロジェクトへの変換は前提としていません。このカタログは安全なアップグレードを保証しません。', support: '4D 公式サポート ↗',
    views: '表示切り替え', changes: '変更', clarifications: '確認事項', sources: '出典', coverage: '網羅範囲と検証状況', seeds: '英語の初期出典', registered: '登録済み出典', candidates: '変更候補', reviewedCount: 'レビュー済み変更',
    generatedAt: 'カタログ生成日時', processed: 'サンプルに使用した出典（一部のみ）', fetchStatus: '取得状況', coverageNote: '網羅範囲の注記', latest: '最新版', latestUnavailable: '最新版 — 未検証のため選択不可', verifiedAt: '検証日時', unavailable: '利用不可', unknown: '不明', notProvided: '未記載',
    sourceVersion: '移行元バージョン', targetVersion: '移行先バージョン', search: 'キーワード・正確な識別子', searchPlaceholder: 'コマンド、識別子、キーワード', platform: 'プラットフォーム', allPlatforms: 'すべてのプラットフォーム', module: 'モジュール', allModules: 'すべてのモジュール', sort: '並び順', priority: '工程順・重大度順', release: '元のリリース', reset: '絞り込みをリセット',
    offlineSearch: 'キーワードと識別子の検索はモデルを使わずローカルで実行します。意味検索ではありません。', semanticUnavailable: '意味検索は利用できません', semanticReason: '理由',
    preferencesError: '言語・表示設定を読み込むか保存することができませんでした。現在の選択はこのページに引き続き適用されます。',
    versionWarning: '新たに跨ぐ変更を表示するには、移行元より後の移行先を選択してください。既存の非推奨項目と閾値不明の項目は引き続き表示されます。', resultCount: '{total} 件中 {count} 件', noResults: '該当する記録はありません', noResultsBody: '結果がないことは、安全なアップグレードを意味しません。絞り込み、出典の網羅範囲、未解決の疑問を確認してください。',
    candidate: '候補 · 人によるレビュー未実施', reviewed: 'レビュー済み（カタログの状態）', reviewUnknown: 'レビュー状況不明', generated_candidate: '自動生成された候補', human_reviewed: '人によるレビュー済み', provenance: '文章の来歴', reviewStatus: 'レビュー状況', stage: '工程', criticality: '重大度', type: '種別', bucket: 'バージョン区分', identifiers: '識別子', applicability: '適用条件と対応', formats: 'アプリケーション形式', conditions: '条件', action: '対応', relevance: '対象範囲との関連', evidence: '根拠', sourceEdition: '出典の版', sourceLanguage: '出典の言語', confidence: '確信度', notices: '注意事項', appliesUntil: 'この移行先バージョンより前まで', fallback: '翻訳がありません。英語またはカタログの原文を表示します。', noEvidence: '根拠は記録されていません。', sourceId: '出典 ID', family: '分類', fetchedAt: '取得日時', checksum: 'SHA-256', originalUrl: '登録 URL', resolvedUrl: '解決後の URL', excerpt: '出典の原文抜粋', noChanges: '変更はまだ公開されていません。',
    clarificationsIntro: '未解決の疑問とその判断は、変更項目とは別に管理します。疑問の解決は、変更の人によるレビューを意味しません。', noClarifications: '確認事項は公開されていません', noClarificationsBody: '疑問の記録がないことは、不確実性がないことを意味しません。', disposition: '判断・対応', relatedChanges: '関連する変更 ID', issue: '追跡用 Issue ↗', status: '状態',
    sourcesIntro: '登録済みでも、取得成功や完全な網羅を意味しません。出典の版および元のリリース閾値は、バージョン区分と区別します。', noSources: '出典は公開されていません', noSourcesBody: '網羅範囲はまだ評価できません。',
    loading: '静的カタログを読み込み中…', loadError: 'カタログを読み込めませんでした。網羅範囲は不明であり、安全性は判断できません。./data/catalog.json が公開され、有効であることを確認して再読み込みしてください。', invalidCatalog: '未対応または不正なカタログです。', footer: '静的カタログ · バックエンドなし · 実行時の GitHub 呼び出しなし · オンデマンド AI なし',
    blocking: '移行を阻害', critical: '致命的', high: '高', medium: '中', low: '低', informational: '参考情報', restriction: '制約', removed: '削除', deprecated: '非推奨', deprecation: '非推奨化', introduced: '導入', behavior: '動作', syntax: '構文', compilation: 'コンパイル', runtime: '実行時', deployment: '配布', testing: 'テスト', design: '設計', languageModule: '言語', all: 'すべて', binary: 'バイナリ', project: 'プロジェクト', in_scope: '対象範囲内', out_of_scope: '対象範囲外', conditional: '条件付き', available: '取得可能', failed: '失敗', pending: '未解決', resolved: '解決済み', superseded: '置き換え済み', unverified: '未検証', verified: '検証済み', missing: '未取得', blocked: 'ブロック', error: 'エラー', fetched: '取得済み', partial: '一部のみ', not_attempted: '未試行',
  },
};

export function translate(language, key, variables = {}) {
  const text = translations[language]?.[key] ?? translations.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(variables, name) ? String(variables[name]) : match);
}

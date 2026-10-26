export const LANGUAGES = ['en', 'fr', 'de', 'es', 'ja'];
export const VERSION_BUCKETS = ['v16', 'v17', 'v18', 'v19', 'v20', 'v21', 'latest'];

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

export function isLatestAvailable(latest) {
  return Boolean(latest?.release && latest.status === 'verified' && latest.verified_at &&
    Number.isFinite(Date.parse(latest.verified_at)) && versionNumber(latest.release) !== null);
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

export function crossesVersion(change, source, target, latest = null) {
  const from = versionNumber(source, latest);
  const to = versionNumber(target, latest);
  const threshold = versionNumber(change.threshold?.bucket, latest);
  // Unknown applicability is never silently discarded.
  if (from === null || to === null || threshold === null) return true;
  if (change.type === 'deprecated' || change.type === 'deprecation' || change.threshold?.kind === 'deprecated') {
    return threshold <= to;
  }
  return threshold > from && threshold <= to;
}

export function filterChanges(changes, filters = {}, latest = null) {
  const { source = 'v16', target = 'v21', platform = 'all', module = 'all', query = '', sort = 'priority' } = filters;
  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  return changes.filter(change => {
    if (!crossesVersion(change, source, target, latest)) return false;
    const platforms = change.platforms ?? ['unknown'];
    if (platform !== 'all' && platforms.length && !platforms.some(p => ['all', 'unknown', platform].includes(p))) return false;
    const modules = change.modules ?? ['unknown'];
    if (module !== 'all' && modules.length && !modules.some(m => ['all', 'unknown', module].includes(m))) return false;
    const searchable = [
      change.id, ...(change.identifiers ?? []), change.action, change.threshold?.exact,
      ...Object.values(change.localizations ?? {}).flatMap(l => [l.one_line, l.paragraph]),
      ...(change.evidence ?? []).flatMap(e => [e.heading, e.excerpt]),
    ].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => searchable.includes(term));
  }).sort((a, b) => {
    const versionOrder = (versionNumber(a.threshold?.bucket, latest) ?? Infinity) - (versionNumber(b.threshold?.bucket, latest) ?? Infinity);
    return (sort === 'version' ? versionOrder || 0 : stagePriorityForChange(a) - stagePriorityForChange(b) ||
      priorityForChange(a) - priorityForChange(b)) ||
      String(a.id).localeCompare(String(b.id));
  });
}

export function validateChecklist(value) {
  if (!value || Array.isArray(value) || value.schema_version !== 1 || !value.items ||
      typeof value.items !== 'object' || Array.isArray(value.items)) throw new Error('invalidImport');
  const items = Object.create(null);
  if (Object.keys(value.items).length > 20000) throw new Error('invalidImport');
  for (const [id, item] of Object.entries(value.items)) {
    if (!id || id.length > 300 || !item || Array.isArray(item) || typeof item.checked !== 'boolean' ||
        typeof item.effort !== 'string' || item.effort.length > 10000) throw new Error('invalidImport');
    items[id] = { checked: item.checked, effort: item.effort };
  }
  return items;
}

export function validateCatalog(data) {
  if (!data || data.schema_version !== 1 || !Array.isArray(data.changes) || !Array.isArray(data.sources) ||
      !data.coverage || !data.latest || !data.semantic_search ||
      (data.clarifications !== undefined && !Array.isArray(data.clarifications))) throw new Error('invalidCatalog');
  const ids = new Set();
  for (const change of data.changes) {
    if (!change || typeof change.id !== 'string' || !change.id || ids.has(change.id) ||
        !change.threshold || !change.localizations || typeof change.localizations !== 'object' ||
        Array.isArray(change.localizations) ||
        ['platforms', 'modules', 'identifiers', 'evidence', 'notices'].some(key =>
          change[key] !== undefined && !Array.isArray(change[key]))) throw new Error('invalidCatalog');
    ids.add(change.id);
  }
  if (data.sources.some(source => !source || typeof source.id !== 'string') ||
      (data.clarifications ?? []).some(entry => !entry || typeof entry !== 'object')) throw new Error('invalidCatalog');
  return data;
}

export const translations = {
  en: {
    actionBasis: 'Basis for action (source/editorial metadata)',
    php: 'PHP', printing: 'Printing', windows: 'Windows', macos: 'macOS',
    latestFeature: 'Latest feature release', latestLts: 'Latest LTS release', releasedAt: 'Released on',
    featureChannelNote: 'Feature-release channel, not LTS or account-only hotfix/build verification.',
    discoveries: 'Discovered URLs (separate from registered sources)', discoveryNote: 'Pending discoveries have not been retrieved or included in registered-source retrieval totals.',
    editorialNote: 'Generated candidate summaries and translations are not official translations. Structured conditions and actions are source/editorial metadata and may remain in English.',
    removal: 'Removal', modernization: 'Modernization', publisher: 'Publisher', authority: 'Source authority',
    official_documentation_mirror: 'Official documentation mirror', official: 'Official', hostOperator: 'Host operator',
    httpStatus: 'HTTP status', fetchError: 'Retrieval error', checkedAt: 'Checked at',
    appTitle: 'Migration Atlas', poc: 'Evidence-led · Proof of concept', skip: 'Skip to content', language: 'Language', theme: 'Appearance', system: 'System', light: 'Light', dark: 'Dark',
    introLabel: 'PLAN WITH EVIDENCE', headline: 'Know what changes. Keep the unknowns in view.', intro: 'Explore migration candidates, inspect their sources, and build a checklist that stays in your browser.',
    scopeTitle: 'Scope: an application already opened or converted', scope: 'Opening or conversion failures belong with official 4D support. A binary-to-project conversion is not assumed. This catalogue is not a guarantee of upgrade safety.', support: 'Official 4D support ↗',
    views: 'Views', changes: 'Changes', clarifications: 'Clarifications', sources: 'Sources', coverage: 'Coverage & verification', seeds: 'English seed sources', registered: 'Registered sources', candidates: 'Candidate changes', reviewedCount: 'Reviewed changes',
    generatedAt: 'Catalogue generated', processed: 'Sources used for sample (partial)', fetchStatus: 'Retrieval status', coverageNote: 'Coverage note', latest: 'Latest', latestUnavailable: 'Latest — unverified, unavailable', verifiedAt: 'Verified at', unavailable: 'Unavailable', unknown: 'Unknown', notProvided: 'Not provided',
    sourceVersion: 'From version', targetVersion: 'To version', search: 'Keyword or exact identifier', searchPlaceholder: 'Command, identifier, or keyword', platform: 'Platform', allPlatforms: 'All platforms', module: 'Module', allModules: 'All modules', sort: 'Sort', priority: 'Stage, then severity', release: 'Original release', reset: 'Reset filters',
    offlineSearch: 'Keyword and identifier matching runs locally, without models. This is not semantic search.', semanticUnavailable: 'Semantic search unavailable', semanticReason: 'Reason',
    checklist: 'Local checklist', localOnly: 'Stored only in this browser. Export a backup; clearing browser data removes it. Effort is your own estimate, independent of severity or stage.', export: 'Export JSON', import: 'Import JSON', complete: 'Marked complete', effort: 'Your effort estimate / notes', saved: 'Checklist saved locally.', storageError: 'Browser storage is unavailable or full. Changes remain in memory; export a backup before leaving.', exported: 'Checklist exported.', imported: 'Checklist imported and merged by stable ID.', invalidImport: 'Invalid checklist JSON. Expected schema_version: 1 and items keyed by ID, each with checked (boolean) and effort (text). Existing entries have not changed.', importReadError: 'Could not read the file. Existing entries have not changed.', importTooLarge: 'The file exceeds 2 MB. Existing entries have not changed.',
    versionWarning: 'Choose a target later than the source to see newly crossed changes. Existing deprecations and unknown thresholds remain visible.', resultCount: '{count} of {total} changes', noResults: 'No matching records', noResultsBody: 'No results does not mean a safe upgrade. Check your filters, source coverage, and unresolved questions.',
    candidate: 'Candidate · not human-reviewed', reviewed: 'Reviewed (catalogue status)', reviewUnknown: 'Review status unknown', generated_candidate: 'Generated candidate', human_reviewed: 'Human-reviewed', provenance: 'Text provenance', reviewStatus: 'Review status', stage: 'Stage', criticality: 'Severity', type: 'Type', bucket: 'Version bucket', identifiers: 'Identifiers', applicability: 'Applicability & action', formats: 'Application formats', conditions: 'Conditions', action: 'Action', relevance: 'Scope relevance', evidence: 'Evidence', sourceEdition: 'Source edition', sourceLanguage: 'Source language', confidence: 'Confidence', notices: 'Notices', appliesUntil: 'Applies until', fallback: 'Translation unavailable; showing English or catalogue text.', noEvidence: 'No evidence recorded.', sourceId: 'Source ID', family: 'Family', fetchedAt: 'Retrieved at', checksum: 'SHA-256', originalUrl: 'Registered URL', resolvedUrl: 'Resolved URL', excerpt: 'Original source excerpt', noChanges: 'No changes published yet.',
    clarificationsIntro: 'Open questions and documented dispositions are separate from migration changes. A resolved question does not imply human review of a change.', noClarifications: 'No clarifications published', noClarificationsBody: 'No recorded questions does not mean there are no uncertainties.', disposition: 'Disposition', relatedChanges: 'Related change IDs', issue: 'Tracking issue ↗', status: 'Status',
    sourcesIntro: 'Registration is not proof of successful retrieval or complete coverage. Source editions and original release thresholds are distinct from version buckets.', noSources: 'No sources published', noSourcesBody: 'Coverage cannot yet be assessed.',
    loading: 'Loading the static catalogue…', loadError: 'The catalogue could not be loaded. Coverage is unknown; no safety conclusion can be drawn. Check that ./data/catalog.json is published and valid, then reload.', invalidCatalog: 'Unsupported or invalid catalogue.', footer: 'Static catalogue · No backend · No runtime GitHub calls · No on-demand AI',
    blocking: 'Blocking', critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', informational: 'Informational', restriction: 'Restriction', removed: 'Removed', deprecated: 'Deprecated', deprecation: 'Deprecation', introduced: 'Introduced', behavior: 'Behavior', syntax: 'Syntax', compilation: 'Compilation', runtime: 'Runtime', deployment: 'Deployment', testing: 'Testing', design: 'Design', languageModule: 'Language', all: 'All', binary: 'Binary', project: 'Project', in_scope: 'In scope', out_of_scope: 'Out of scope', conditional: 'Conditional', available: 'Available', failed: 'Failed', pending: 'Pending', resolved: 'Resolved', superseded: 'Superseded', unverified: 'Unverified', verified: 'Verified', missing: 'Missing', blocked: 'Blocked', error: 'Error', fetched: 'Retrieved', partial: 'Partial', not_attempted: 'Not attempted',
  },
  fr: {
    actionBasis: 'Fondement de l’action (métadonnées de source/éditoriales)',
    php: 'PHP', printing: 'Impression', windows: 'Windows', macos: 'macOS',
    latestFeature: 'Dernière version évolutive', latestLts: 'Dernière version LTS', releasedAt: 'Publié le',
    featureChannelNote: 'Canal des versions évolutives, distinct du LTS et sans vérification des correctifs/builds réservés aux comptes.',
    discoveries: 'URL découvertes (distinctes des sources enregistrées)', discoveryNote: 'Les découvertes en attente ne sont ni récupérées ni incluses dans les totaux de récupération des sources enregistrées.',
    editorialNote: 'Les résumés et traductions des candidats générés ne sont pas des traductions officielles. Les conditions et actions structurées sont des métadonnées de source ou éditoriales et peuvent rester en anglais.',
    removal: 'Suppression', modernization: 'Modernisation', publisher: 'Éditeur', authority: 'Autorité de la source',
    official_documentation_mirror: 'Miroir de documentation officielle', official: 'Officiel', hostOperator: 'Opérateur de l’hôte',
    httpStatus: 'État HTTP', fetchError: 'Erreur de récupération', checkedAt: 'Contrôlé le',
    appTitle: 'Atlas de migration', poc: 'Fondé sur les preuves · Prototype', skip: 'Aller au contenu', language: 'Langue', theme: 'Apparence', system: 'Système', light: 'Clair', dark: 'Sombre',
    introLabel: 'PLANIFIER AVEC DES PREUVES', headline: 'Comprendre les changements. Garder les inconnues en vue.', intro: 'Explorez les changements candidats, consultez leurs sources et créez une liste conservée dans votre navigateur.',
    scopeTitle: 'Périmètre : application déjà ouverte ou convertie', scope: 'Les échecs d’ouverture ou de conversion relèvent du support officiel 4D. Une conversion binaire vers projet n’est pas présumée. Ce catalogue ne garantit pas une migration sans risque.', support: 'Support officiel 4D ↗',
    views: 'Vues', changes: 'Changements', clarifications: 'Clarifications', sources: 'Sources', coverage: 'Couverture et vérification', seeds: 'Sources initiales anglaises', registered: 'Sources enregistrées', candidates: 'Changements candidats', reviewedCount: 'Changements revus',
    generatedAt: 'Catalogue généré le', processed: 'Sources utilisées pour l’échantillon (partiel)', fetchStatus: 'État de récupération', coverageNote: 'Note de couverture', latest: 'Dernière version', latestUnavailable: 'Dernière version — non vérifiée, indisponible', verifiedAt: 'Vérifié le', unavailable: 'Indisponible', unknown: 'Inconnu', notProvided: 'Non renseigné',
    sourceVersion: 'Version de départ', targetVersion: 'Version cible', search: 'Mot-clé ou identifiant exact', searchPlaceholder: 'Commande, identifiant ou mot-clé', platform: 'Plateforme', allPlatforms: 'Toutes les plateformes', module: 'Module', allModules: 'Tous les modules', sort: 'Tri', priority: 'Étape, puis gravité', release: 'Version d’origine', reset: 'Réinitialiser les filtres',
    offlineSearch: 'La recherche par mots-clés et identifiants s’effectue localement, sans modèle. Ce n’est pas une recherche sémantique.', semanticUnavailable: 'Recherche sémantique indisponible', semanticReason: 'Motif',
    checklist: 'Liste locale', localOnly: 'Conservée uniquement dans ce navigateur. Exportez une sauvegarde ; effacer les données du navigateur la supprime. L’effort est votre estimation, indépendante de la gravité et de l’étape.', export: 'Exporter JSON', import: 'Importer JSON', complete: 'Marquer comme terminé', effort: 'Votre estimation d’effort / notes', saved: 'Liste enregistrée localement.', storageError: 'Stockage du navigateur indisponible ou plein. Les modifications restent en mémoire ; exportez avant de partir.', exported: 'Liste exportée.', imported: 'Liste importée et fusionnée par identifiant stable.', invalidImport: 'JSON de liste invalide. Format attendu : schema_version: 1 et items par identifiant avec checked (booléen) et effort (texte). Les entrées existantes sont inchangées.', importReadError: 'Lecture du fichier impossible. Les entrées existantes sont inchangées.', importTooLarge: 'Le fichier dépasse 2 Mo. Les entrées existantes sont inchangées.',
    versionWarning: 'Choisissez une cible postérieure à la source pour voir les nouveaux changements traversés. Les dépréciations existantes et les seuils inconnus restent visibles.', resultCount: '{count} changements sur {total}', noResults: 'Aucun résultat', noResultsBody: 'L’absence de résultats ne signifie pas une migration sans risque. Vérifiez les filtres, la couverture et les questions ouvertes.',
    candidate: 'Candidat · sans revue humaine', reviewed: 'Revu (état du catalogue)', reviewUnknown: 'État de revue inconnu', generated_candidate: 'Candidat généré', human_reviewed: 'Revu par un humain', provenance: 'Provenance du texte', reviewStatus: 'État de revue', stage: 'Étape', criticality: 'Gravité', type: 'Type', bucket: 'Groupe de versions', identifiers: 'Identifiants', applicability: 'Applicabilité et action', formats: 'Formats d’application', conditions: 'Conditions', action: 'Action', relevance: 'Pertinence pour le périmètre', evidence: 'Preuves', sourceEdition: 'Édition source', sourceLanguage: 'Langue source', confidence: 'Confiance', notices: 'Avertissements', appliesUntil: 'Applicable jusqu’à', fallback: 'Traduction indisponible ; texte anglais ou du catalogue affiché.', noEvidence: 'Aucune preuve enregistrée.', sourceId: 'Identifiant source', family: 'Famille', fetchedAt: 'Récupéré le', checksum: 'SHA-256', originalUrl: 'URL enregistrée', resolvedUrl: 'URL résolue', excerpt: 'Extrait original de la source', noChanges: 'Aucun changement publié.',
    clarificationsIntro: 'Les questions ouvertes et leurs conclusions sont séparées des changements. Une question résolue n’implique pas de revue humaine d’un changement.', noClarifications: 'Aucune clarification publiée', noClarificationsBody: 'L’absence de questions enregistrées ne signifie pas l’absence d’incertitudes.', disposition: 'Conclusion', relatedChanges: 'Identifiants des changements liés', issue: 'Ticket de suivi ↗', status: 'État',
    sourcesIntro: 'L’enregistrement ne prouve ni une récupération réussie ni une couverture complète. Les éditions sources et versions d’origine sont distinctes des groupes de versions.', noSources: 'Aucune source publiée', noSourcesBody: 'La couverture ne peut pas encore être évaluée.',
    loading: 'Chargement du catalogue statique…', loadError: 'Impossible de charger le catalogue. La couverture est inconnue ; aucune conclusion de sécurité n’est possible. Vérifiez la publication et la validité de ./data/catalog.json, puis rechargez.', invalidCatalog: 'Catalogue invalide ou non pris en charge.', footer: 'Catalogue statique · Sans serveur · Sans appel GitHub à l’exécution · Sans IA à la demande',
    blocking: 'Bloquant', critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible', informational: 'Informatif', restriction: 'Restriction', removed: 'Supprimé', deprecated: 'Déprécié', deprecation: 'Dépréciation', introduced: 'Introduit', behavior: 'Comportement', syntax: 'Syntaxe', compilation: 'Compilation', runtime: 'Exécution', deployment: 'Déploiement', testing: 'Tests', design: 'Conception', languageModule: 'Langage', all: 'Tous', binary: 'Binaire', project: 'Projet', in_scope: 'Dans le périmètre', out_of_scope: 'Hors périmètre', conditional: 'Conditionnel', available: 'Disponible', failed: 'Échec', pending: 'En attente', resolved: 'Résolu', superseded: 'Remplacé', unverified: 'Non vérifié', verified: 'Vérifié', missing: 'Manquant', blocked: 'Bloqué', error: 'Erreur', fetched: 'Récupéré', partial: 'Partiel', not_attempted: 'Non tenté',
  },
  de: {
    actionBasis: 'Grundlage der Maßnahme (Quellen-/Redaktionsmetadaten)',
    php: 'PHP', printing: 'Drucken', windows: 'Windows', macos: 'macOS',
    latestFeature: 'Neueste Feature-Version', latestLts: 'Neueste LTS-Version', releasedAt: 'Veröffentlicht am',
    featureChannelNote: 'Feature-Versionskanal, nicht LTS; keine Prüfung kontogebundener Hotfixes/Builds.',
    discoveries: 'Entdeckte URLs (getrennt von registrierten Quellen)', discoveryNote: 'Ausstehende Entdeckungen wurden noch nicht abgerufen und sind nicht in den Abrufzahlen registrierter Quellen enthalten.',
    editorialNote: 'Generierte Kandidatenzusammenfassungen und Übersetzungen sind keine offiziellen Übersetzungen. Strukturierte Bedingungen und Maßnahmen sind Quellen-/Redaktionsmetadaten und können auf Englisch bleiben.',
    removal: 'Entfernung', modernization: 'Modernisierung', publisher: 'Herausgeber', authority: 'Quellenautorität',
    official_documentation_mirror: 'Spiegel offizieller Dokumentation', official: 'Offiziell', hostOperator: 'Hostbetreiber',
    httpStatus: 'HTTP-Status', fetchError: 'Abruffehler', checkedAt: 'Geprüft am',
    appTitle: 'Migrationsatlas', poc: 'Belegbasiert · Machbarkeitsstudie', skip: 'Zum Inhalt', language: 'Sprache', theme: 'Darstellung', system: 'System', light: 'Hell', dark: 'Dunkel',
    introLabel: 'MIT BELEGEN PLANEN', headline: 'Änderungen verstehen. Unbekanntes im Blick behalten.', intro: 'Prüfen Sie Änderungskandidaten und ihre Quellen. Erstellen Sie eine Checkliste, die in Ihrem Browser bleibt.',
    scopeTitle: 'Umfang: eine bereits geöffnete oder konvertierte Anwendung', scope: 'Bei Öffnungs- oder Konvertierungsfehlern hilft der offizielle 4D-Support. Eine Konvertierung von Binär zu Projekt wird nicht vorausgesetzt. Dieser Katalog garantiert kein sicheres Upgrade.', support: 'Offizieller 4D-Support ↗',
    views: 'Ansichten', changes: 'Änderungen', clarifications: 'Klärungen', sources: 'Quellen', coverage: 'Abdeckung und Verifizierung', seeds: 'Englische Ausgangsquellen', registered: 'Registrierte Quellen', candidates: 'Änderungskandidaten', reviewedCount: 'Geprüfte Änderungen',
    generatedAt: 'Katalog erstellt', processed: 'Für die Stichprobe verwendete Quellen (teilweise)', fetchStatus: 'Abrufstatus', coverageNote: 'Hinweis zur Abdeckung', latest: 'Neueste Version', latestUnavailable: 'Neueste — ungeprüft, nicht verfügbar', verifiedAt: 'Verifiziert am', unavailable: 'Nicht verfügbar', unknown: 'Unbekannt', notProvided: 'Nicht angegeben',
    sourceVersion: 'Ausgangsversion', targetVersion: 'Zielversion', search: 'Stichwort oder genaue Kennung', searchPlaceholder: 'Befehl, Kennung oder Stichwort', platform: 'Plattform', allPlatforms: 'Alle Plattformen', module: 'Modul', allModules: 'Alle Module', sort: 'Sortierung', priority: 'Phase, dann Schweregrad', release: 'Ursprüngliche Version', reset: 'Filter zurücksetzen',
    offlineSearch: 'Stichwort- und Kennungssuche erfolgen lokal, ohne Modelle. Dies ist keine semantische Suche.', semanticUnavailable: 'Semantische Suche nicht verfügbar', semanticReason: 'Grund',
    checklist: 'Lokale Checkliste', localOnly: 'Nur in diesem Browser gespeichert. Exportieren Sie eine Sicherung; beim Löschen der Browserdaten geht sie verloren. Aufwand ist Ihre Schätzung, unabhängig von Schweregrad und Phase.', export: 'JSON exportieren', import: 'JSON importieren', complete: 'Als erledigt markieren', effort: 'Ihre Aufwandsschätzung / Notizen', saved: 'Checkliste lokal gespeichert.', storageError: 'Browserspeicher nicht verfügbar oder voll. Änderungen bleiben im Arbeitsspeicher; vor dem Verlassen exportieren.', exported: 'Checkliste exportiert.', imported: 'Checkliste importiert und nach stabiler ID zusammengeführt.', invalidImport: 'Ungültiges Checklisten-JSON. Erwartet: schema_version: 1 und items nach ID, jeweils mit checked (boolesch) und effort (Text). Bestehende Einträge wurden nicht verändert.', importReadError: 'Datei konnte nicht gelesen werden. Bestehende Einträge wurden nicht verändert.', importTooLarge: 'Die Datei ist größer als 2 MB. Bestehende Einträge wurden nicht verändert.',
    versionWarning: 'Wählen Sie eine Zielversion nach der Ausgangsversion, um neu überschrittene Änderungen zu sehen. Bestehende Abkündigungen und unbekannte Schwellen bleiben sichtbar.', resultCount: '{count} von {total} Änderungen', noResults: 'Keine passenden Einträge', noResultsBody: 'Keine Ergebnisse bedeuten kein sicheres Upgrade. Prüfen Sie Filter, Quellenabdeckung und offene Fragen.',
    candidate: 'Kandidat · nicht menschlich geprüft', reviewed: 'Geprüft (Katalogstatus)', reviewUnknown: 'Prüfstatus unbekannt', generated_candidate: 'Generierter Kandidat', human_reviewed: 'Menschlich geprüft', provenance: 'Textherkunft', reviewStatus: 'Prüfstatus', stage: 'Phase', criticality: 'Schweregrad', type: 'Typ', bucket: 'Versionsgruppe', identifiers: 'Kennungen', applicability: 'Anwendbarkeit und Maßnahme', formats: 'Anwendungsformate', conditions: 'Bedingungen', action: 'Maßnahme', relevance: 'Umfangsrelevanz', evidence: 'Belege', sourceEdition: 'Quellausgabe', sourceLanguage: 'Quellsprache', confidence: 'Vertrauen', notices: 'Hinweise', appliesUntil: 'Gilt bis', fallback: 'Übersetzung nicht verfügbar; englischer oder Katalogtext wird angezeigt.', noEvidence: 'Keine Belege erfasst.', sourceId: 'Quellen-ID', family: 'Familie', fetchedAt: 'Abgerufen am', checksum: 'SHA-256', originalUrl: 'Registrierte URL', resolvedUrl: 'Aufgelöste URL', excerpt: 'Originalquellenauszug', noChanges: 'Noch keine Änderungen veröffentlicht.',
    clarificationsIntro: 'Offene Fragen und dokumentierte Entscheidungen sind von Änderungen getrennt. Eine geklärte Frage bedeutet keine menschliche Prüfung einer Änderung.', noClarifications: 'Keine Klärungen veröffentlicht', noClarificationsBody: 'Keine erfassten Fragen bedeuten nicht, dass keine Unsicherheiten bestehen.', disposition: 'Entscheidung', relatedChanges: 'Verknüpfte Änderungs-IDs', issue: 'Nachverfolgung ↗', status: 'Status',
    sourcesIntro: 'Registrierung belegt weder erfolgreichen Abruf noch vollständige Abdeckung. Quellausgaben und ursprüngliche Versionsschwellen sind von Versionsgruppen zu unterscheiden.', noSources: 'Keine Quellen veröffentlicht', noSourcesBody: 'Die Abdeckung kann noch nicht bewertet werden.',
    loading: 'Statischer Katalog wird geladen…', loadError: 'Katalog konnte nicht geladen werden. Die Abdeckung ist unbekannt; eine Sicherheitsbewertung ist nicht möglich. Prüfen Sie, ob ./data/catalog.json veröffentlicht und gültig ist, und laden Sie neu.', invalidCatalog: 'Nicht unterstützter oder ungültiger Katalog.', footer: 'Statischer Katalog · Kein Backend · Keine GitHub-Aufrufe zur Laufzeit · Keine KI auf Abruf',
    blocking: 'Blockierend', critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig', informational: 'Informativ', restriction: 'Einschränkung', removed: 'Entfernt', deprecated: 'Abgekündigt', deprecation: 'Abkündigung', introduced: 'Eingeführt', behavior: 'Verhalten', syntax: 'Syntax', compilation: 'Kompilierung', runtime: 'Laufzeit', deployment: 'Bereitstellung', testing: 'Tests', design: 'Entwurf', languageModule: 'Sprache', all: 'Alle', binary: 'Binär', project: 'Projekt', in_scope: 'Im Umfang', out_of_scope: 'Außerhalb des Umfangs', conditional: 'Bedingt', available: 'Verfügbar', failed: 'Fehlgeschlagen', pending: 'Ausstehend', resolved: 'Geklärt', superseded: 'Ersetzt', unverified: 'Unverifiziert', verified: 'Verifiziert', missing: 'Fehlend', blocked: 'Blockiert', error: 'Fehler', fetched: 'Abgerufen', partial: 'Teilweise', not_attempted: 'Nicht versucht',
  },
  es: {
    actionBasis: 'Fundamento de la acción (metadatos de fuente/editoriales)',
    php: 'PHP', printing: 'Impresión', windows: 'Windows', macos: 'macOS',
    latestFeature: 'Última versión de funciones', latestLts: 'Última versión LTS', releasedAt: 'Publicado el',
    featureChannelNote: 'Canal de versiones de funciones, no LTS ni verificación de correcciones/compilaciones exclusivas de cuentas.',
    discoveries: 'URL descubiertas (separadas de las fuentes registradas)', discoveryNote: 'Los descubrimientos pendientes no se han recuperado ni se incluyen en los totales de recuperación de fuentes registradas.',
    editorialNote: 'Los resúmenes y traducciones de candidatos generados no son traducciones oficiales. Las condiciones y acciones estructuradas son metadatos de fuente/editoriales y pueden permanecer en inglés.',
    removal: 'Eliminación', modernization: 'Modernización', publisher: 'Editor', authority: 'Autoridad de la fuente',
    official_documentation_mirror: 'Espejo de documentación oficial', official: 'Oficial', hostOperator: 'Operador del alojamiento',
    httpStatus: 'Estado HTTP', fetchError: 'Error de recuperación', checkedAt: 'Comprobado el',
    appTitle: 'Atlas de migración', poc: 'Basado en pruebas · Prototipo', skip: 'Ir al contenido', language: 'Idioma', theme: 'Apariencia', system: 'Sistema', light: 'Claro', dark: 'Oscuro',
    introLabel: 'PLANIFICAR CON PRUEBAS', headline: 'Conozca los cambios. Mantenga visibles las incógnitas.', intro: 'Explore cambios candidatos, consulte sus fuentes y cree una lista que permanezca en su navegador.',
    scopeTitle: 'Alcance: una aplicación ya abierta o convertida', scope: 'Los fallos de apertura o conversión corresponden al soporte oficial de 4D. No se presupone una conversión de binario a proyecto. Este catálogo no garantiza una actualización segura.', support: 'Soporte oficial de 4D ↗',
    views: 'Vistas', changes: 'Cambios', clarifications: 'Aclaraciones', sources: 'Fuentes', coverage: 'Cobertura y verificación', seeds: 'Fuentes iniciales en inglés', registered: 'Fuentes registradas', candidates: 'Cambios candidatos', reviewedCount: 'Cambios revisados',
    generatedAt: 'Catálogo generado', processed: 'Fuentes usadas para la muestra (parcial)', fetchStatus: 'Estado de recuperación', coverageNote: 'Nota de cobertura', latest: 'Última versión', latestUnavailable: 'Última — sin verificar, no disponible', verifiedAt: 'Verificado el', unavailable: 'No disponible', unknown: 'Desconocido', notProvided: 'No indicado',
    sourceVersion: 'Versión de origen', targetVersion: 'Versión de destino', search: 'Palabra clave o identificador exacto', searchPlaceholder: 'Comando, identificador o palabra clave', platform: 'Plataforma', allPlatforms: 'Todas las plataformas', module: 'Módulo', allModules: 'Todos los módulos', sort: 'Orden', priority: 'Etapa y luego gravedad', release: 'Versión original', reset: 'Restablecer filtros',
    offlineSearch: 'La búsqueda de palabras clave e identificadores se ejecuta localmente, sin modelos. No es una búsqueda semántica.', semanticUnavailable: 'Búsqueda semántica no disponible', semanticReason: 'Motivo',
    checklist: 'Lista local', localOnly: 'Guardada solo en este navegador. Exporte una copia; borrar los datos del navegador la elimina. El esfuerzo es su estimación, independiente de la gravedad y de la etapa.', export: 'Exportar JSON', import: 'Importar JSON', complete: 'Marcar como completado', effort: 'Su estimación de esfuerzo / notas', saved: 'Lista guardada localmente.', storageError: 'El almacenamiento del navegador no está disponible o está lleno. Los cambios siguen en memoria; exporte antes de salir.', exported: 'Lista exportada.', imported: 'Lista importada y combinada por ID estable.', invalidImport: 'JSON de lista no válido. Se espera schema_version: 1 e items por ID, con checked (booleano) y effort (texto). Las entradas existentes no han cambiado.', importReadError: 'No se pudo leer el archivo. Las entradas existentes no han cambiado.', importTooLarge: 'El archivo supera los 2 MB. Las entradas existentes no han cambiado.',
    versionWarning: 'Elija un destino posterior al origen para ver cambios nuevos atravesados. Las obsolescencias existentes y los umbrales desconocidos siguen visibles.', resultCount: '{count} de {total} cambios', noResults: 'No hay registros coincidentes', noResultsBody: 'La ausencia de resultados no significa una actualización segura. Revise los filtros, la cobertura y las preguntas abiertas.',
    candidate: 'Candidato · sin revisión humana', reviewed: 'Revisado (estado del catálogo)', reviewUnknown: 'Estado de revisión desconocido', generated_candidate: 'Candidato generado', human_reviewed: 'Revisado por una persona', provenance: 'Procedencia del texto', reviewStatus: 'Estado de revisión', stage: 'Etapa', criticality: 'Gravedad', type: 'Tipo', bucket: 'Grupo de versiones', identifiers: 'Identificadores', applicability: 'Aplicabilidad y acción', formats: 'Formatos de aplicación', conditions: 'Condiciones', action: 'Acción', relevance: 'Relevancia para el alcance', evidence: 'Pruebas', sourceEdition: 'Edición de la fuente', sourceLanguage: 'Idioma de la fuente', confidence: 'Confianza', notices: 'Avisos', appliesUntil: 'Se aplica hasta', fallback: 'Traducción no disponible; se muestra el texto inglés o del catálogo.', noEvidence: 'No hay pruebas registradas.', sourceId: 'ID de fuente', family: 'Familia', fetchedAt: 'Recuperado el', checksum: 'SHA-256', originalUrl: 'URL registrada', resolvedUrl: 'URL resuelta', excerpt: 'Extracto original de la fuente', noChanges: 'Todavía no hay cambios publicados.',
    clarificationsIntro: 'Las preguntas abiertas y sus conclusiones están separadas de los cambios. Una pregunta resuelta no implica la revisión humana de un cambio.', noClarifications: 'No hay aclaraciones publicadas', noClarificationsBody: 'La ausencia de preguntas registradas no implica que no existan incertidumbres.', disposition: 'Conclusión', relatedChanges: 'IDs de cambios relacionados', issue: 'Incidencia de seguimiento ↗', status: 'Estado',
    sourcesIntro: 'El registro no demuestra una recuperación correcta ni una cobertura completa. Las ediciones de las fuentes y las versiones originales son distintas de los grupos de versiones.', noSources: 'No hay fuentes publicadas', noSourcesBody: 'La cobertura aún no puede evaluarse.',
    loading: 'Cargando el catálogo estático…', loadError: 'No se pudo cargar el catálogo. La cobertura es desconocida; no puede concluirse que sea seguro. Compruebe que ./data/catalog.json está publicado y es válido, y recargue.', invalidCatalog: 'Catálogo no válido o no compatible.', footer: 'Catálogo estático · Sin servidor · Sin llamadas GitHub en ejecución · Sin IA bajo demanda',
    blocking: 'Bloqueante', critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', informational: 'Informativo', restriction: 'Restricción', removed: 'Eliminado', deprecated: 'Obsoleto', deprecation: 'Obsolescencia', introduced: 'Introducido', behavior: 'Comportamiento', syntax: 'Sintaxis', compilation: 'Compilación', runtime: 'Ejecución', deployment: 'Despliegue', testing: 'Pruebas', design: 'Diseño', languageModule: 'Lenguaje', all: 'Todos', binary: 'Binario', project: 'Proyecto', in_scope: 'Dentro del alcance', out_of_scope: 'Fuera del alcance', conditional: 'Condicional', available: 'Disponible', failed: 'Fallido', pending: 'Pendiente', resolved: 'Resuelto', superseded: 'Sustituido', unverified: 'Sin verificar', verified: 'Verificado', missing: 'Ausente', blocked: 'Bloqueado', error: 'Error', fetched: 'Recuperado', partial: 'Parcial', not_attempted: 'No intentado',
  },
  ja: {
    actionBasis: '対応の根拠（出典・編集メタデータ）',
    php: 'PHP', printing: '印刷', windows: 'Windows', macos: 'macOS',
    latestFeature: '最新フィーチャーリリース', latestLts: '最新 LTS リリース', releasedAt: 'リリース日',
    featureChannelNote: 'フィーチャーリリースの公開チャネルです。LTS とは別であり、アカウント限定の修正・ビルドを検証するものではありません。',
    discoveries: '発見された URL（登録済み出典とは別集計）', discoveryNote: '未処理の発見 URL は未取得であり、登録済み出典の取得件数には含まれません。',
    editorialNote: '自動生成された候補の要約・翻訳は公式翻訳ではありません。構造化された条件や対応は出典・編集メタデータであり、英語のままの場合があります。',
    removal: '削除', modernization: 'モダナイゼーション', publisher: '発行者', authority: '出典の権威区分',
    official_documentation_mirror: '公式ドキュメントのミラー', official: '公式', hostOperator: 'ホスト運営者',
    httpStatus: 'HTTP ステータス', fetchError: '取得エラー', checkedAt: '確認日時',
    appTitle: '移行アトラス', poc: '根拠に基づく · 概念実証', skip: '本文へ移動', language: '言語', theme: '表示', system: 'システム設定', light: 'ライト', dark: 'ダーク',
    introLabel: '根拠に基づく移行計画', headline: '変更を把握し、不明点を見失わない。', intro: '変更候補と出典を確認し、ブラウザー内に保存されるチェックリストを作成できます。',
    scopeTitle: '対象：すでに開くか変換できたアプリケーション', scope: '開けない場合や変換に失敗する場合は、4D 公式サポートへお問い合わせください。バイナリからプロジェクトへの変換は前提としていません。このカタログは安全なアップグレードを保証しません。', support: '4D 公式サポート ↗',
    views: '表示切り替え', changes: '変更', clarifications: '確認事項', sources: '出典', coverage: '網羅範囲と検証状況', seeds: '英語の初期出典', registered: '登録済み出典', candidates: '変更候補', reviewedCount: 'レビュー済み変更',
    generatedAt: 'カタログ生成日時', processed: 'サンプルに使用した出典（一部のみ）', fetchStatus: '取得状況', coverageNote: '網羅範囲の注記', latest: '最新版', latestUnavailable: '最新版 — 未検証のため選択不可', verifiedAt: '検証日時', unavailable: '利用不可', unknown: '不明', notProvided: '未記載',
    sourceVersion: '移行元バージョン', targetVersion: '移行先バージョン', search: 'キーワード・正確な識別子', searchPlaceholder: 'コマンド、識別子、キーワード', platform: 'プラットフォーム', allPlatforms: 'すべてのプラットフォーム', module: 'モジュール', allModules: 'すべてのモジュール', sort: '並び順', priority: '工程順・重大度順', release: '元のリリース', reset: '絞り込みをリセット',
    offlineSearch: 'キーワードと識別子の検索はモデルを使わずローカルで実行します。意味検索ではありません。', semanticUnavailable: '意味検索は利用できません', semanticReason: '理由',
    checklist: 'ローカルチェックリスト', localOnly: 'このブラウザーのみに保存します。バックアップをエクスポートしてください。ブラウザーデータを消去すると失われます。工数は利用者の見積もりであり、重大度や工程とは独立しています。', export: 'JSON をエクスポート', import: 'JSON をインポート', complete: '完了として記録', effort: '工数見積もり・メモ', saved: 'チェックリストをローカルに保存しました。', storageError: 'ブラウザーの保存領域が使用不可または満杯です。変更はメモリー内にあります。画面を閉じる前にエクスポートしてください。', exported: 'チェックリストをエクスポートしました。', imported: '安定 ID に基づいてチェックリストをインポート・統合しました。', invalidImport: 'チェックリストの JSON が不正です。schema_version: 1 と、ID ごとの items に checked（真偽値）および effort（文字列）が必要です。既存データは変更していません。', importReadError: 'ファイルを読み込めませんでした。既存データは変更していません。', importTooLarge: 'ファイルが 2 MB を超えています。既存データは変更していません。',
    versionWarning: '新たに跨ぐ変更を表示するには、移行元より後の移行先を選択してください。既存の非推奨項目と閾値不明の項目は引き続き表示されます。', resultCount: '{total} 件中 {count} 件', noResults: '該当する記録はありません', noResultsBody: '結果がないことは、安全なアップグレードを意味しません。絞り込み、出典の網羅範囲、未解決の疑問を確認してください。',
    candidate: '候補 · 人によるレビュー未実施', reviewed: 'レビュー済み（カタログの状態）', reviewUnknown: 'レビュー状況不明', generated_candidate: '自動生成された候補', human_reviewed: '人によるレビュー済み', provenance: '文章の来歴', reviewStatus: 'レビュー状況', stage: '工程', criticality: '重大度', type: '種別', bucket: 'バージョン区分', identifiers: '識別子', applicability: '適用条件と対応', formats: 'アプリケーション形式', conditions: '条件', action: '対応', relevance: '対象範囲との関連', evidence: '根拠', sourceEdition: '出典の版', sourceLanguage: '出典の言語', confidence: '確信度', notices: '注意事項', appliesUntil: '適用終了', fallback: '翻訳がありません。英語またはカタログの原文を表示します。', noEvidence: '根拠は記録されていません。', sourceId: '出典 ID', family: '分類', fetchedAt: '取得日時', checksum: 'SHA-256', originalUrl: '登録 URL', resolvedUrl: '解決後の URL', excerpt: '出典の原文抜粋', noChanges: '変更はまだ公開されていません。',
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

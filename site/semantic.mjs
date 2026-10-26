export const SEARCH_SCHEMA = 1;

export function corpusRows(catalog, language) {
  return catalog.changes.flatMap(entity => (entity.members?.length ? entity.members : [entity])
    .map(fact => {
      const text = fact.localizations[language];
      return { id: fact.id, entity_id: entity.id,
        text: `title: ${text.one_line} | text: ${text.paragraph}\n${(text.identifiers ?? fact.identifiers ?? []).join(' · ')}\n${text.action}` };
    })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function normalizedVector(values, dimensions = 768) {
  if (values.length !== dimensions || !Array.from(values).every(Number.isFinite)) {
    throw new Error('Invalid embedding dimensions or nonfinite values');
  }
  const norm = Math.hypot(...values);
  if (norm < 0.01) throw new Error('Empty embedding');
  return Float32Array.from(values, value => value / norm);
}

export function scoreFacts(ids, vectors, query, dimensions = 768) {
  if (vectors.length !== ids.length * dimensions || query.length !== dimensions) {
    throw new Error('Invalid search index shape');
  }
  const scores = new Map();
  for (let row = 0; row < ids.length; row++) {
    let score = 0;
    for (let col = 0; col < dimensions; col++) score += vectors[row * dimensions + col] * query[col];
    if (!Number.isFinite(score)) throw new Error('Nonfinite search score');
    scores.set(ids[row], score);
  }
  return scores;
}

export function entityScore(change, scores) {
  const ids = change.visible_member_ids ?? change.member_ids ?? [change.id];
  return Math.max(...ids.map(id => scores.get(id) ?? -1));
}

export function hybridFilter(eligible, lexical, scores, threshold) {
  const exact = new Set(lexical.map(change => change.id));
  return eligible.filter(change => exact.has(change.id) || entityScore(change, scores) >= threshold);
}

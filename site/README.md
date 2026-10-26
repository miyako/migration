# Static migration UI

Serve this directory with any static HTTP server. No build step, package installation, external assets, backend, or runtime AI/GitHub requests are required. The app requests **`./data/catalog.json`**, relative to `index.html`, so a GitHub Pages project subpath works. The catalogue is published separately; no example catalogue is supplied here. A missing or unsupported catalogue displays unknown coverage, never a successful empty result.

Run the pure-logic tests:

```sh
node --test site/logic.test.mjs
```

## Data and filtering

The UI consumes catalogue schema version 1. All five language dictionaries are in `logic.mjs`; change summaries use `localizations[language]`, with an explicit English/catalogue fallback notice if absent. Source excerpts retain their original language. Catalogue-provided free text (coverage notes, reasons, actions, source headings, clarification titles) is shown verbatim, not machine-translated. No new catalogue fields are required. An optional `localizations[language].action` is displayed instead of the record's shared action when provided.

If the catalogue includes `discoveries`, they are counted separately from registered sources and listed in the Sources view. Pending discoveries do not inflate retrieval totals.

Entries in `coverage.processed_source_ids` are labeled as sources used for a partial sample, not as fully cataloged pages. Each displayed action includes its `action_basis` (or an explicit missing-value label) to distinguish editorial recommendations from official instructions.

An unknown release (`threshold: {exact: null, bucket: null, kind: "unknown"}`) or `action: null` is valid. These records remain eligible for review and display localized “Unknown” values without inventing a release or recommendation. Unknown stages sort after known stages; unknown severity sorts last within its stage.

Original release, major-version bucket, and evidence source edition are displayed separately. Removals/restrictions are selected when their bucket is later than the source and no later than the target. Deprecations accumulate through the target, even if they predate the source. Unknown thresholds/platforms/modules remain visible. Conditions and `applies_until` are shown rather than inferred: the UI cannot determine whether a user's application satisfies a condition. Comparison is at major bucket granularity, not release-update granularity. Priority sorting groups stages first (syntax, compilation, runtime, testing, deployment, modernization, unknown), then sorts by severity within each stage. Stage, severity, and user effort remain independent metadata; stage ordering does not infer severity or effort.

The `latest` selector is disabled until a parseable `latest.release`, `status: "verified"`, and valid `verified_at` are present. A feature release is explicitly labeled as such, not as LTS or an account-only hotfix/build check. No release is inferred from the calendar or source edition.

## Browser state

Preferences and the stable-change-ID checklist are stored in `localStorage`, using the `4d-migration-` prefix. Storage failures are reported and editing continues in memory. Browser storage is origin-scoped, not a shared/team account. Export before clearing it.

Checklist exports have their own schema (not a catalogue schema addition):

```json
{
  "schema_version": 1,
  "updated_at": "2026-01-01T00:00:00.000Z",
  "items": {
    "stable-change-id": { "checked": false, "effort": "Estimate or notes" }
  }
}
```

Imports validate the entire file before changing memory or storage. They merge by stable ID, with imported values winning only for matching IDs; IDs absent from the current catalogue remain preserved. Maximum import size is 2 MiB, with at most 20,000 entries, IDs up to 300 characters, and effort text up to 10,000 characters. These files can contain personal notes; sharing is an explicit user action.

Navigation, selects, checkboxes, disclosures, and buttons use native keyboard behavior. The theme follows system changes automatically unless explicitly overridden. All source-provided content uses text nodes; evidence links accept only HTTP(S).

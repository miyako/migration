# 4D migration reference — initial proof of concept

An evidence-backed, **partial** quick directory of 4D upgrade changes after successful
conversion/opening. A shared static interface supports English, French, German,
Spanish and Japanese. It runs on GitHub Pages without a backend, accounts, paid
services, external fonts, analytics, runtime GitHub API calls or AI calls.

**This is not a planner, an exhaustive migration checklist, or a support/troubleshooting tool.**
If conversion or opening fails, contact [official 4D Support](https://www.4d.com/support).
Binary-to-project conversion is not assumed to be mandatory.

## What is actually covered

The current snapshot covers **39 supplied English seeds**: 26 legacy documentation
pages (including the distinct **Upgrade** family), 9 official blog overviews, and
4 current official documentation Release Notes pages.
Each legacy seed's four other languages are located through actual archive
directory links; modern documentation uses actual official `hreflang` routes,
for **155 registered source URLs**:

| Publication snapshot, 2026-10-26 | Count |
|---|---:|
| Available structural extracts | 155 |
| Article surfaces / generated navigation index views | 100 / 55 |
| Currently unavailable registered source URLs | 0 |
| Superseded guessed URLs that returned 404, retained as history | 34 |
| Bounded archive directory indexes traced, separate from sources | 21 |
| Actual blog language links queued for review, not fetched | 27 |
| Modern Release Notes URLs, included in available sources | 16 |
| German modern counterparts not advertised/linked, not HTTP failures | 4 |
| Candidate actionable changes | 3 |
| Human-reviewed changes | **0** |
| Source pages used for the candidate sample, partially only | 2 |

The two partially processed pages are the English and Japanese **v20 deprecated /
removed** editions. The three candidates cover colon restrictions in identifiers,
the PDFCreator driver deprecation, and removal of the bundled PHP DOM module.
Every candidate has original one-line and paragraph summaries in all five
languages, with **generated-candidate** provenance. They are not official summaries
or human-reviewed translations. English/Japanese official wording seeds a small
concept glossary; French/German/Spanish official glossary entries remain unknown.

The earlier suffix-only probe method was incorrect: translated pages also use
translated slugs. For example, French v20 is
[`Fonctionnalites-obsoletes-ou-supprimees.100-6259787.fr.html`](https://library.4d-japan.com/doc/4Dv20/4D/20/Fonctionnalites-obsoletes-ou-supprimees.100-6259787.fr.html),
not the English slug with `.fr.html`. All 34 failed guesses have now been replaced
with verified linked locations under the same stable source IDs. Their real 404
results remain in `url_history`; they are **not missing translations**. Including
those superseded attempts, 189 distinct source URL locations have been checked
over time (155 current + 34 superseded), separate from archive directory indexes.

### Current official documentation Release Notes

These sources are hosted by **4D at developer.4d.com**, not the 4D Japan legacy
archive. All 16 URLs below returned available, same-locale, same-route-edition
HTML on 2026-10-26, without redirects. Localized URLs are taken from each English
page's actual `hreflang` links, with the **locale before the version**:

| Route / observed document edition | English seed | French | Spanish | Japanese |
|---|---|---|---|---|
| Moving-current, **21 R5 BETA** | [en](https://developer.4d.com/docs/Notes/updates) | [fr](https://developer.4d.com/docs/fr/Notes/updates) | [es](https://developer.4d.com/docs/es/Notes/updates) | [ja](https://developer.4d.com/docs/ja/Notes/updates) |
| Versioned **21** | [en](https://developer.4d.com/docs/21/Notes/updates) | [fr](https://developer.4d.com/docs/fr/21/Notes/updates) | [es](https://developer.4d.com/docs/es/21/Notes/updates) | [ja](https://developer.4d.com/docs/ja/21/Notes/updates) |
| Versioned **20** | [en](https://developer.4d.com/docs/20/Notes/updates) | [fr](https://developer.4d.com/docs/fr/20/Notes/updates) | [es](https://developer.4d.com/docs/es/20/Notes/updates) | [ja](https://developer.4d.com/docs/ja/20/Notes/updates) |
| Versioned **19** | [en](https://developer.4d.com/docs/19/Notes/updates) | [fr](https://developer.4d.com/docs/fr/19/Notes/updates) | [es](https://developer.4d.com/docs/es/19/Notes/updates) | [ja](https://developer.4d.com/docs/ja/19/Notes/updates) |

All four pages advertise **en/fr/es/ja/pt**. **German is not advertised or linked**
for any of these four editions: four `not_linked` discovery records preserve the
checked English parent, timestamp, hash and advertised language set. They have no
fabricated counterpart URL or HTTP status, are not registered fetch failures,
and do not prove that no German material exists elsewhere. Portuguese is
advertised but outside this application's requested en/fr/de/es/ja scope; its
pages were not fetched. Existing blog discoveries remain queued and untouched.

Unversioned and versioned sources keep independent stable IDs even if their
content later matches. The requested URL, final URL, canonical URL, Docusaurus
version/locale, visible version badge, actual version-navigation routes, and
release-history headings are preserved. The moving page currently identifies
**21-R5 / 21 R5 BETA**; this is **not** a released-latest verification and does not
update `data/latest.json`'s separately verified public feature release **21 R4**.
Versioned 21/20/19 pages contain separate LTS and patch histories (for example
21.2, 20.9 and 19.8); document edition is not a blanket introduction threshold.

The modern extractor isolates `theme-doc-markdown`, excluding global navigation,
sidebars, mobile contents and feedback/footer material. It retains heading
hierarchy and anchors, table rows with headers, nested list lead text and code.
Soft 404s, locale redirects/fallbacks, canonical/edition mismatches, and missing
article scope are not accepted as available translations. A localized article
must differ from its cached English article; this whole-article fallback check
does **not** claim complete or human-reviewed translation of every paragraph.

These 16 sources are **fetched and structurally extracted, not catalog-processed**.
No new actionable records, thresholds or review claims were generated: the
catalog remains **3 candidates, 2 partially used legacy pages, 0 human-reviewed**.
Actionable changes may later deduplicate across sources; provenance never does.

### Legacy archive coverage

The added **4D v16 - Upgrade** overview and all four localized counterparts are
available and structurally extracted. The overview describes features added since
v15 R5 and links existing conversion/deprecation sources. New-feature headings
do not automatically establish migration requirements; no new actionable records
or human-review claims were added for this source.

The preceding legacy registry expansion added **13 English seeds and 52 verified locale
counterparts**, with **no missing counterparts** in this snapshot:

| Manual | Section family | Exact English editions | Registered URLs |
|---|---|---|---:|
| Language Reference | What's new | 16.3, 17.4, 18, 19, 20.1 | 25 |
| Design Reference | What's new | 17.4, 18, 19 | 15 |
| Language Reference | Obsolete / deprecated commands | 16.3, 17.4, 18, 19, 20.1 | 25 |

These are distinct sources, **not new catalog records**. Manual identity is
explicit, with same-edition parent-manual links verified from each page.
The full numeric **type + ID** is significant: `901-3651020` (What's new) and
`906-3651020` (Obsolete commands) share a manual ID but are different sections.
Likewise, Language and Design What's new pages are not duplicates.

Of these 65 added pages, **55 are generated navigation-index views**, not prose
release notes, and 10 are ordinary deprecated-command articles. The extractor
isolates `Title_list` entry labels, destinations and update markers, retaining tab
order/selection without pulling in the outer layout table, manual menus or
footer. It never executes legacy JavaScript. A valid empty index can be available
without pretending it contains catalog evidence.

Only the server-selected tab is extracted: for example, the **16.3 document**
What's new page initially selects a **16.2 tab**. Both facts are preserved and
neither is assumed to be a change's introduction threshold. Other tabs and linked
command pages are recorded as links, not automatically fetched or cataloged.
Obsolete/deprecated commands are **not automatically removed or syntax blockers**.
No actionable records have been cataloged from these newly added sources; the
catalog stays at three candidates from two partially used pages, with zero
human-reviewed changes.

Fetching or extracting a document does **not** mean its changes were all cataloged.
The remaining available pages, other removed PHP modules, compiler requirements,
conversion-guide child pages, historical deduplication/alignment, and broader
version/platform coverage still need editorial processing. Unresolved localized
locations are not guessed or silently replaced with English. No results never means an upgrade
has no issues. The UI exposes these counts and each source's status.

The verified **latest public feature release** is **4D 21 R4**, released
2026-10-12, checked 2026-10-26 against the
[official download page](https://us.4d.com/product-download) and
[release announcement](https://blog.4d.com/4d-21-r4-is-here/).
It is distinct from the LTS channel. Account-only hotfixes/builds were not checked.
`data/latest.json` preserves evidence and verification date: “latest” is a
publication snapshot, not a live promise.

## Run, validate, publish

Requirements: Python 3.12+ and Node 22+ for tests; **no package install** is needed.
The browser uses only native ES modules, CSS, and local JSON.

```sh
python3 -m tools.catalog
python3 -m unittest discover -s tests -v
node --test site/logic.test.mjs
python3 -m http.server 8000 --bind 127.0.0.1 --directory site
```

Open `http://127.0.0.1:8000/`. Use HTTP, not `file://`, because the app fetches its
local published JSON. App/asset/data URLs are relative and support `/migration/`
or another GitHub Pages subpath. There is no service worker/offline-install claim;
search requires no model or network after the page and local assets have loaded.

`.github/workflows/pages.yml` builds and validates pull requests without fetching
sources. Pushes to `main` deploy the `site/` artifact using GitHub Pages Actions.
Select **Settings → Pages → Source → GitHub Actions** before the first deployment.
Opening this foundation PR does not merge or deploy it. Generated `site/data/`
is ignored and rebuilt from the committed editorial inputs.

## Architecture and data contract

| Path | Role |
|---|---|
| `data/sources.json` | Independent, extensible seed registry: stable ID, family, edition, URL |
| `data/registry.json` | Checked sources, language, publisher/authority, discovery provenance, fetch dates, HTTP/redirect status, resolved URL and SHA-256 |
| `data/source-locations.json` | Verified translated document locations, archive link chains or official documentation hreflang/hash provenance; unresolved discovery is explicit |
| `data/archive-navigation.json` | Bounded index-fetch provenance and hashes; these navigation pages are not catalog sources |
| `data/discoveries.json` | Actual bounded `hreflang` discoveries pending/accepted review |
| `data/changes.json` | Publication-time editorial candidates with stable IDs and evidence |
| `data/overrides.json` | Manual, reasoned patches applied last; ingestion never rewrites them |
| `data/glossary.json` | Concept/edition-aligned official wording where verified; unknowns explicit |
| `data/dispositions.json` | Explicit exclusions and pending editorial questions, not confirmed public errors |
| `data/clarifications.json` | Curated confirmed-error register with evidence and dispositions |
| `data/latest.json` | Evidence-backed concrete feature-release resolution |
| `data/semantic-search.json` | Explicit unavailable state and pinned research provenance |
| `tools/ingest.py` | Incremental fetching, structural extraction and local review diffs |
| `tools/discover_docs.py` | Four-seed bounded modern Release Notes discovery/fetch; actual same-edition locale routes only |
| `tools/catalog.py` | Fail-fast schema/domain validation, ID deduplication, overrides and deterministic publication |
| `site/` | One shared multilingual app; no on-demand classification or translation |

Each change is **one actionable change**, not a whole release note. Editorially
assigned `chg-*` IDs survive revised prose, source editions and translations.
Repeated entries use the same ID and merge distinct evidence; conflicting
classification under the same ID stops publication for editorial resolution.
Multiple supporting sources are allowed. Do not derive IDs from mutable text.

Records keep relevance **with a reason**, exact threshold, normalized bucket,
independent source edition, platform (including unknown), extensible module
labels, change type, criticality, stage, format/conditional applicability,
action and its basis, short evidence excerpts/headings/anchors/block IDs/source
hashes, confidence, and review status. Stages are syntax, compilation, runtime,
modernization; criticality is classified separately from stage.
Unknown thresholds use `{"exact": null, "bucket": null, "kind": "unknown"}`;
unknown actions use `null` plus an explanatory `action_basis`. Unknown
stage/criticality/platform values are explicit, never silently inferred.

`validate()` in `tools/catalog.py` is the executable schema contract. Publication
fails on missing evidence, incorrect buckets, duplicate IDs, invalid provenance,
missing localized summaries, English fallback presented as translation, unknown
notices, or unsupported semantic availability. Changing candidate status to
`reviewed` requires a reviewer and date; it must reflect real human review.

### Version/filter semantics

Selectors are v16–v21 and latest. Historical R cycles map to the **next** major:
15 R4 → v16, 16 R2–R6 → v17, 19 R4 → v20, 20 R releases → v21.
The 21 R cycle maps to latest until v22 exists. Exact releases and source
editions (for example 18 versus 18.2, or 17.1) remain separate metadata.
An overview's release title is not proof of a change's introduction threshold.
Both menus disable choices that would place the source after the target.
Equal versions remain selectable to assess existing deprecations.

The browser matches a source/target interval plus applicability, not just the
document edition. Lingering deprecations and explicit target requirements can
remain relevant even when introduced before the source version. Optional
`applies_until` bounds temporary workarounds; do not assume an intermediate
workaround is required at the final target. Unknown platform/format records
remain visible for assessment. Prioritize syntax, then compilation, runtime,
and optional modernization; deprecation is not removal. The v20 sample does not
independently verify behavior in every later release.

## Reproducible ingestion and editorial updates

All network access is an explicit **publication-time** operation:

```sh
# Initial/full registered scan; never crawls arbitrary related pages
python3 -m tools.discover_archive
python3 -m tools.ingest
# Fetch only affected sources; uses ETag/Last-Modified when locally cached
python3 -m tools.ingest --id legacy-v20-deprecated-en --id legacy-v20-deprecated-ja
# Force retrieval if reviewing source changes
python3 -m tools.ingest --refresh --id legacy-v20-deprecated-en
# Optional explicit TLS-verifying transport, useful with macOS trust stores
python3 -m tools.discover_archive --transport curl
python3 -m tools.ingest --transport curl --id legacy-v20-deprecated-en
# Fetch only four modern seeds and their actual linked app-language counterparts
python3 -m tools.discover_docs --transport curl
# After reviewing data/discoveries.json: explicitly register same-host blog locales
python3 -m tools.ingest --accept-discoveries --transport curl
# Match every short quote, heading, block and hash against the local extracts
python3 -m tools.catalog --verify-evidence
```

The default Python TLS trust store on the initial development machine lacked a
legacy-host certificate chain. The explicit `curl` transport (curl 7.70+) worked
with OS trust; **TLS verification is never disabled**. Individual failed requests
are logged and retained with status/error rather than being treated as empty
successful documents. Inspect registry status after fetching; HTTP unavailability
is not a reason to delete a source. A successful scan command means statuses
were recorded, not that every remote URL was available.

Raw pages, structural extracts, and unified source diffs are local/ignored:
`.cache/raw/`, `.cache/extracts/`, `.cache/diffs/`. Extraction preserves section
hierarchy; archive navigation snapshots live in `.cache/navigation/`. It preserves
table cells with header context, code blocks, anchors and resolved
links; it does not use flattened simplified web text. Root-relative legacy links
are resolved against the actual fetched URL: `/4Dv20/...` is not blindly rewritten
to `/doc/4Dv20/...`. Legacy locale discovery starts at the configured `/doc/`
archive root, follows **actual links** through version/product/exact edition
directories, and matches the document's numeric type/ID plus language independently
of its translated slug. It never substitutes only the language suffix.
Different editions, document types, languages such as `fe` versus `fr`, or
ambiguous duplicate slugs are not silently merged. Navigation is limited to 24
index pages (21 currently needed), with conditional fetching and local ignored
index snapshots. Missing directory links or ambiguous matches fail explicitly;
unresolved locale matches are recorded without fabricating a URL. New seeds can
be registered in English before locale discovery, but additional languages are
not invented. Source location corrections preserve earlier attempts under the
same stable ID.

Only actual blog `hreflang` links are queued, never invented blog translations.
Modern Release Notes discovery is separately bounded to four configured English
seeds and at most four additional app languages per seed (16 actual URLs in this
snapshot). It follows no article links, other versions, Portuguese pages or
command-detail pages. Legacy archive discovery skips modern seeds and preserves
their independently recorded locations/unresolved entries.
No unbounded crawl runs. Conversion landing pages do not
imply their linked details were processed.

Unchanged bodies reuse extraction. Bump `EXTRACTOR_VERSION` when changing the
extractor; a cached 304 response also refreshes outdated extracts locally.
Changed bodies produce reviewable local HTML diffs and new hashes.
Refetch the cited sources to populate a fresh machine's cache before
`--verify-evidence`; standard offline CI validates the committed metadata without
redistributing snapshots. If a source changes, evidence verification fails until
an editor checks and updates bindings. Network reproducibility is necessarily
bounded by availability and upstream changes; snapshots are not public archives.

Review the local diff and extracted blocks, then author/update candidates. Do not
automatically publish model output or infer platform/version/action from silence.
An override has the form:

```json
{
  "schema_version": 1,
  "changes": {
    "chg-colon-identifiers": {
      "reason": "Explain the evidence-backed correction",
      "patch": {"confidence": "medium"}
    }
  }
}
```

Nested objects merge, arrays replace; unknown IDs or attempts to rename IDs fail.
Overrides are separate from ingestion and survive refetches.
An offline build is byte-reproducible from identical committed inputs; its
timestamp derives from recorded checks, not the build clock.

### Clarifications, preferences and provenance

Significant **confirmed catalog errors/source contradictions** belong in a
manually created GitHub issue and `data/clarifications.json`: stable ID, title,
pending/resolved/superseded status, affected change IDs, issue URL, evidence and
disposition. Link the clarification IDs from affected changes' `notices`.
The app has a separate navigable register without live API access. It starts
with one resolved clarification documenting the confirmed translated-slug
discovery error and its correction; this is not a 4D product defect. Model
suspicions go to an editorial queue first; never automatically post them as
established 4D bugs. Official support is separate.

The site is a quick directory, not a planner: no completion checkboxes, editable
notes, effort estimates, or planner JSON import/export. Only language/theme
preferences persist under `4d-migration-preferences-v1`; storage errors are shown
explicitly. Retired checklist storage is ignored, not read, migrated, overwritten
or cleared. Unrelated browser preferences remain untouched.
Do not put credentials, customer source, private support material or personal
notes in catalog commits or public issues.

## Semantic search: deliberately not integrated

Keyword/exact identifier search is real and needs **no model download**.
Semantic search is visibly unavailable, not a different name for keyword search.

Bounded research verified the proposed **EmbeddingGemma 2 270M text-only
configuration**, not a separate `embeddinggemma-2-270m` checkpoint:

- [Official model card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2)
  describes a 740M total model with a modular 270M text/code component and claims
  100+ languages. That does not establish quality for each of en/fr/de/es/ja.
- [Google checkpoint, pinned revision](https://huggingface.co/google/embeddinggemma-2/blob/914f7f89142e33e77833254d9c9b90c3cef7303b/README.md)
  declares Apache-2.0.
- [Community ONNX export, pinned revision](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX/blob/daa72c51243991dfcaf9f9137d2c573d8f7790c0/README.md)
  documents Transformers.js WebGPU/WASM and selective text-only loading.
  Generic feature-extraction loads every encoder; the stated ~175 MB q4 text
  component is **not** total browser memory.

No weights were downloaded and browser inference was not tested. Five-language
retrieval quality, browser memory/latency, selective loading and runtime/export
license review remain integration gates. E5-small and Ruri-v3 Japanese are only
fallback benchmark candidates, not selected dependencies. No external AI API is
called. Before any future integration, version the corpus and query **same**
checkpoint/export revision, tokenizer, dimensions, normalization, prefixes and
configuration; benchmark all five languages and preserve model-free search.

## Reuse and rights

This repository does not relicense 4D documentation, trademarks, blog posts or
model assets. Source material remains subject to its owners' terms. Only short,
necessary evidence excerpts, metadata, links and independently authored summaries
are published; raw snapshots/extracts are excluded. No blanket license for
third-party content or permission to republish whole source documents is implied.
Generated summaries/translations are labeled separately from official wording.

For the modern documentation, the observed [robots endpoint](https://developer.4d.com/robots.txt)
returned HTTP 404 on 2026-10-26; this is not an affirmative reuse grant.
The page footer states “© 2026 4D SAS - All rights reserved”.
Its feedback links identify the public [4d/docs source repository](https://github.com/4d/docs),
whose [`LICENSE-docs`](https://github.com/4d/docs/blob/main/LICENSE-docs)
identifies **CC BY 4.0** (observed license blob
`a6d7fd364bcc113164fb923e4eb53ae6fd75cae4`). That is documentation-repository
provenance, not a blanket license for all website, archive or blog material.
This project retains its conservative metadata/link/short-excerpt policy;
whole documents and structural extracts remain local and ignored.

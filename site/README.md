# Static migration directory

For source development, serve this directory after `python3 -m tools.catalog`.
For publication, run `python3 -m tools.publish` and serve/upload `_site/` instead.
Keyword search requires no model, external assets, backend, or runtime AI/GitHub
API requests. Semantic search loads automatically on the first visit using a WebGPU
text encoder; see the measured model contract and limitations in the root README.
Run `npm ci && npm run build:search-runtime` before publication. Model weights
are public, pinned external downloads; queries never leave the browser.
`./data/catalog.json`, scripts, styles, and the version SVG use relative
URLs, including under a GitHub Pages `/migration/` subpath. Missing or invalid
data displays a localized actionable error, never a successful empty directory.

The publisher gives the complete runtime asset set a shared content-derived
`assets/<sha256>/` namespace. Root HTML points to that release's app, CSS and SVG;
the app's native logic import and module-relative catalog URL resolve within the
same namespace. Changes to HTML, modules, styles, SVG or data change all asset
URLs automatically. This avoids a real HTTP-cache failure: new HTML without
`#coverage` could previously reuse a still-fresh pre-UX `app.mjs` containing
`renderCoverage()`, causing `area.replaceChildren` to throw. There is no stale
renderer in current source and no null guard or restored dashboard is needed.
GitHub Pages may still cache the root HTML for its normal lifetime; this change
ensures newly fetched HTML cannot select assets from another release. It does
not promise offline access or retention of previous releases on Pages.
An already-open tab or cached legacy HTML cannot be updated retroactively;
users seeing the old failure may need one force refresh after deployment.

```sh
node --test site/logic.test.mjs
npm run test:search
python3 -m unittest discover -s tests
```

## Visitor interface

Current/target versions filter the directory by upgrade applicability. The
interface shows only the matching-entry count, without a catalog total or a
catalog/upgrade mode selector. Applicability conditions, exclusive end bounds
and exact target-release constraints remain available on each card.

After path, visibility, keyword/semantic and platform/topic filtering, matches
are partitioned without duplication into three sections. **Upgrade changes** is
the main list. Known-date deprecations appear under **Existing deprecations**;
unknown introduction cutoffs take precedence and appear under **Version not
established**, even for removed or deprecated features. No entry is made
optional simply by being moved to a section.

The two secondary sections are initially collapsed, have their own matching
counts, and retain the selected sort and full cards/evidence. Links above the
main list open them; a prominent warning points to matching undated requirements,
which can include compiler, signing, security or data-repair work. Nonempty search
automatically opens secondary sections containing matches. Empty sections are
hidden. The main count covers only Upgrade changes; if that list is empty while
secondary results remain, the empty message explicitly directs the user to them.
For the default v16 → v21 path this means 105 main entries, 31 deprecations and
30 undated requirements. v21 → v21 has zero main entries, not zero potential work.

Routine compatibility checks, deferred modernization and optional adoption
guidance are hidden by default where reviewed.
**Include routine and advisory items** reveals them within the same upgrade path, search,
platform/topic filters and sorting. Keyword and semantic search use the same
visibility rule; neither silently brings hidden items back. Included items
carry localized Routine check, Deferred modernization or Optional adoption
badges. Reset filters returns to the pruned default, and
the checkbox is not persisted; language and theme remain the only preferences.
The reference URL list is unaffected.

`data/default-visibility.json` records an explicit editorial reason and reviewed
entity membership for each classification. Configuration schema v2 separates
11 routine checks from 7 deferred-modernization and 9 optional-adoption entries.
The 16 advisory exclusions apply only to the reviewed concrete targets **21**
and **21 R4**, not earlier, unknown or future releases. Latest resolves to its
actual release before matching; advancing latest requires another review before
these entries can be hidden there. A future target therefore reveals the
advisory entries even when the checkbox remains unchecked.
The publisher rejects
unknown IDs, unsupported metadata and changed group membership rather than
silently hiding newly added migration work. Unclassified entries stay visible,
regardless of severity. Required code, data, security, configuration and deployment
work remains visible. Supported-command modernization and optional compatibility
settings are deferred, not declared unnecessary or safe to enable without
testing. Classification is not a severity or difficulty estimate.

The supplied 4D glyph and white
ring are preserved in `4d.svg`; only its inner circle inherits the version color.
`VERSION_COLORS` contains the supplied v15-v21 palette without adding a v15
selector. Latest uses its concrete major's color; an unknown future major has
no invented color. Explicit text labels and an accessible direction arrow do
not rely on color.

Search, platform/topic checkboxes, and sorting follow the version pair. Each
group's Select all / Unselect all affects only that group. Empty selection
means no matches, not all. Reset filters clears search, selects all options,
and restores Severity without changing versions, language, or theme. Options
are ORed within each group and ANDed across groups. Platforms offer only Windows
and macOS, never Linux or Unknown. Unknown/missing platform applicability remains
eligible with either or both OS choices selected; neither selected means no
results. Evidence metadata is not reassigned. No current catalog fact is Linux-only;
future Linux-only facts would not match these visitor choices, while their
provenance remains intact. `all` platform applicability matches either OS.
The Topics checkbox for internal `unknown` is labeled Other / Autres / Sonstige /
Otros / その他. Its filtering semantics are unchanged; other Unknown labels,
including severity, complexity and evidence uncertainty, are not renamed.

The two sort choices are **Severity** (default, highest first, unknown last) and
**Complexity** (Simple, Moderate, Complex, Unknown). Complexity means difficulty
of applying the documented remediation, not understanding the text, severity,
hours, or project size. Complexity ties use severity then stable ID; severity
ties use stable ID. Sorting never changes version or filter state.

Schema-v1 changes may include typed `complexity` metadata:

```json
{"level": "unknown"}
```

Known levels (`simple`, `moderate`, `complex`) require a nonempty documented
`basis` and `evidence_source_ids` referencing the change's own evidence.
Publication and browser validators reject unsupported levels or unsubstantiated
known values. Missing classification remains Unknown for backwards compatibility.
All existing samples remain explicitly Unknown; no difficulty is inferred from
severity, stage, or number of instructions.

One-line and paragraph summaries are available in English, French, German,
Spanish, and Japanese, with an explicit fallback notice if needed. Unchecked
summaries have a short, actionable source-verification caveat, not a review
dashboard. Evidence links and original excerpts remain on each record.
The visible evidence list first selects sources compatible with the chosen
upgrade path and applicable group members, then uses the actual source locale
matching the UI, or English if there is no compatible evidence in that locale.
Moving beta documentation is not substituted for a historical edition.
Later-edition-only support is explicitly unresolved for that path, not silently
presented as path verification. It retains distinct citations,
including support for grouped members, rather than choosing only one URL. If
neither locale nor English evidence exists, a localized unavailable message is
shown. All evidence in other languages remains in data and searchable provenance;
source excerpts are not rewritten. A displayed source's retrieval error remains
contextual to its evidence, rather than endorsing an unchecked claim.

Authored locale fields provide display identifiers, actions, **every condition
and action rationale**, not just wording where command names differ. Missing
localized applicability prose is invalid catalog data, not permission to fall
back to raw English editorial metadata. French displays official French
command names; en/de/es/ja display English names. Groups combine their members'
localized identifier lists, while raw bilingual aliases and member IDs remain
searchable. The evidence-bound command-name glossary records both official source
forms; no runtime search-and-replace touches source quotations. Where archive
spellings do not establish a reliable French name, French prose describes the
operation without inventing a command identifier.

Technical audit information (source registry/provenance, coverage, pipeline
counts, review state, and clarification register) stays in repository data and
the root README, not in visitor navigation. A collapsed **Reference URLs**
disclosure above the results lists every registered source in the selected UI
language, including sources not cited by published entries. Each item shows the
source title, edition and clickable registered URL. It uses the static catalog,
does not follow version/search/platform/topic filters, and does not substitute
English sources for missing translations. The list is not an exhaustive
documentation directory. No source data is removed.

## Version semantics and state

Semantic search uses the same search field, with a brief localized availability
notice, actual per-file progress, ready, unsupported and actionable failure states.
It starts once after catalog loading and WebGPU detection on every new page visit,
without a permission checkbox; locale/filter/theme renders do not restart it.
Language/theme remain the only preferences stored by the app. Model downloads
may be retained separately in browser Cache Storage. Unsupported WebGPU avoids
the large runtime and model downloads. Keyword matching is never gated by model
loading; the current query and locale run automatically when ready. Semantic search adds
path-eligible atomic-member matches at cosine 0.74 or above without changing the
selected sort; exact text and bilingual command aliases remain included.
Search input is limited to 1,000 characters, and encoder inputs to 512 tokens.
Empty text restores the directory. Reset clears text/filters, not a loaded model.
Failures offer explicit Retry, never automatic retry loops. Loading/query
deadlines terminate stalled workers; page exit also cleans up the worker.
Back/forward-cache restoration restarts it. Download and memory budgets are
documented in the root README, not visitor banners.
No WebGPU or a model/index failure is explicitly reported, not called semantic
success. There is no working quantized WASM fallback for this export.

Original exact release and source edition stay distinct from migration buckets.
Historical R cycles map to the next major; current-cycle R releases map to latest.
Removals/restrictions use exact release ordering within the coarse selector
boundaries; deprecations accumulate through the target. Same-major patch/HF/build
changes remain conditional because v20 alone does not prove a specific patch is
installed. Backports retain one canonical fact with exact branch alternatives.
v21 → latest 21 R4 crosses 21 R3; v21 → v21 does not. Public latest caps out
21 R5 beta. Exclusive `applies_until` bounds concern the final target, so old
module-level PHP work is superseded by whole-interpreter removal at 20 R3.
Unknown release thresholds remain eligible. Equal versions are
allowed for existing deprecations. Version menus prevent source after target.
Latest requires a parseable concrete release, verified status, and verification
date; the label distinguishes feature releases from LTS.

This is a quick directory, not a planner: no completion, notes, estimates, or
planner import/export. Only language/theme persist in `localStorage`, under
`4d-migration-preferences-v1`; storage failures display a localized error.
Retired planner storage and unrelated preferences are untouched.

Native labels, fieldsets, checkboxes, buttons, selects and disclosures support
keyboard navigation. Theme follows the system unless overridden. All data uses
text nodes; links accept only HTTP(S).

## Optional real-browser regression check

`tests/browser_check.py` uses Playwright and an installed Chrome (or Playwright's
Chromium) as development-only test tools, not site dependencies. With Playwright
available, run:

```sh
python3 tests/browser_check.py
```

Generate the catalog first (`python3 -m tools.catalog`). The check builds and
serves the actual publication artifact under an ephemeral `/migration/` site.
It primes the actual pre-UX release (`fc6054b`, requiring repository history)
with `Cache-Control: max-age=600`, switches the same origin to new HTML without
clearing the browser cache, and verifies the obsolete module's real cache reuse
and `replaceChildren` error. It then verifies a successful transition to the
fixed artifact and a future logic-only release, including module/CSS/SVG/catalog
requests and a cache-disabled hard reload with pageerror capture.
It also exercises actual DOM behavior:
version isolation, scoped checkbox actions, empty results, both sort orders with
known and unknown classifications, all locales, both themes, mobile layout,
version colors, evidence and failure states. Optional `--screenshots DIR` saves
desktop/mobile previews outside the repository.

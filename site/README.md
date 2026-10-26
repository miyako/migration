# Static migration directory

Serve this directory with any static HTTP server after `python3 -m tools.catalog`.
No build dependencies, external assets, backend, or runtime AI/GitHub requests are
required. `./data/catalog.json`, scripts, styles, and the version SVG use relative
URLs, including under a GitHub Pages `/migration/` subpath. Missing or invalid
data displays a localized actionable error, never a successful empty directory.

```sh
node --test site/logic.test.mjs
python3 -m unittest discover -s tests
```

## Visitor interface

Current/target versions are the primary controls. The supplied 4D glyph and white
ring are preserved in `4d.svg`; only its inner circle inherits the version color.
`VERSION_COLORS` contains the supplied v15-v21 palette without adding a v15
selector. Latest uses its concrete major's color; an unknown future major has
no invented color. Explicit text labels and an accessible direction arrow do
not rely on color.

Search, platform/topic checkboxes, and sorting follow the version pair. Each
group's Select all / Unselect all affects only that group. Empty selection
means no matches, not all. Reset filters clears search, selects all options,
and restores Severity without changing versions, language, or theme. Options
are ORed within each group and ANDed across groups. Unknown applicability has
an explicit Unknown checkbox; missing/empty applicability uses that option.
`all` applicability matches selected known options, not the Unknown option.

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
Supporting conditions, action basis, and complexity rationale retain their
original language, explicitly labeled. A referenced source's retrieval error
is shown beside its evidence, rather than silently endorsing an unchecked claim.

Technical audit information (source registry/provenance, coverage, pipeline
counts, review state, and clarification register) stays in repository data and
the root README, not in visitor navigation. No source data is removed.

## Version semantics and state

Original exact release and source edition stay distinct from migration buckets.
Historical R cycles map to the next major; current-cycle R releases map to latest.
Removals/restrictions require crossing the bucket; deprecations accumulate through
the target. Unknown release thresholds remain eligible. Equal versions are
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

It serves its own ephemeral `/migration/` site and exercises actual DOM behavior:
version isolation, scoped checkbox actions, empty results, both sort orders with
known and unknown classifications, all locales, both themes, mobile layout,
version colors, evidence and failure states. Optional `--screenshots DIR` saves
desktop/mobile previews outside the repository.

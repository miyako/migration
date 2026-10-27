# 4D migration reference — initial proof of concept

An evidence-backed, **partial** quick directory of 4D upgrade changes after successful
conversion/opening. A shared static interface supports English, French, German,
Spanish and Japanese. It runs on GitHub Pages without a backend, accounts, paid
services, external fonts, analytics, runtime GitHub API calls or external inference.
Keyword search works immediately; semantic search automatically loads a local
text embedding model on the first visit in a WebGPU-capable browser.

**This is not a planner, an exhaustive migration checklist, or a support/troubleshooting tool.**
If conversion or opening fails, contact [official 4D Support](https://www.4d.com/support).
Binary-to-project conversion is not assumed to be mandatory.

## What is actually covered

The current snapshot registers **56 English seeds**: the original 39 supplied
seeds (26 legacy documentation pages, 9 blog overviews and 4 current official
Release Notes pages), 2 actually linked v16/v17 product-range detail pages,
5 exact-edition Compatibility pages, 2 bounded command-reference details, and
8 selected original KB technical notes (see the bounded KB batch below).
Each legacy seed's four other languages are located through actual archive
directory links; modern documentation uses actual official `hreflang` routes,
for **213 registered source URLs**. The KB originals are English only; no localized
counterpart URL was verified or invented. Five are bounded derived links, not new seeds:
the advertised public 21 R4 revision in four locales and its linked TLS bulletin:

| Publication snapshot, 2026-10-26 | Count |
|---|---:|
| Available structural extracts | 213 |
| Article surfaces / generated navigation index views / original KB PDFs | 150 / 55 / 8 |
| Currently unavailable registered source URLs | 0 |
| Superseded guessed URLs that returned 404, retained as history | 34 |
| Additional actual article links returning 404, directory-resolved with history retained | 10 |
| Bounded archive directory indexes traced, separate from sources | 21 |
| Actual blog language links queued for review, not fetched | 27 |
| Modern Release Notes URLs, including the bounded public revision | 20 |
| German modern counterparts not advertised/linked, not HTTP failures | 5 |
| Underlying atomic candidate facts | 276 |
| Published feature entities / curated multi-member groups | 202 / 28 |
| Human-reviewed changes | **0** |
| Evidence sources, all partially used rather than exhaustive manuals | 109 |
| Systematically dispositioned Stage 2 + Stage 3 pages / extracted blocks | 76 / 3,777 |
| Registered deprecated/removed overview/detail pages fetched and inspected | 35 |
| Stage 2 Changes/Quick-table pages systematically dispositioned | 20 |
| Stage 2 Compatibility pages / bounded command details, all five languages | 25 / 10 |
| Bibliographic Previous documents children inspected, not registered as content sources | 10 |

The first batch produced 68 candidates; Stage 1 added 70. Stage 2 adds **54 atomic
candidates** and reconciles **12 existing facts**, preserving all 138 earlier IDs.
Stage 3 adds **80 atomic candidates** from the bounded modern notes and reconciles
**22 earlier facts** (nine modern corroborations, 12 PHP-module bounds and the
separate Legacy-network lifecycle), without deleting IDs. Four further facts
receive clarification links only. The KB batch adds four facts and reconciles six
existing facts without new groups. The current 276 facts comprise 83 removals,
66 deprecations, 36 restrictions and 91 behavior changes after the GRAPH TABLE
override. These are **not 276 visitor cards**: 28 authored groups retain 102
members, with 174 distinct singletons, producing **202 feature entities**.
Grouping requires the same feature and
shared remediation, with compatible cutoff, type, stage, severity, platform and format.
All 12 bundled PHP module removals, for example, are one entity. The
v16 → v21 interval excludes GRAPH TABLE's pre-start v14 rule, current R-cycle
changes, and superseded intermediate PHP-module work, matching **190 entities**
before editorial visibility filtering. The same source to the public latest
matches **199** before that filtering.
The interface shows only the matching-entry count, not the catalog total.
The total is an outcome of the documented rows, not a record quota. All have
independently authored one-line and paragraph
summaries in en/fr/de/es/ja, with **generated-candidate** provenance.
Agent fact-checking is not human review. Official localized command names and
short quotations remain distinct from authored prose; the glossary now records
verified terminology in all five languages.

### Default directory focus

An entry-by-entry review classifies **11 singleton entities** as routine checks:
the 20.2/20.7/20.9 client minimums, the Windows Server 2012 R2 support boundary,
five automatic ICU index-rebuild notices, the target-20.1 client/server pair,
and the automatic 21 R3 switch from Legacy networking to ServerNet.
`data/default-visibility.json` records a specific editorial reason and the
reviewed membership for each. No facts, source evidence or translations are
deleted or reclassified as human-reviewed.

The action-first default also defers **7 supported-modernization entries**
(C_INTEGER, PHP commands, GET LAST ERROR STACK, GET SERIAL INFORMATION,
PROCESS PROPERTIES, SET SCREEN DEPTH and legacy parameter warnings), plus
**9 optional-adoption entries** (object dates, XPath, text/XML LF and BOM options,
DirectWrite, new-field NULL mapping and Fluent stylesheet queries).
These 16 additional exclusions are limited to reviewed targets **21** and
**21 R4**. Unknown, earlier or future targets do not inherit them automatically.
In particular, advancing latest requires another review.

Hidden items remain available through **Include routine and advisory items**,
including during keyword and semantic searches. The default
v16 → v21 list shows **166 entries**; the same source to latest shows **173**.
These are technical snapshot counts, not catalog totals shown to visitors.
All 28 groups remain visible, as do required code/data/security/configuration/deployment
changes, corrective object-field reindexing, signing, packaging and
architecture-specific rebuilding. The separate historical Legacy networking
entry stays visible because it includes manual configuration and restarts.
Automatic ICU rebuilding can still affect downtime; hiding its routine notice
does not imply that operational planning is unnecessary.
Optional compatibility guidance must still be checked before enabling an option;
deferring it assumes an existing application is not adopting the option.

### Stage 2: Changes, Quick tables and Compatibility settings

The four existing registered families were processed from their **actual current
URLs**, in en/fr/de/es/ja: v16 and v17 Quick tables, v18.2 Changes and updates,
and v19 Changes and updates (**20 pages**). Another **25 pages** register the five
Compatibility editions in the distinct `compatibility-settings` family:

| English seed edition | Exact section type + ID | Verified Design Reference parent | en/fr/de/es/ja |
|---|---|---|---|
| [20.1](https://library.4d-japan.com/doc/4Dv20/4D/20.1/Compatibility-page.300-6602324.en.html) | `300-6602324` | `100-6602032` | 5 available |
| [19](https://library.4d-japan.com/doc/4Dv19/4D/19/Compatibility-page.300-5416914.en.html) | `300-5416914` | `100-5416591` | 5 available |
| [18](https://library.4d-japan.com/doc/4Dv18/4D/18/Compatibility-page.300-4575476.en.html) | `300-4575476` | `100-4575411` | 5 available |
| [17.4](https://library.4d-japan.com/doc/4Dv17/4D/17.4/Compatibility-page.300-4880529.en.html) | `300-4880529` | `100-4880454` | 5 available |
| [16.3](https://library.4d-japan.com/doc/4Dv16/4D/16.3/Compatibility-page.300-3670711.en.html) | `300-3670711` | `100-3670638` | 5 available |

These are **five edition families in one source category**, not five new manual
types. The exact localized slugs come from traced archive directory links in
`data/source-locations.json`; every fetched page links its same-language,
same-edition Design Reference parent. No suffix-only paths were guessed.
The current extractor includes bare and nested list items, not merely the first
two or three introductory paragraphs. Not every translation includes every
option or amendment: for example, v18 Spanish lacks the object-notation item,
and French/Japanese v20.1 EOL/BOM prose omits the English/Spanish XML milestone.
Authored translations of supported facts do not imply complete official translations.

The bounded detail set is **BASE64 DECODE** and **Is editing text**, five
languages each. Their actual links in the v19 Changes article omit `/doc/` and
returned genuine 404s. The existing archive directory workflow resolved the exact
type/ID/language documents to available locations; all 10 failed **actual links**
remain `superseded_location` history, distinct from the 34 old guessed probes.
These details confirm invalid Base64 gives empty output and the editing-state
guard's object limits. No unrelated reference crawl or technical PDF completeness
is claimed. Directory refresh now preserves prior same-URL article-link
provenance instead of replacing it with less specific directory discovery.

All **55 Stage 2 pages** were fetched, structurally inspected, and used as evidence
or reconciliation context. [`data/section-audit.json`](data/section-audit.json)
dispositions **every one of their 1,564 extracted blocks** (including nested
context and repeated lead blocks, not 1,564 independent changes). It retains block
IDs, anchors, headings, source hashes, fact IDs and authored reasons without
redistributing snapshots. `systematic_partial` explicitly does **not** mean an
exhaustive manual or linked-reference audit.

| Coherent additions or reconciliations | Evidence boundary |
|---|---|
| Compiler object notation + Unicode method storage | Mandatory for compilation in v19; one feature entity with two atomic requirements, distinct from v20's opened converted-binary rule |
| Compiled v18 Rx projects | Recompile with v19; does not require binary-to-project conversion |
| BLOB argument type checking | Actual compiler error; exact first release remains unknown |
| Range checking | 17 R6 default enabled; `%R-`/`%R+` still supported, `%R*` restores enabled |
| Base64 | Both commands stop setting OK in 18 R4; invalid single-BLOB decode now empties the BLOB, a distinct result-handling task |
| Empty ORDA aggregate results | min/max/average return Undefined instead of Null from 18 R6; three atomic facts, one entity |
| ORDA REST / shareable selections | Explicit `exposed` from 18 R5; `add()` requires alterable selections, with documented conditional alternatives |
| Logs and backup readers | Request-log fields and microseconds at 17 R5; v19 names/columns/ISO times/server suffix grouped together; automatic path moves do not require manual conversion |
| List-box editing clicks | 18 R6 On Clicked/On Double Clicked also fire during input; official editing-state guard retained |
| Write Pro and View Pro | Actual event, date-object, localization, formula-filter, expression-freeze, tab and pagination behavior changes; undated paragraphs stay undated |
| ICU and object indexes | Separate ICU 63.1 and 68.1 rebuilds; latter explicitly 18 R6. Rare object-index issue retains separate 16.4 HF1 / 17.1 / 17 R4 exceptions, not one fabricated major cutoff |
| macOS packaging | Signing requirement and v19 Mac-generated client archives; not opening-failure troubleshooting |
| Compatibility opt-ins/defaults | Object dates 16 R6, XPath 18 R3, text LF/BOM 19 R2 versus XML 19 R3, DirectWrite 19 R3, new-field NULL mapping 19 R4; new versus converted conditions remain explicit |
| Quick-table cumulative rows | Existing IDs/evidence reconciled, architecture columns preserved; OLE Tools has an undated removal record rather than an edition-as-first-removal claim |
| HTTP assignment / legacy networking | HTTP new-database unavailability starts 13.4, with v14 modernization separate; ServerNet's 14 R5 versus v15 source conflict leaves the original deprecation date unresolved |

Compatibility is **not a checklist to turn every option on or off**. Existing
ISO object dates stay unchanged; DirectWrite does not alter already-DirectWrite
list boxes; NULL mapping defaults concern newly created fields. Old form, print,
URL, drag/drop, formula execution, SQL join, nested-transaction, numeric-format
and optional 15 R4 deployment-architecture settings retain explicit
`retained_compatibility` dispositions rather than filler cards. QUIC in the
**20.1 source edition** is beta/evaluation-only, not a production recommendation
or a claim that current v21 QUIC remains beta.

Automatic vertical-operator rewriting, optional Get call chain recompilation,
library enhancements without a documented impact, and preserved binary creation
are not fabricated mandatory fixes. Historical OS minimums are not current
requirements. OCI's intermediate `/usr/local/lib` paragraph remains pending
because its Windows link/platform context is unresolved and macOS OCI is removed
in v19; that workaround is not recommended for the final target.

The Stage 2 snapshot has **27 unknown atomic cutoffs**: the original ten remain, and
17 Stage 2 paragraphs do not establish exact first releases. Unknown platform,
stage or remedy remains explicit where appropriate. At Stage 2 completion, all **192 facts and 119
entities have Unknown remediation complexity**, and **0 have named human review**.
German MailAttachment.path prose is English in the official source; our German
summary is authored, not an official German translation. Modern Release Notes
are processed within the separate bounded Stage 3 scope below.

### Content batch: deprecated/removed editions

The five registered English editions **v16, v17, v18.2, v19 and v20**, and their
20 verified fr/de/es/ja counterparts, were fetched from their existing registry
URLs. The DOM, headings, table cells, narrative lists and actual links were
inspected; **none of these five manual families is claimed exhaustively cataloged**.
The v16/v17 original URLs are landing overviews. Their actual linked
product-range detail pages are now registered and fetched in all five languages
(10 additional sources); their deprecated-command tables are inline in those
detail pages, not separate guessed child URLs. Together with the v18.2/v19/v20
articles these provide **25 partially used evidence sources**. The 10 original
overview pages remain bibliography/structure inspections, not substantive manuals.
The linked Quick tables already have stable `legacy-v16-quick-table` /
`legacy-v17-quick-table` IDs in the distinct Changes/updates family: no duplicate
sources were retained. Stage 1 used ten existing Quick-table URLs **only for
selected 32/64-bit context** (35 evidence sources at that stage): they distinguish legacy/32-bit deprecations
from already-unsupported 64-bit QuickDraw, XSLT, QuickTime, non-Unicode, PICT and
Mac file API behavior. Those source editions are not invented first-removal dates.
Stage 2 supersedes that `limited_context` label with `systematic_partial` and
the full block dispositions above, without inventing first-removal dates.
The Previous documents children are bibliographies; their linked older PDFs
were not fetched or claimed cataloged.

| Completed coherent subset | Distinct records | Exact source threshold |
|---|---:|---|
| Unambiguous v18.2 removed-command rows, including picture/resource/web/XSLT calls | 31 | Formal removal 17 R5 → v18; GRAPH TABLE already disabled v14, as corrected below |
| v19 removed calls: `_o_NO TRACE`, `_o_DISABLE BUTTON`, `_o_ENABLE BUTTON` | 3 | 18 R2 → v19 |
| Every removed bundled PHP module: DOM, Iconv, LibXML, LibXSLT, SimpleXML, GD, XML, XMLreader, XMLwriter, WDDX, Zlib, Zip | 12 | 20 |
| 32-bit distribution, QuickTime, Float fields, non-Unicode mode, PICT, DatabaseOutsidePackage, Windows RTL settings | 7 | 17 R4, 17 R5, or 18, individually evidenced |
| ODBC Pro (all platforms), OCI and ODBC Driver (macOS only) | 3 | 19 |
| Colon identifiers and post-opening binary object-notation compliance | 2 | 19 R4 → v20; 20 |
| PDFCreator, interprocess variables and generic Write Pro break controls | 3 | 20; unknown; 19 R4 → v20 |
| Four supported deprecated Compiler-theme declarations | 4 | Deprecated since 12, not newly removed |
| `GET PICTURE FROM LIBRARY` and `SAVE LIST` in projects; `OBJECT SET FONT` string parameter | 3 | Unknown, not inferred from edition |

Stage 1 additionally covers all individually named deprecated command/constant
rows in these articles, including separate horizontal/vertical scrollbar
operations, `FORM GET PARAMETER` **disabled** in 17 R4, the command-specific
Mac file API dates, supported user-form commands, and the three explicitly dated
mail-protocol families. Other coherent additions cover:

| Added scope | Exact evidence and important limit |
|---|---|
| HTTP automatic variable assignment | v14 modernization; pre-13.4 converted databases retain the compatibility mechanism, not a global removal |
| Numeric standard actions | 16 R3; existing converted forms are transparently remapped |
| Three scheduler selectors / CPU-priority settings UI | 16 R2 for selectors only; UI introduction remains unknown |
| Altura Mac2Win | Windows 64-bit Developer Edition/Volume Desktop at 16 R2; Server at 16 R4, not all products/architectures |
| 4D Pack distribution plus nine remaining routine actions | No longer supplied in 16 R2; per-call replacements or explicitly no replacement, not an invented universal API-disable date |
| `FTP_Progress` and three transfer-command progress parameters | 16 R2; parameter restrictions do not remove the transfer commands themselves |
| Converted subtables, resource-fork/XLIFF migration, explicit `.RSR` opening, legacy networking | Continuing/conditional behavior; original dates remain explicitly unknown |
| 4D Mobile | Deprecated in 18, not a removal of every mobile product |
| Platform-interface calls | Two v12 deprecations; later removal-table compatibility conflict still pending |
| QuickDraw old-toolbox rendering | Conditional GWorld/current-port rule, not a universal support/removal claim |

The 31 v18.2 rows exclude the ambiguous combined platform-interface row.
The two operations in v19's combined enable/disable row are separate atomic
records. Repeated cumulative rows in other editions/languages add evidence,
not duplicate records. The original colon, PDFCreator and DOM IDs are preserved.
Removed-command records explicitly warn that error 33 calls escape syntax
checking and compilation: those are **runtime** removals, not syntax blockers.
The Compiler-theme declarations remain supported deprecations, not compiler
requirements invented from their table category.

The GRAPH TABLE catalog error is a separate confirmed clarification, not a
4D product defect: the v16/v17 details explicitly say **disabled since v14**,
whereas 17 R5 is formal removal. A reasoned final override preserves its stable
ID and both lifecycle facts, classifies the earliest actionable cutoff as a
v14 behavior restriction, and prevents false newly-crossed results for upgrades
starting at v16 or later. All five summaries retain the later removal milestone.

Historical XSLT replacement advice is target-aware: the v18.2 bundled PHP
libxslt workaround is not recommended unchanged for v20, which removes bundled
LibXSLT. The entries distinguish external FastCGI PHP from the bundled
interpreter, and limit `PROCESS 4D TAGS` guidance to text/HTML generation rather
than asserting a general XSLT replacement. Successful opening is the boundary:
the object-notation code/option requirement is separate from the excluded
cannot-open/error -10537 path. Project-only runtime restrictions do not imply
binary-mode removal or compulsory project conversion.

**Explicit remaining bounds and uncertainties** are recorded in
[`data/dispositions.json`](data/dispositions.json), using the existing
pending/out-of-scope workflow:

| Edition/section | Disposition |
|---|---|
| v16/v17 overview children, all five languages | Product-range details processed to the scoped extent described above; Quick tables dispositioned in Stage 2, older bibliographic PDFs are excluded |
| v18.2/v19/v20 deprecated-command rows | All individually named rows covered/reconciled; unenumerated “all Subrecords commands” requires the distinct Language Reference family rather than invented identifiers |
| v18.2 platform-interface removal row | v12 deprecations covered; later removal versus converted-application/Automatic Platform caveat remains unresolved |
| v18.2 project form/structure conversion and compatibility resets | Out of scope as conversion effects; post-opening Toolbox restrictions only partially covered |
| v18.2 QuickDraw font/API sections | Earlier Quick tables resolve deprecated legacy/32-bit versus removed 64-bit context; exact first architecture-specific cutoff remains unknown, no universal removal asserted |
| v18.2 XSLT linked technical PDF | Not fetched; command removals and final-target caveat are cataloged |
| Cumulative user forms, HTTP assignment, Mac file APIs, numeric actions | Scoped records complete; no redundant summary-level candidates added |
| Subtables, resource forks/automatic `.RSR` loading, CPU UI, legacy network | Covered with explicitly unknown original dates and reasoned pending dispositions |
| Summary-only 4D Write/View and OLE_Tools context | Stage 2 adds the documented concrete Write/View changes and an architecture-qualified OLE Tools removal; exact first OLE removal date remains unknown |
| Already-removed 4D Pack routines in the v16 table | No new crossing: “obsolete since” is not a removal date; omitted with explicit dispositions |
| v20 object-notation cannot-open path | Out of scope; contact official 4D Support |

The **four original exact thresholds remain unknown**: interprocess-variable
deprecation, the two project-only calls, and the `OBJECT SET FONT` signature change.
The font rule's detection stage is also unknown; the adjacent v14
`_o_Font name` date does not establish its introduction, and the older detail
prose does not supply it either. Six added candidates also keep unknown dates:
subtable-feature deprecation, resource-fork storage deprecation, automatic `.RSR`
opening, CPU-priority UI, legacy networking, and old-toolbox GWorld drawing.
Their paragraphs/dispositions explain the missing fact; neither Apple's dates
nor neighboring API dates substitute for it. Platforms not stated
by evidence stay **unknown**, as does remediation complexity for **all 276**
records: no reliable difficulty classification was established. Many removed
resource/web calls have no documented replacement in the table; the entries
say so rather than inventing one. Current v21/latest behavior is not independently
verified by these historical pages.

The German PHP section is English within an otherwise localized page. Its
evidence is not presented as German official prose. French command spellings
are anchored to localized rows, while apparent archive typos and the conflicting
font label stay in verbatim evidence rather than becoming invented aliases.
These are pending editorial caveats, not speculative public product-error issues.

The earlier suffix-only probe method was incorrect: translated pages also use
translated slugs. For example, French v20 is
[`Fonctionnalites-obsoletes-ou-supprimees.100-6259787.fr.html`](https://library.4d-japan.com/doc/4Dv20/4D/20/Fonctionnalites-obsoletes-ou-supprimees.100-6259787.fr.html),
not the English slug with `.fr.html`. All 34 failed guesses have now been replaced
with verified linked locations under the same stable source IDs. Their real 404
results remain in `url_history`; they are **not missing translations**. Including
those superseded attempts and the ten actual broken detail links, **244 distinct
registered source URL locations** had been checked through Stage 2 (200 then-current +
34 superseded guessed probes + 10 superseded actual links), separate from archive
directory indexes and the unregistered bibliographic children. The five bounded
Stage 3 derived URLs bring that running total to **249** (205 current + 44
superseded locations), separate from public-latest verification pages.

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

### Stage 3: bounded modern release-note processing

All four original families above were inspected in their **16 actual en/fr/es/ja
pages**, including Highlights, Behavior changes, historical R sections and
library tables. The moving document is beta; its 21 R5-only vector precision,
corner-radius and OpenSSL 4.0.1 changes are **not published requirements**.
The advertised [21 R4 public revision](https://developer.4d.com/docs/21-R4/Notes/updates)
and its own linked French, Spanish and Japanese pages provide a bounded public
pin within the current family. Its OpenSSL row is **4.0 at 21 R4**, not the
moving beta's 4.0.1. The official TLS bulletin is one bounded linked detail,
not a general security or command-manual crawl. The notes' library version rows
without a documented migration consequence remain context, not invented work.

The 80 additions include v21 ICU rebuilding, compiled scalable-session SOAP
thread safety/privileges, legacy web URL and network removal, external component
provisioning for projects versus binaries, PHP's distinct interpreter removal,
command deprecation and settings-page removal, JSON schema validation, formula
class identity, REST entity-set release, exact LTS client minima, TLS/key changes,
zero-based FileHandle offsets, preserved negative times, component distribution,
and the documented form, web-area, logging and language behavior changes.
Repeated cumulative/backport paragraphs add evidence to one stable fact, not a
new entity. Existing ICU 68.1, empty aggregate, colon, NULL-mapping, DirectWrite
and XML-setting facts are reconciled. A new two-member Windows WebView2 group
combines history/progress state handling; all 27 earlier groups retain their IDs,
assignments and original summaries/actions. No mandatory binary-to-project conversion
or universal optional-setting change is inferred.

Every extracted block in the 20 release-note pages and linked bulletin has a
disposition in `data/section-audit.json`: **2,213 blocks**, comprising 443 cataloged
support/context blocks, 400 contextual blocks, 12 automatic-preservation fixes,
1,353 out-of-scope blocks and **five pending blocks**. Those five are two
historical OS/printing caveats repeated across available locales; their final-target
resolution is not established. The combined audit has 100 pending blocks; the
separate editorial disposition register has 70 pending entries, including these
five, not 70 distinct product defects. `systematic_partial` means the bounded
pages were systematically dispositioned, **not** that the whole manual, linked
new-feature posts, fixed-bug lists or all command documentation were processed.
Optional features, automatic fixes, withdrawn/intermediate advice and unresolved
OS printing caveats are separate decisions, not filler migration records.
Official locale completeness is checked per supporting block rather than
assumed from a translated page title. German modern summaries are original
generated candidates with real English evidence fallback, not invented German
public documentation. All facts and entities remain **Unknown complexity,
generated candidates, and 0 named human reviews**.

The two confirmed presentation defects reported during this batch are tracked
in the clarification workflow: cumulative later-edition citations leaked into
historical upgrade paths, and missing localized conditions/rationales exposed
raw English editorial prose. Path-compatible sources and applicable member
evidence are selected before locale preference; only later-edition support is
explicitly unresolved, never silently called path verification. Full original
provenance remains in the catalog. Conditions and action rationales are authored
in all five locales for old and new facts and groups, not translated at runtime.
Original source quotations are never rewritten.

The Stage 3 populated path checks below count eligible feature entities before search,
with both visitor OS choices and all topics selected. Excluded citations count
canonical evidence records across all source languages, before locale preference;
they are retained internally, not displayed under a warning. Unresolved counts
are applicable entities without in-path support, not newly verified requirements.

| Source → final target | Entities | Unresolved / partially supported | Excluded citations |
|---|---:|---:|---:|
| v16 → v21 | 186 | 0 / 0 | 73 |
| v16 → public latest 21 R4 | 195 | 0 / 0 | 107 |
| v17 → v18 | 79 | 10 / 1 | 1,055 |
| v20 → public latest 21 R4 | 110 | 24 / 0 | 1,112 |
| v21 → public latest 21 R4 | 74 | 57 / 0 | 1,415 |
| v21 → v21 | 65 | 58 / 0 | 1,377 |

The v21-to-latest interval includes the documented 21 R3/R4 changes; the equal
v21 interval does not newly cross them. Continuing deprecations and explicitly
unknown cutoffs can remain relevant on either interval. All **27 unknown exact
atomic cutoffs** remain unknown. Twelve PHP module facts have the evidenced
exclusive 20 R3 final-target bound; the exact 20.1 client/server pairing instead
has a target-specific constraint, with no invented 20.2 end date.

### Bounded original KB reference batch

The Tech Note summary repository was used **only to discover originals**, pinned
at revision `396a8ad68aac5dca8749ae30d6e4dd7cbbd649a8`. Its paths/revision remain
separate provenance in [`data/kb-audit.json`](data/kb-audit.json), never published
as evidence URLs. The parent research screened 1,039 titles, found 66 keyword
matches, additionally inspected 216 modern titles, verified 39 original landing
pages and inspected 15 original PDFs. This is **not a full content audit of the
1,039 notes** or a Tech Tip crawl. The integration independently fetched eight
of those landings and their eight ZIP/PDF originals, inspected selected passages,
and used all eight. The other seven research-verified PDFs were not fetched again;
24 other researched landings still have no PDF inspection. All 31 unselected
notes have explicit dispositions in the audit. No document/demo redistribution
permission is inferred from the discovery repository's MIT license.

| Original English KB citation | Actual use |
|---|---|
| [79155: project-mode changes](https://kb.4d.com/assetid=79155) | Standalone Designer identity, empty user BLOB, existing picture-library guidance, and the 19 R6+ remote-development list exception |
| [78951: project lists](https://kb.4d.com/assetid=78951) | Read-only `.4DZ` list persistence and continued loading, not compulsory custom demo methods |
| [79860: Force Login](https://kb.4d.com/assetid=79860) | Existing REST deprecation action: activation through Web settings, exposed authentication and appropriate privileges; editing `roles.json` alone is insufficient |
| [77727: 64-bit labels](https://kb.4d.com/assetid=77727) | Mac-versus-Windows origin of old `.4lb` templates and XML `.4lbp` replacements, after successful database opening |
| [79127: XPath](https://kb.4d.com/assetid=79127) | Existing 18 R3 standard-XPath fact, with the `"/root/test2"` example; not historical v17-to-v18 proof |
| [79456: deployed users/groups](https://kb.4d.com/assetid=79456) | Preserve the active `directory.json` during application replacement; correct host lifecycle and restart, not blind demo timestamp logic |
| [79748: component dependencies](https://kb.4d.com/assetid=79748) | Existing project dependency task: JSON files, compiled-host constraints and restart context; not proof of a new introduction cutoff |
| [79295: interprocess variables](https://kb.4d.com/assetid=79295) | Existing deprecation action explicitly remains optional unless a concrete preemptive/sharing need requires replacement |

The four new singleton facts cover **standalone project identity, project user-BLOB
export, legacy label templates, and preserving deployed project users**. All 272
prior IDs and all 28 groups, 102 memberships and group texts survive unchanged.
Six existing facts gain evidence. Only three existing localization sets receive
explicit protected-field edits: the overly broad list restriction is qualified
in all five languages; REST migration and interprocess-variable records receive
action-only guidance. The audit records each old/new localization fingerprint,
affected fields and source/reason. All other baseline prose, conditions, rationale,
overrides and group fingerprints are unchanged. New authored texts and conditions
are complete in en/fr/de/es/ja, **not official KB translations**. Canonical command
identifiers remain internally searchable; French prose does not invent official
French names for commands absent from the verified bilingual map.

Every citation opens the **original KB landing URL**. Its heading explicitly says
`PDF p. N`; the quotation is from that PDF, not purported landing-page prose.
Separate support metadata binds the original ZIP download, ZIP hash, PDF member
path/hash, physical page, publication date, displayed VERSION and original byline.
No explicit copyright statement was found in the extracted PDF text; that is not
a license grant. `tools.kb` is a small adapter within the existing explicit
ingestion/evidence workflow, not a discovery or model pipeline. `pdftotext` is
needed only when fetching/verifying PDFs, not for offline publication or CI.
Raw HTML/ZIP/PDF and full page extracts stay under ignored `.cache/`.
The list ZIP exceeded the initial 12 MB transport cap and was retried with a
bounded 64 MB ZIP cap; PDFs remain capped at 12 MB and demo contents are never
extracted/executed. Nine note fetch attempts total (eight initial, one retry);
no unavailable selected original, authentication bypass or TLS bypass.

Neither publication date nor VERSION becomes an introduction threshold. The
original 27 unknown cutoffs remain unknown, with four new unknowns (**31 total**).
All 276 facts/202 entities retain Unknown remediation complexity and zero named
human reviews. KB edition context is separate: the project note is conservatively
scoped to its explicitly described 19 R6 context, with its displayed `19` retained;
an unspecified `19 R`/`20 R` edition is usable only when the whole cycle is within
the requested path. Later KB support cannot leak into v17-to-v18, and earlier
manual support is retained. Evidence still uses only the current UI language,
otherwise English fallback, after path selection. Source quotations stay English.

| Current source → final target | Entities | Unresolved / partially supported |
|---|---:|---:|
| v16 → v21 | 190 | 0 / 0 |
| v16 → public latest 21 R4 | 199 | 0 / 0 |
| v17 → v18 | 83 | 14 / 1 |
| v20 → public latest 21 R4 | 114 | 23 / 0 |
| v21 → public latest 21 R4 | 78 | 61 / 0 |
| v21 → v21 | 69 | 62 / 0 |

These are relevance counts, not newly verified requirements. New KB-only facts
remain explicitly unresolved on incompatible paths rather than borrowing later
evidence. The existing 76-page/3,777-block Stage 2/3 audit and its pending entries
are unchanged; the KB audit is separate, not eight exhaustively dispositioned
manuals. The note's erroneous transparency/radio-group sentence is excluded.
No superficial ServerNet, ICU, QUIC, FileHandle-offset or declaration-removal
citations were added. Historical notarization/Write bridges and optional debt
tools remain bounded dispositions, not new filler requirements. Current authored
baseline guards are implemented; the local generative authoring requirement
is retired as described below.

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
catalog additions in this batch use only the deprecated/removed article family,
with zero human-reviewed changes.

Fetching or extracting a document does **not** mean its changes were all cataloged.
The remaining available pages, additional compiler requirements,
conversion-guide child pages, historical deduplication/alignment, and broader
version/platform coverage still need editorial processing. Unresolved localized
locations are not guessed or silently replaced with English. No results never means an upgrade
has no issues. These audit counts and source statuses remain in repository data
and this documentation, rather than in the visitor interface.

The verified **latest public feature release** is **4D 21 R4**, released
2026-10-12, checked 2026-10-26 against the
[official download page](https://us.4d.com/product-download) and
[release announcement](https://blog.4d.com/4d-21-r4-is-here/).
It is distinct from the LTS channel. Account-only hotfixes/builds were not checked.
`data/latest.json` preserves evidence and verification date: “latest” is a
publication snapshot, not a live promise.

## Run, validate, publish

Requirements: Python 3.12+ and Node 22+. The optional browser encoder runtime is
bundled from pinned npm dependencies; ordinary validation does not run a model.

```sh
npm ci
npm run build:search-runtime
python3 -m tools.publish
python3 -m unittest discover -s tests -v
node --test site/logic.test.mjs
python3 -m http.server 8000 --bind 127.0.0.1 --directory _site
```

Open `http://127.0.0.1:8000/`. Use HTTP, not `file://`, because the app fetches its
local published JSON. App/asset/data URLs are relative and support `/migration/`
or another GitHub Pages subpath. There is no service worker/offline-install claim;
keyword search requires no model or network after the page and local assets have
loaded. Semantic search downloads its pinned model automatically after checking
WebGPU support, with visible loading progress and Cache Storage reuse.

`.github/workflows/pages.yml` builds and validates pull requests without fetching
sources. Pushes to `main` deploy the `_site/` artifact using GitHub Pages Actions.
Select **Settings → Pages → Source → GitHub Actions** before the first deployment.
Opening this foundation PR does not merge or deploy it. Generated `site/data/`
and `_site/` are ignored and rebuilt from the committed editorial inputs.
The Python publisher generates a content-derived release directory for modules,
CSS, SVG and catalog JSON, then points the root HTML at that release. Any runtime
file change changes the whole release URL namespace; native module imports and
catalog fetches stay within it. This prevents new markup from reusing fresh but
incompatible modules at a previous release's stable URLs. No manual cache-query
bump, runtime dependency or service worker is needed. Serve `site/` only for
source development; publish `_site/`, not the unversioned source directory.

## Architecture and data contract

| Path | Role |
|---|---|
| `data/sources.json` | Independent, extensible seed registry: stable ID, family, edition, URL |
| `data/registry.json` | Checked sources, language, publisher/authority, discovery provenance, fetch dates, HTTP/redirect status, resolved URL and SHA-256 |
| `data/source-locations.json` | Verified translated document locations, archive link chains or official documentation hreflang/hash provenance; unresolved discovery is explicit |
| `data/archive-navigation.json` | Bounded index-fetch provenance and hashes; these navigation pages are not catalog sources |
| `data/discoveries.json` | Actual bounded `hreflang` discoveries pending/accepted review |
| `data/changes.json` | Atomic editorial facts with stable IDs, exact member-level conditions and evidence |
| `data/groups.json` | Explicit feature/remediation membership and independently authored five-language entity summaries/actions |
| `data/overrides.json` | Manual, reasoned patches applied last; ingestion never rewrites them |
| `data/glossary.json` | Concept/edition-aligned official wording and evidence-bound English/French command-name mappings; unknowns explicit |
| `data/dispositions.json` | Explicit exclusions and pending editorial questions, not confirmed public errors |
| `data/section-audit.json` | Stage 2/3 block-by-block scope decisions and exact snapshot provenance; not exhaustive manual coverage |
| `data/kb-audit.json` | Bounded KB discovery/research counts, original PDF provenance, selected-note uses, exclusions and reasoned protected-field edits |
| `data/clarifications.json` | Curated confirmed-error register with evidence and dispositions |
| `data/latest.json` | Evidence-backed concrete feature-release resolution |
| `data/semantic-search.json` | Automatic text encoder, immutable revisions, runtime and retrieval contract |
| `data/search/` | Five precomputed atomic-fact vector indexes and corpus/model/checksum provenance |
| `tools/ingest.py` | Incremental fetching, structural extraction and local review diffs |
| `tools/kb.py` | Original KB landing/ZIP-PDF adapter; physical-page evidence and ignored original-document caches |
| `tools/discover_docs.py` | Four-seed bounded modern discovery/fetch, plus an explicitly requested advertised public revision; actual locale links only |
| `tools/catalog.py` | Fail-fast schema/domain validation, ID deduplication, overrides and deterministic publication |
| `tools/publish.py` | Content-addressed, release-coherent static Pages artifact |
| `site/` | One shared multilingual app; no on-demand classification or translation |

Each atomic fact describes an actionable change, not a whole release note.
Visitors see **one entity per coherent feature/remediation task**, not one card
per command/module. Editorially assigned `chg-*` atomic IDs survive revised prose,
source editions, translations and grouping.
Repeated entries use the same ID and merge distinct evidence; conflicting
classification under the same ID stops publication for editorial resolution.
Multiple supporting sources are allowed. Do not derive IDs from mutable text.

Build order is atomic deduplication → reasoned final overrides → explicit entity
grouping. Every atomic fact belongs to exactly one published entity; grouped
entities retain ordered `member_ids`, full `members`, unioned identifiers/evidence
and all member-level conditions/provenance. Group IDs are separate stable IDs,
not replacements for atomic history. Publication rejects duplicate membership,
unknown IDs, or mixed exact cutoffs/backport alternatives, validity bounds, type, stage, severity, platform, format,
review state or complexity. Similar prose alone does not establish a group.
Differing cutoffs or deprecation/removal status remain separate entities.
All group line/paragraph/action texts are authored in en/fr/de/es/ja, candidate
status stays honest, and difficulty remains Unknown. Search includes individual
member IDs, canonical/localized identifiers, member prose and evidence, but the
existing interface renders only one ordinary card for each resulting entity.

Records keep relevance **with a reason**, exact threshold, normalized bucket,
independent source edition, platform (including unknown), extensible module
labels, change type, criticality, stage, format/conditional applicability,
action and its basis, short evidence excerpts/headings/anchors/block IDs/source
hashes, confidence, and review status. Stages are syntax, compilation, runtime,
modernization; criticality is classified separately from stage.
Unknown thresholds use `{"exact": null, "bucket": null, "kind": "unknown"}`;
unknown actions use `null` plus an explanatory `action_basis`. Unknown
stage/criticality/platform values are explicit, never silently inferred.

Visitor-facing prose lives in each `localizations[language]`: `conditions`,
`action`, and, when a rationale exists, `action_basis`, as well as line/paragraph
summaries and display identifiers. Raw structured conditions/reasons remain
internal editorial metadata. Validation rejects absent localized fields rather
than rendering raw English as if localized. Reasoned overrides apply before
grouping; grouped localizations carry their independently authored conditions
and rationale. Invariant APIs stay unchanged, French command prose uses verified
French names only, and the other four modes use English command names only.

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
`threshold.alternatives` preserves exact branch backports (patch, HF and build
identity included) in one canonical fact. Build numbers are never compared
across branches. A **major-only selector is coarse**: v20 does not prove 20.3
or 20.7 HF2 is already installed. Same-major patch changes are conservatively
included with conditional instructions, while later R cycles are not treated
as already present in the major baseline. Thus v21 → latest 21 R4 includes
21 R3, v21 → v21 does not, and 21 R5 beta is capped out by public latest.

`applies_until` is an **exclusive final-target** release bound, not an
intermediate traversal instruction. The twelve bundled-PHP-module facts retain
their v20 evidence and IDs but expire at 20 R3, where the separate whole internal
interpreter removal supersedes that narrower remedy. Do not force module-level
intermediate work at a later final target. Group compatibility includes bounds.
The platform selector contains only
**Windows** and **macOS**. Unknown/missing platform applicability remains internal
and eligible whenever either OS is selected, without inventing platform evidence.
There are no Linux or Unknown platform checkboxes. No current fact is Linux-only;
future Linux-only facts would remain in provenance but not match these supported
visitor platform choices. Source mentions and CI runner operating systems are unchanged.
The Topics filter labels its internal `unknown` category **Other** (Autres /
Sonstige / Otros / その他); severity, complexity and factual uncertainty retain
their Unknown labels. Unchecking all platforms or topics means no matches.
Group Select all / Unselect all and Reset
filters never change versions or language/theme. The version pair is visually
primary, with the supplied 4D icon colored by version and explicit direction/text.
Latest uses its resolved concrete major's color, not an invented next version.

Sort choices are **Severity** (highest first, unknown last; default) and
**Complexity** (Simple → Moderate → Complex → Unknown). Complexity is the
difficulty of applying documented remediation, independent of severity or stage,
not comprehension difficulty or an effort estimate. Severity ties use stable ID;
complexity ties use severity then stable ID. All 276 facts and 202 entities remain Unknown.
The optional schema-v1 `complexity` object has a typed `level`; known levels
require a documented `basis` and `evidence_source_ids` referencing the record's
evidence. Missing metadata means unknown; validators reject unsupported or
unsubstantiated known classifications. See [UI details](site/README.md).

Technical coverage, provenance and clarification dashboards are not visitor
navigation. Each change retains localized summaries and evidence, with concise
actionable caveats for unchecked text or unavailable sources. No planner features
are present. Deprecation is not removal. The historical content batch does not
independently verify behavior in every later release.

## Reproducible ingestion and editorial updates

Source ingestion network access is an explicit **publication-time** operation,
separate from automatic browser model downloads:

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
# Selected original KB note and its linked ZIP/PDF (requires pdftotext)
python3 -m tools.ingest --transport curl --id kb-78951-en
# Fetch only four modern seeds and their actual linked app-language counterparts
python3 -m tools.discover_docs --transport curl
# Also refresh the exact publicly advertised revision, English before its locales
python3 -m tools.discover_docs --transport curl --public-release "21 R4"
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
table cells with header context, code blocks, bare/nested list lead text, anchors and resolved
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

Linked legacy detail sources additionally record the actual parent source ID,
same-locale/same-edition route, document key and parent hash. Live evidence
verification checks that the URL is really present in the parent's cached links.
Legacy list extraction works inside archive layout tables, preserves existing
paragraph/table/code block IDs, and deduplicates exact repeated blocks (including
an actual duplicated German user-form row); it does not flatten a whole manual.

Only actual blog `hreflang` links are queued, never invented blog translations.
Modern Release Notes discovery is separately bounded to four configured English
seeds (16 actual URLs) and an explicitly requested, actually advertised public
revision (four further URLs). One manually registered, actually linked official
TLS bulletin clarifies the branch fixes. This is not an automatic article,
other-version, Portuguese or command-detail crawl.
Legacy archive discovery skips modern seeds and preserves
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
The repository preserves three resolved clarifications: translated-slug discovery,
GRAPH TABLE's earlier disabling, and path-scoped evidence/localized applicability.
These are catalog corrections, not 4D
product defects; resolution does not mean human content review. Clarification
notices remain attached to affected facts/entities, without adding a visitor
dashboard or live API access. Model
suspicions go to an editorial queue first; never automatically post them as
established 4D bugs. Official support is separate.

### Editorial updates; local generative authoring retired

**The local generative authoring requirement is cancelled for now.** Updates are
infrequent, and the measured factual/multilingual unreliability and human review
cost of the tested Qwen3-4B-Instruct-2507 and Gemma 4 E4B configurations do not
justify a production authoring pipeline. This is a decision about those tested
configurations and this project's needs, not a claim about all local LLMs.
[Draft PR #15](https://github.com/miyako/migration/pull/15) preserves the
**historical experiments and results**; it is unmerged, and its experimental
tools are not shipped here.

Occasional updates may use agent/frontier-assisted authoring with human review.
Only approved content proceeds through deterministic GitHub Actions validation
and publication; deterministic navigation/catalog index builds are distinct
from the separately controlled semantic-vector rebuild described below.
Optional source-change detection may flag editorial attention only, never
automatically rewrite content. There is no unattended generative authoring or
blanket regeneration. The existing browser-local EmbeddingGemma 2 semantic
search remains unchanged: an embedder is not a generator and does not author
or modify catalog content.

**The version-controlled authored catalog is the authoritative baseline**, not
disposable output to regenerate after a model change. This includes
existing frontier/agent-authored summaries, translations, conditions and action
rationales, as well as curated groups and corrections. Model, tokenizer, prompt
or schema revisions must not invalidate that authored text or its assignments.
Editors should scope source additions or substantive evidence changes to
reviewable patches **only for affected facts, locales and fields**. A corroborating
URL, retrieval timestamp, HTML-only formatting change or override-only edit must not
rewrite summaries or translations. Any assisted revision requires an explicit,
narrowly scoped editorial decision and human review; it must never silently
replace the catalog.

`data/groups.json` is a durable editorial contract: stable group IDs, active
member assignments and all authored language fields survive candidate/model
changes. Editorial updates may propose **new** assignments in a reviewable diff;
uncertain new facts stay singleton candidates pending review. Do not dissolve/rebuild
groups, merge by similarity or overwrite group prose after a model revision.
Only an explicit reasoned editorial change may alter an established assignment.
Assisted proposals and curated content need separate provenance. Threshold,
status, remediation, platform, format and validity-bound compatibility guards,
unique active membership, stable IDs and no-dropped-fact checks still apply.
The fixed curated-group fixture and synthetic candidate-swap tests guard current
deterministic behavior; they are **not an implemented inference pipeline**.

Retain provenance and stable source IDs to distinguish authored baseline from
new proposals. Source removal must flag stale support and affected review/exclusion
explicitly, retaining provenance and
remaining independent support; it must not erase or retranslate unrelated text.
Human corrections and overrides are strongest and always win. Current schema,
committed baseline fixtures, final overrides and deterministic grouping provide
storage/validation safeguards only, not a promise of future generative tooling.
Editors must remove unsupported published claims while preserving historical
provenance and any independently supported multi-source facts. Deterministic
validation remains mandatory.

The site is a quick directory, not a planner: no completion checkboxes, editable
notes, effort estimates, or planner JSON import/export. Only language/theme
preferences persist under `4d-migration-preferences-v1`; storage errors are shown
explicitly. Retired checklist storage is ignored, not read, migrated, overwritten
or cleared. Unrelated browser preferences remain untouched.
Do not put credentials, customer source, private support material or personal
notes in catalog commits or public issues.

## Automatic local semantic search

Keyword/exact identifier search needs **no model download** and remains available
throughout loading or failure. Semantic search loads automatically once per page
after the catalog and a successful WebGPU capability check, without a visitor
checkbox or confirmation. Real per-file download progress (indeterminate when
the size is unknown), ready, unavailable and actionable error states are localized
in all five UI languages. When ready, it searches the current text and language,
including edits made during loading. Locale, theme and filter changes do not
reload the model; explicit Retry is available only after failure. Semantic
search is implemented using the **270M text/code component of EmbeddingGemma 2**,
not the original 300M EmbeddingGemma or the full 740M multimodal model.

**Exact model contract.** The [official card](https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2)
and [Google checkpoint](https://huggingface.co/google/embeddinggemma-2/tree/914f7f89142e33e77833254d9c9b90c3cef7303b)
declare Apache-2.0. Upstream revision is
`914f7f89142e33e77833254d9c9b90c3cef7303b`; the actual public, ungated
[ONNX export](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX/tree/daa72c51243991dfcaf9f9137d2c573d8f7790c0)
is pinned to `daa72c51243991dfcaf9f9137d2c573d8f7790c0`.
Only `model_q4.onnx` and its external text weights are loaded, with
`vision_config` and `audio_config` removed before model construction.
No vision/audio encoder, generator, translation or regrouping pipeline is used.
The matching BPE tokenizer inserts BOS=2 and EOS=1. Queries use
`task: search result | query: `; documents use the localized one-line title,
paragraph, identifiers and action. Both use at most 512 tokens, the exported
attention-mask mean-pooled `sentence_embedding`, all 768 dimensions and explicit
L2 normalization. q4 uses float32 activations, not fp16. Transformers.js `4.3.1`,
ONNX Runtime Web `1.31.0-dev.20260914-8d85527a0`, and transitive dependencies are
locked in `package-lock.json`. The URL template is pinned as well as `revision`:
4.3.1's tokenizer metadata probe otherwise queries `main`.

**Corpus and filtering.** Five locale indexes cover the same 276 stable atomic
IDs. No authored text, source, translation, grouping or evidence is regenerated.
Model/tokenizer SHA-256s, corpus fingerprints, IDs, vector checksums and
configuration are recorded in `data/search/manifest.json`. Offline publication
rejects stale/mismatched/nonfinite/unnormalized vectors. Document embeddings are
computed locally with the same JS model/tokenizer and q4 export, using Node CPU;
browser queries use WebGPU. Matching scores are rolled up only from a group's
actual path-eligible members. Version/citation projection and platform/topic
eligibility precede semantic inclusion. Keyword/identifier matches are always
retained; other eligible entities must reach cosine **0.74**. There is no top-N
cutoff or invisible semantic ordering: Severity or Complexity still orders every
visible card. Empty query, clear and reset retain normal directory
behavior; empty checkbox sets still produce none. While inference is pending,
the status explicitly says that keyword results are being shown.

**Measured quality, 2026-10-27.** `tests/fixtures/semantic-retrieval.json` contains
40 catalog-grounded cases with stable expected IDs and rationales: 30 positive
paraphrases (six per language) and ten negative/near-miss cases. These are
editorial assertions grounded in the catalog, not relevance labels emitted by
the encoder or independently human-reviewed judgments. Related translations
and overlapping concepts make this a small engineering check, not an independent
benchmark. The split is 15 positives + five negatives each for development and
holdout. Diagnostic semantic top-five retrieval includes the expected entity
in **30/30**, versus **0/30** for full-query lexical matching. This baseline is
deliberately paraphrase-heavy; exact-alias regression tests separately protect
keyword strengths. At threshold 0.74, the actual hybrid filter includes
**26/30** expected entities (en 6/6, fr 6/6, de 5/6, es 4/6, ja 5/6).
All 26 are also within the first five displayed hybrid results under the
default Severity order, not merely somewhere in the matching set.
Development: 12/15 positives, 0/5 negatives matched; holdout: 14/15 positives,
1/5 negatives matched. The threshold was raised from 0.70, whose broader filter
matched all positives but also eight of ten negatives, to favor fewer unrelated
cards. No language-specific threshold or hand-written query special case is used.

Inspected misses are empty-selection aggregates in German/Spanish/Japanese
(scores 0.7381/0.7250/0.7260) and Spanish macOS text LF behavior (0.7229).
The remaining near-miss is a Japanese archive-encryption question retrieving the
related Mac client archive-build card, which does **not** answer encryption.
Another short Japanese PHP paraphrase tried during browser work scored below
the filter threshold. Thus "no results" is not proof of no migration issue;
exact commands or simpler wording can help. A related card is not an answer or
a new claim: original summaries, applicability and citations remain authoritative.

**Actual browser/resource evidence.** Tested on an Apple M1 Pro / 16 GB,
macOS 26.7, Chrome 155.0.8059.85. Public unauthenticated HTTPS downloads and
GitHub Pages-origin CORS were verified. The five model/tokenizer files total
**206,696,682 bytes**, including **174,519,542 bytes** for q4 text graph+weights.
The observed browser runtime path adds **27,460,856 bytes**, plus a
**847,872-byte** locale index and the small manifest: about **236 MB** initially,
not 175 MB total. Weights stay on the immutable Hugging Face/CDN URLs, not in
Git or a Pages file. All Pages runtime files are below 100 MB.

Two cold public download/load runs took **19.3–33.8 s**; cached model reload with
Hugging Face blocked took **1.26–1.49 s**. Complete UI queries measured
**457–488 ms** first and **335–346 ms** warm, including the 250 ms debounce.
Five representative local query computations in warmed browser workers took
about **65–94 ms**. CPU/browser vector cosines were above **0.9999999**, with
maximum absolute component difference **1.8e-7**, across all five languages.
Sampled Chrome browser/renderer/GPU-process RSS was about **1.7 GB** for one
loaded model and first query (up to **2.2 GB** on another run), and **3.5 GB** peak in the test that temporarily
holds two models for parity. This is a rough process aggregate, not isolated
model allocation or an exact GPU-memory measurement. Mobile memory/performance,
other GPU vendors and Firefox have not been established.

**WebGPU is required for this export.** Actual Chrome WASM session creation
fails with `Could not find an implementation for GatherBlockQuantized(1)`
at `/model/embed_tokens/Gather_Quant`; the q8 graph uses the same operator.
WebKit 26.0 on this machine exposes no WebGPU; the real browser check confirms
the explicit unavailable message and functioning lexical directory. This is
not a claim of Safari semantic support. There is no silent model substitution
or pretend WASM fallback. Network, model/index and resource failures have
localized manual-retry guidance and preserve keyword results, never a semantic
success status. Loading/query deadlines and worker termination bound stalled
work. There are no automatic retry loops. Leaving the page terminates the worker;
restoring a page from the back/forward cache starts a new worker.

Cache Storage successfully retained the five immutable model files and a new
worker queried successfully with their network blocked. This verifies **model
cache reuse**, not a fully offline site: Pages HTML/runtime retention and browser
cache quota/eviction remain outside that guarantee. Model revisions select new
URLs; corpus/runtime changes select new `assets/<sha256>/` namespaces. No
service worker or automatic cache deletion is introduced. Network traces during
queries contain no inference requests; external GETs are model/tokenizer
downloads only, with no query or catalog contents sent to a service.

Reproduce without source ingestion or text regeneration:

```sh
npm ci
npm run build:search-runtime
python3 -m tools.catalog
# Explicit manual local inference only; downloads checksum-verified text artifacts:
npm run build:search-index
python3 -m tools.catalog
npm run evaluate:search -- .cache/search-evaluation.json
node --test site/logic.test.mjs site/semantic.test.mjs
python3 -m unittest discover -s tests
python3 -m tools.publish
node tests/semantic-browser.mjs
```

Index generation is **not** run by ordinary CI. Committed vectors permit offline,
deterministic catalog/contract validation; npm installs and the runtime bundler
need no model inference. `SEARCH_MODEL_PATH=/absolute/verified/model/directory/`
can reuse a local download for builds/evaluation/browser checks.
An explicit local CPU rebuild reproduced all five vector files byte-for-byte;
one run took 298 s with about 710 MB maximum Node process RSS.
The index builder assembles fresh, schema-validated authored records directly,
not a potentially stale `site/data/catalog.json`; it can therefore rebuild after
an intentional content edit even when publication correctly rejects old vectors.
`SEARCH_BROWSER_LOCAL=1` redirects only pinned model downloads to checksum-verified
local bytes while still running actual WebGPU inference; default browser tests
exercise real public downloads. An installed Chrome is used;
`WEBKIT_EXECUTABLE_PATH` can select an available Playwright WebKit launcher.
The automatic-loading regression checks first-visit progress, edits and locale
changes during loading, current-query inference on readiness, one worker across
renders, localized errors/manual retry, and cached reload with model networking
blocked. Unsupported-browser checks assert that neither runtime nor weights are
requested; the separate keyword/browser suite retains its network-failure checks
in a deliberately WebGPU-unavailable context.
No scheduled workflow or external inference endpoint is added. A later
on-demand Actions index job remains separate work.

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

# Local authoring: bounded, review-only prototype

This **manual developer-machine tool** makes candidate decisions and draft prose,
not verified facts. It is not part of the website, embedding encoder, ingestion,
publication build, or a scheduled workflow. **One successful example is not
evidence that the model makes reliable migration decisions or translations.**
The held-out failures below are important limitations, not successful refusals
by a factual-entailment checker.

## Reliability follow-up

The original `dcdbb22` four-case capture is retained unchanged in
`tests/fixtures/authoring-model-run.json`. The follow-up freezes its exact inputs
plus six predeclared cases in `authoring-evaluation-cases.json`; the separate
`authoring-reserve-cases.json` was declared before the final decoding experiment.
Expectations are source-based evaluation data, **never prompts**. Input hashes,
actual outcomes and candid source-inspection assessments are recorded in
`authoring-reliability-results.json`. There is no model-as-judge service.

The active pipeline now separates change-type classification, exact supporting
quote selection, explicitly dated release selection and action/modality selection.
Short `E1` references cannot smuggle a source edition into a claim. Insufficient
evidence returns a structured `insufficient` decision and **no prose or patch**;
this is a correct task outcome only when the source-based expectation agrees.
Specific/action/threshold references are independently bound to the exact input
quotes and immutable citation keys. Type is a proposal; severity, platform and
complexity remain explicitly unknown.

English authoring then runs separately from translation. Each target locale has
a focused title request followed by a body request. Protected-token lists contain
only tokens actually present in those fields; absent tokens must not be added.
Prose citations are attached deterministically to the supplied bounded evidence,
not rediscovered by a translator. This establishes reference identity, **not
factual entailment**. Optional-action checks reject English mandatory wording.
Japanese checks now also reject isolated untranslated descriptive English words,
not just multiword phrases. English fields cannot silently echo Japanese prose
from Japanese evidence. These are narrow script/word heuristics, not complete
language identification. A refusal at one field cannot silently become an empty
successful translation.

First-release uncertainty is explicitly composed using fixed, localized editorial
sentences. Unknown-remedy action/rationale sentences are likewise schema-constrained
editorial text in all five locales. These sentences are **not claimed as model
generation** or a substantive source fact. The raw generated bodies remain intact
in the run records; composition does not rewrite a bad factual sentence into a
good one. This reduces an avoidable instruction-following burden without relaxing
the version, citation, command or field/precondition checks.

Explicit first-release cues now recognize French `depuis`, Japanese `以降` and
corresponding supported English/German/Spanish cues; source editions alone still
do not establish a cutoff. Cue coverage is not exhaustive. Action candidate
selection is also deliberately bounded: positive English/French/Japanese
instruction cues are eligible; a negative "not recommended" is not silently
promoted into a positive replacement instruction. Unrecognized or ambiguous
wording remains a limitation rather than an invented mandatory remedy.

The single higher-precision alternative used the **same 4B model/revision**:
`Qwen3-4B-Instruct-2507-Q8_0.gguf`, 4,280,405,600 bytes, SHA-256
`391c1e410fd9f4cf2de2b510273b56a84c19ce18f4fa3bfb3774031dac4ef068`.
It was public/ungated, Apache-2.0, downloaded and verified, and actually executed
with the pinned native runtime. It did not improve development completion over
the decomposed Q4 protocol: one generated draft, one correct insufficient decision,
two task failures. The four-case run took 74.87 seconds with about 5.95 GB maximum
RSS. Q4 remains the default; no architecture/model sweep or external inference
was used.

The exact upstream revision's model card recommends temperature 0.7, top-p 0.8,
top-k 20 and min-p 0. One real, fixed-seed experiment tested those settings.
It did not solve untranslated Japanese or optional-guard semantic distortion.
The best measured earlier protocol was selected instead of shipping that
regression; default decoding remains the committed greedy configuration. Neither
the precision nor sampling experiment is presented as a head-to-head benchmark
of every final pipeline variant.

Manual evaluation is explicit and never invoked by CI:

```sh
python3 -m tools.authoring_evaluate --label unique-experiment-name
python3 -m tools.authoring_evaluate --label unique-reserve-name \
  --definitions tests/fixtures/authoring-reserve-cases.json
```

Labels cannot overwrite a previous experiment. Each evaluation saves frozen
definitions/input/config/code fingerprints, per-case status/latency, complete
results and run-directory references under `.cache/authoring/evaluations/`.
Matching expected machine decision fields is not a semantic/translation pass.
Use the source-based expectations to inspect every generated field in every
locale, including optionality and affected input types. Failed development
iterations and valid-but-wrong bodies remain part of the record.

The six expansion cases were declared before tuning but were subsequently
inspected during development; they are **not an untouched final test set**.
The four reserve inputs were declared before the sampling experiment and first
executed after protocol selection. Their failures were not used for prompt/model
tuning. Repeated verification is not another independent generalization trial.

### Measured outcome, not publication readiness

| Frozen suite | Reproduced `dcdbb22` baseline | Selected protocol, final native verification |
|---|---|---|
| Original four | 1 draft, 0 correct insufficient, 3 failures | 1 draft, 1 correct insufficient, 2 failures |
| Six expansion cases | 1 draft, 1 correct insufficient, 4 failures | 1 draft, 2 correct insufficient, 3 failures |
| Ten-case total | **3/10 completed tasks** | **5/10 completed tasks**: 2 drafts + 3 correct insufficient |
| Fresh four-case reserve | Not used for baseline/tuning | **2/4 completed tasks**: 1 draft + 1 correct insufficient, 2 failures |

The original Base64 behavior and the reserve OK-variable behavior produced
five-locale, 25-field proposals. The material-delta case repeats Base64 and
**is not an independent generative-quality success**. Insufficient introduction,
negative requirement, irrelevant lead-in and recommendation-only inputs correctly
produced no prose or patch. The improvement is principally evidence decisions
and reduced instruction-following burden, **not broadly reliable prose**.

The final ten-case native run took **163.95 s**, maximum RSS **4,079,026,176
bytes**; the reserve took **56.53 s**, maximum RSS **4,066,869,248 bytes**.
These `/usr/bin/time -l` process-tree measurements are approximate, not precise
unified-memory accounting. Base64 took **26.82 s** versus initial observed
56-74 s; this is a small fixture observation, not a standardized speed benchmark.
All **96** final native responses were parseable and schema-shaped; **16 stage
attempts were refused**. Neither statistic measures semantic accuracy.

Remaining failures are deliberately not hidden:

| Case | Source inspection and actual refusal |
|---|---|
| Unknown command detail | Release/remedy now correctly unknown; Japanese title still retains `Invalid` on both attempts. |
| Optional list-box guard | Optional action extraction improves, but English still says the handler **must** check. Literal `optional`/`E1` action/rationale are not useful prose. The numeric-reference guard stopped it; that guard did not prove the semantic distortion. |
| French restriction | Correct restriction/19 R4 extraction. Japanese uses `3項演算子` for “ternary operator”; the digit-only support heuristic rejects `3`. This is a **validator false positive**, not evidence that the translation invented a cutoff. No complete proposal is produced. |
| Japanese events | Correct behavior-change/18 R6 extraction, but English authoring echoes Japanese on both attempts. The explicit English-script guard now catches that actual localization failure, rather than a later German-title rule. |
| Undated deprecation | Appropriate deprecation/unknown-release decision, awkward English and an English title copied into German. |
| Reserve French PDFCreator | Incorrect restriction type, missed explicit `à partir de 4D v20`, and “no longer supports/replaced” instead of deprecated. Wrong-locale constant alias is the observed guard refusal, not verification of those semantic errors. |
| Reserve empty aggregates | Functional Undefined-versus-Null meaning is correct, but `prior to v18 R6` is not recognized as a cutoff and the paragraph omits exact `entitySelection`. Identifier refusal is not proof the functional summary is false. |

Accepted drafts also need editing: Base64 Spanish says `el entrada`; OK-variable
French/German/Japanese phrasing is awkward, including Japanese wording closer
to “not further changed” than “no longer changed.” No output has named human
review. Platform, severity/criticality and complexity remain deliberately unknown;
these runs do not establish extraction accuracy for known values. Numeric/cue/
language heuristics have both false positives and false negatives. The bounds
were not relaxed to turn failures into successful authoring.

`tests/fixtures/authoring-reliability-results.json` is the readable per-case
assessment and timing report. `authoring-reliability-native.json.gz` is a
lossless, checksum-pinned archive of **13 experiments / 76 unique runs**,
including intermediate failures, exact requests/configs, raw bodies, stage
refusals/timings, runtime/template metadata and accepted proposals. It contains
no weights or executables. The unselected 4B Q8 weight was checksum-verified and
removed after evaluation; its provenance and raw experiment records remain.
Inspect a complete actual run without inference:

```sh
python3 - <<'PY'
import gzip, json
with gzip.open("tests/fixtures/authoring-reliability-native.json.gz", "rt") as f:
    capture = json.load(f)
evaluation = capture["evaluations"]["reliability-verified"]
case = next(c for c in evaluation["outcomes"] if c["name"] == "base64")
print(json.dumps(capture["runs"][case["run"]], ensure_ascii=False, indent=2))
PY
```

Final local regression commands were the offline authoring suites (**45 tests**),
full Python discovery (**157 tests, 9 existing skips**), search-runtime build,
`npm test` (**48 tests**), `python3 -m tools.publish`, and `git diff --check`.
Actual CLI cache revalidation, matching proposal preconditions and unchanged-input
`no_material_change` were also exercised. Protected catalog/site/search/workflow/
package files and the original authored/curated/model-run fixtures are unchanged.

## Pinned dependencies and setup

Requires Python 3.12 and **macOS arm64**. The initial implementation deliberately
does not substitute an unverified runtime on other platforms. No Python packages
are needed. Inspect `tools/authoring-config.json` before explicitly downloading:

```sh
python3 -m tools.authoring setup --download
```

This downloads public dependencies only; no repository content, source excerpts,
prompts, credentials or telemetry are sent to a third-party inference endpoint.
Downloads may follow the publishers' artifact/CDN redirects. Inference does not.

| Component | Immutable pin |
|---|---|
| Community GGUF | `unsloth/Qwen3-4B-Instruct-2507-GGUF` at `a06e946bb6b655725eafa393f4a9745d460374c9` |
| Artifact | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, 2,497,281,120 bytes |
| SHA-256 | `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597` |
| Upstream model | `Qwen/Qwen3-4B-Instruct-2507` at `cdbee75f17c01a7cc42f958dc650907174af0554` |
| Model license/access | Apache-2.0, public and ungated when checked |
| Native runtime | `ggml-org/llama.cpp`, `b11910`, commit `63b4b303bd87456adc2f09d56c7e1f74e9e26673`, MIT |
| Runtime archive | `llama-b11910-bin-macos-arm64.tar.gz`, 16,295,423 bytes |
| Archive SHA-256 | `457f53b710cbdd65ce4e662d4e1aa49accee700110e99a5a49a818d47fc9152f` |
| Embedded template SHA-256 observed | `c979e0e71a3e21b8f208e6ab120d5cb29327885f29d2a8b18fda67a723798e18` |

The immutable GGUF pins the actual tokenizer and chat template; no guessed
template is supplied. Upstream/community metadata and artifact paths were
inspected, downloaded hashes verified, and native compatibility established by
actual inference, not inferred from a model card. License references:
[community metadata](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/blob/a06e946bb6b655725eafa393f4a9745d460374c9/README.md),
[upstream license](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/cdbee75f17c01a7cc42f958dc650907174af0554/LICENSE),
[runtime license](https://github.com/ggml-org/llama.cpp/blob/63b4b303bd87456adc2f09d56c7e1f74e9e26673/LICENSE).
No weights or binaries are committed or published.

### Optional Gemma 4 E4B comparison

**The measured comparison did not justify replacing Qwen.** More machine-complete
Gemma results included accepted unsupported or irrelevant prose. The Qwen
config/default above is unchanged. `--model gemma4-e4b` explicitly opts
into `tools/authoring-gemma4-config.json`; it is a **local inference model**, not
a Copilot subagent selection. Gemma E4B has **4.5B effective parameters / about
8B including per-layer embeddings**, not the footprint of an ordinary 4B model.
The comparison downloads one text GGUF only: no projector, audio/vision encoder,
assistant/drafter, full-precision weights or extra context assets.

| Optional dependency | Immutable pin |
|---|---|
| GGUF | `ggml-org/gemma-4-E4B-it-GGUF` at `a69f018d7678a2b9f5e705f8903d6fb29b9b25dc` |
| File | `gemma-4-E4B-it-Q4_0.gguf`, 4,590,807,392 bytes |
| SHA-256 | `a555b900214b477d8880e7832e0b8925e139b0159640036b09fe472b6f2097f2` |
| Actual QAT source | `google/gemma-4-E4B-it-qat-q4_0-unquantized` at `476025a01dbf99361c062bbeca3d6a76bb4c4566` |
| Official instruction model | `google/gemma-4-E4B-it` at `ee0ef6023621cff504d758262d4e04895a5af4a2` |
| Quantization | QAT-derived Q4_0, token embedding Q8_0 |
| License/access | Apache-2.0, public/ungated; same MIT llama.cpp/runtime pin as Qwen |

The repository's immutable [`.src_sha`](https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/blob/a69f018d7678a2b9f5e705f8903d6fb29b9b25dc/.src_sha)
and [`convert.log`](https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/blob/a69f018d7678a2b9f5e705f8903d6fb29b9b25dc/convert.log)
establish that this Q4 file comes from the QAT source, **not** ordinary
post-training quantization of the primary checkpoint. The official Google's QAT
GGUF is a different, larger artifact; it was not downloaded or benchmarked.
Runtime `b11910` contains the Gemma4 architecture, E4B layer count and per-layer
embedding support; native loading and generation, not that source inspection
alone, establish actual compatibility.

Gemma uses its embedded vendor template with thinking disabled and native system
roles. No Qwen `/no_think` suffix is injected. Its pinned official
`generation_config.json` supplies temperature 1.0, top-p 0.95 and top-k 64;
the [QAT source's generation config](https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-unquantized/blob/476025a01dbf99361c062bbeca3d6a76bb4c4566/generation_config.json)
confirms those same values. Min-p is explicitly zero so the runtime's default
does not silently truncate
that distribution. Seed/context/token/retry budgets remain 42/8192/1800/two.
These vendor-decoding differences are disclosed, not a pure architecture
benchmark. Prompts, source inputs and acceptance guards are otherwise unchanged.

Actual native compatibility was established on this M1 Pro before the comparison:
`/health` responded, the runtime recognized `gemma4`/7.46B text parameters,
offloaded **43/43 layers** to Metal and emitted a real schema-shaped classification.
The GGUF template SHA-256 is
`603a42db292c25278e9b23d94c7abbe77453f13e26a053c43c5c2f900b4136f7`.
It matches the pinned official template **except for its final newline**, not a
different guessed formatter. The 4,590,807,392-byte download/setup took 262.17 s;
first native startup took 6.55 s, compatibility execution 8.30 s/~3.74GB maxRSS.
There was no template/runtime correction or model/precision sweep.

The shared machine had 152GiB free disk and reported 56% available memory, with
about 5.7GiB pre-existing swap. Only one inference server runs at a time; the
compatibility check was below the explicit 8GiB server-RSS budget and reported
48% available memory afterwards. No other user's processes were stopped or
changed. RSS is not a precise measure of total unified-memory pressure, especially
with lazy per-layer embeddings. "Cold" below means a fresh server process, **not**
a forcibly purged OS file cache; warm measurements reuse one server for four
original cases, not proposals. Vendor decoding and output lengths differ, so
elapsed times are fixture observations, not standardized throughput benchmarks.

```sh
python3 -m tools.authoring setup --model gemma4-e4b --download
python3 -m tools.authoring example --case base64
python3 -m tools.authoring propose --model gemma4-e4b \
  --input .cache/authoring/inputs/base64.json
python3 -m tools.authoring_evaluate --model gemma4-e4b --label UNIQUE_COLD_LABEL
python3 -m tools.authoring_evaluate --model gemma4-e4b --label UNIQUE_RESERVE_LABEL \
  --definitions tests/fixtures/authoring-reserve-cases.json
python3 -m tools.authoring_evaluate --model gemma4-e4b --warm \
  --label UNIQUE_WARM_LABEL --cases base64 unknown insufficient listbox
```

Default Qwen setup/propose commands still select Qwen. Its original dependency
lock remains `installed.json`; optional Gemma has a separate config-fingerprinted
installation lock. The shared runtime bytes are the same verified release.
Read-only `check` recognizes only exact committed registered configs, and still
refuses stale code/data/config and never approves or applies text. Historical
captures remain replayable evidence, not current-precondition approval.

Cold evaluation uses ordinary proposal/cache logic; cache hits are labeled and
must not be counted as inference timing. `--warm` explicitly starts one runtime
for the selected cases, records startup time, executes the same generation and
validation without proposal reuse, and writes **raw benchmark records only**.
It never overwrites a proposal. Both modes keep exact requests/refusals and
protected-data snapshots under the ignored authoring cache.

#### Actual comparison: completion is not correctness

The original ten and reserve four remain byte-frozen. No extra held-outs were
needed because there was **no prompt, model or precision tuning** after observing
Gemma results. All accepted five-locale bodies were inspected against their exact
source excerpts. Fresh Qwen accepted bodies match its prior capture; warm accepted
bodies match cold bodies. Matching bytes identifies repeated outputs only, not a
proxy for factual correctness.

| Cold 14-case observation | Qwen default | Optional Gemma |
|---|---:|---:|
| Machine-complete / guard-refused | 7 / 7 | 9 / 5 |
| Generated drafts | 3 | 5 |
| Source-consistent complete review drafts | 3 | 1 |
| Correct insufficient decisions | 4 | 3 |
| Incorrect insufficient decisions | 0 | 1 |
| Unsupported material claim accepted | 0 identified | 1 |
| Other accepted task failures | 0 identified | 3 |
| Source-inspected task outcomes | 7/14 | 4/14 |
| Proposed type matches | 13/14 | 11/14 |

These assessments are bounded **review-draft** outcomes, not human approval or a
general model ranking. Material-delta repeats Base64, so it is not an independent
quality observation. Platform, severity/criticality and complexity are still
unknown by construction. Both models fail the optional-remedy authoring case.

Gemma's critical accepted failure illustrates why citations/schema are insufficient:

> Source: “If toDecode contains an invalid base64 contents, an empty text or blob
> value is returned.”
>
> Generated condition: “toDecode contains an empty text or blob value”

It mistakes an **output** for an additional **input condition**, and all five
locales repeat that unsupported meaning. Structural checks and read-only
precondition `check` accept the candidate; neither establishes entailment.
Gemma also selects the generic introduction for OK-variable and writes no actual
OK behavior anywhere. Its Base64 and duplicate delta drafts preserve the behavior
but retain English `called on` in Spanish. Those are failures, not successful
five-language authoring. List-box is wrongly declined; a safe no-draft result is
not a correct decision when optional guard evidence is present.

Gemma's Japanese-events draft does capture the primary click-during-editing
change, 18 R6 and official French `Sur clic` / `Sur double clic` aliases. Its
event-order sentences and list-box terminology still need editing. French aliases
are restored by the same deterministic glossary mechanism, not credited as model
discovery.

Other genuine failures and guard limitations remain separately disclosed.
Gemma infers removal from the irrelevant rhetorical lead-in and misclassifies
PDFCreator as removed; downstream numeric-marker refusals do not detect/prove
those semantic errors. Both models miss the shared parser's unsupported
`à partir de` / `prior to` cutoff cues. Gemma's Japanese version-only condition
trips a script heuristic; `min`/`max`/`average` and `Undefined`/`Null` in the
aggregate case are legitimate code, not untranslated prose. Bilingual
`interprocess variables` is refused even alongside its Japanese translation.
Those are limited/overstrict language rules, **not automatically model semantic
errors**. The aggregate Japanese `18 R6以前` also blurs the source's exclusive
“prior to” boundary; removing a false-positive guard would not establish a correct
complete draft. No guard was relaxed for either model.

| Measurement | Qwen | Gemma |
|---|---|---|
| Cold frozen ten | 169.47s, ~4.10GB maxRSS | 296.98s, ~4.46GB maxRSS |
| Cold reserve four | 59.88s, ~4.09GB | 109.81s, ~4.68GB |
| Cold 14 total | 229.35s | 406.79s |
| Warm original four, including one startup | 64.60s, ~4.11GB | 78.53s, ~4.29GB |
| Warm startup component | 2.79s | 5.59s |

Warm outcomes do not improve quality or count as new cases. After all runs,
available memory returned to 56%; system swap was 6,427.94MiB versus the initial
5,713.81MiB, a 714.13MiB increase during shared-machine activity that cannot be
attributed solely to inference. This cost is not hidden behind the lower effective
parameter name. All native servers were shut down; the optional 4.59GB weight
remains ignored locally for reproducibility.

`tests/fixtures/authoring-gemma4-results.json` records per-case source assessments,
pins and measurements. `authoring-gemma4-native.json.gz` losslessly preserves all
six cohorts, **28 cold runs + eight warm cases**, exact requests/raw bodies,
candidate proposals, refusals, runtime/template metadata/logs, vendor/conversion
records and compatibility execution. Read it with the same gzip/JSON inspection
pattern above using `gemma4-cold-frozen` and a case name. Cold responses were
116/116 schema-shaped for Gemma and 96/96 for Qwen; that is **not a factual score**.
No existing capture is overwritten. Replay tests explicitly preserve the known
accepted empty-input error and incorrect decline, rather than asserting them as
good output. Green CI never means these model bodies are publication-ready.

Comparison regression commands passed: **56 offline authoring tests**, full
Python discovery **168 tests / nine existing skips**, search-runtime build,
**48 Node tests**, local publication build and diff checks. Explicit Gemma/Qwen
CLI cache selection and read-only Gemma proposal preconditions were exercised.
Default config, generation stages/guards, frozen inputs, existing captures,
canonical data, authored/curated fixtures, site/search, packages and workflows
remain unchanged.

Setup keeps artifacts under ignored `.cache/authoring/dependencies`, checks their
size and SHA-256 before extraction, checks archive paths/links, and records hashes
of runtime files. Inference rechecks the GGUF, executable and runtime dependency
hashes and native build identity. A damaged download fails explicitly; remove
only the named damaged artifact before retrying setup.

Generation settings are committed: seed 42, temperature 0, top-p 1, maximum
1,800 output tokens per stage, context 8,192, four CPU threads, 99 requested GPU
layers, 240-second request timeout, and **at most two attempts per stage**.
There is no automatic run-level retry or fallback. Temperature zero and fixed
pins do not promise bit-identical output across hardware/runtime changes.

## Explicit queue input and commands

The bounded first slice accepts **1-6 short excerpts already present in committed
candidate/glossary evidence**. It does not crawl, fetch, reprocess, recluster, or
claim a new real-world fact. A future source-registration workflow is outside
this slice. The example command selects references and existing excerpts; it
does not infer new facts or change the baseline:

```sh
python3 -m tools.authoring example --case base64
python3 -m tools.authoring propose --input .cache/authoring/inputs/base64.json
```

The input has exactly `schema_version: 1`, `target_id`, `fields`, and `evidence`.
Each evidence entry requires `source_id`, `block_id`, `source_sha256`, an exact
`quote` substring of that committed block's evidence, and `quote_sha256` (SHA-256
of the UTF-8 quote, not the JSON string). The known source/block/source-hash tuple
and quote hash are independently checked. Appending source instructions and
recomputing the quote hash does not make an untrusted excerpt acceptable.

`target_id` is an existing atomic candidate ID, never a group ID. `null` creates
a provisional proposal with no assigned authoritative ID. The separate
`proposal-<fingerprint>` ID is never a catalog ID. `fields` is an explicit
nonempty subset of `one_line`, `paragraph`, `conditions`, `action`, `action_basis`.
Only those locale fields appear in patch entries; threshold/platform/complexity
decisions are separate unverified proposals, never canonical edits.

For an existing queue input, provide its previous evidence explicitly:

```sh
python3 -m tools.authoring propose \
  --input .cache/authoring/inputs/base64.json \
  --previous .cache/authoring/inputs/base64.json
```

This records `no_material_change` **without loading the model**. Quote text,
normalized for HTML/whitespace, gates material changes; source URL, source hash,
block identity, fetch metadata and additional identical corroboration alone
are not grounds for rewriting prose. Removed-only evidence gets
`removal_requires_review`, without model inference or removal of a fact.
Different substantive text queues `material_change`; absent previous input means
`new_to_queue`, **not** "new verified fact." Previous inputs must themselves pass
the bounded trust checks; old/unregistered evidence is not silently accepted.

Proposals live only at `.cache/authoring/runs/<fingerprint>/proposal.json`.
The CLI has no arbitrary output path, apply, accept, merge, publish, or schedule
command. Non-symlink output confinement also refuses paths into `data/`.
Each proposal is `status: candidate`, `review_required: true`,
`publication_allowed: false`. A structured patch is **not an executable JSON
Patch**: it describes a proposed value, target ID, locale, field, exact evidence
references, and `expected_value_sha256` of the existing field. `null` precondition
means the field/target was absent, not permission to overwrite it.

Before reviewing a saved proposal, check its preconditions:

```sh
python3 -m tools.authoring check --proposal .cache/authoring/runs/PRINTED_ID/proposal.json
```

This is read-only and fails on a changed implementation/configuration,
authoritative target, evidence, glossary, override, group, or protected data.
Field-level hashes prevent silently treating a stale field proposal as current.
The full target-authored hash and protected-data hashes are also in provenance.
Human/curated overrides require explicit editorial reconciliation, not model
replacement. **Passing this check does not approve content or apply anything.**
Any eventual canonical integration must be a separate manually authored change
with its own fact/translation review, curation reconciliation and existing
catalog tests. No current stable ID, authored baseline or curated group is
regenerated by this pipeline.

## What is and is not validated

Stages are decision, English authoring, then fr/de/es/ja translations. llama.cpp
uses schema-constrained decoding, followed by a separate stdlib schema/domain
validator. The actual pinned C++ implementation requires nested
`response_format.json_schema.schema`; the runtime README's flat `schema`
example did **not** constrain fields in the first experiment.

Quotes are treated as data under system-level instructions. Only provided
citation keys may be generated; keys resolve to the exact input
source/block/quote/hash, not fetched or model-invented evidence. Checks cover
field completeness, explicit allowlists, exact identifiers, citation references,
basic release/numeric/platform support, first-release uncertainty, missing
translations, Japanese-script/English-phrase heuristics, and patch preconditions.
An English unknown remedy uses two **fixed grammar-constrained editorial
sentinels**, rather than letting the model invent a replacement. Complexity and
platforms remain explicitly unknown in this slice.

Glossary commands and excerpt camelCase identifiers are protected with reversible
`__CMD_N__` tokens before translation. Restoration uses verified official French
command names in French, English commands elsewhere, and unchanged code-variable
names. Dropped, invented or unresolved tokens are refused. This is explicit
identifier protection, **not** cleanup of hallucinated factual prose. The raw
tokenized model response remains recorded.

**None of these checks proves a generated sentence follows from its citations.**
Numeric and language checks are intentionally limited heuristics, not a theorem
prover, language detector or fact checker. Valid citations do not establish
entailment; a model can misread optional work as mandatory, misclassify a
generic announcement, or introduce unsupported interpretations without a new
number/command. The list-box case below demonstrates this. Every accepted draft
still needs independent source, scope, condition, remedy and five-language
review. No output here has named human review.

Cache keys include input, previous evidence, selected fields, target-authored
fingerprint, all protected `data/*.json` hashes, config, and core/stage implementation
hashes (which cover prompts/schema/validation). Cache hits are revalidated. Changing a
model/prompt/schema can create a new proposal cache but never invalidates or
rewrites authored catalog inputs. When previous evidence is unchanged, even a
changed prompt does not trigger generation.

Each explicit run gets a separate `attempt-NNNN/` directory. Requests include
the complete prompts, input data and JSON schema; `.raw.json` responses,
timings, `.rejected.json` validation errors, runtime props/template/build,
native log, and final `failure.json` are retained. A second stage attempt gets
the exact refusal and previous invalid response, not a sanitized substitute.
Final failure exits nonzero and writes **no proposal**. Operational errors
surface rather than becoming empty success results. Input trust failures occur
before any runtime is started. These ignored local artifacts may contain private
future evidence; do not upload them indiscriminately.

## Initial local evaluation and limitations (`dcdbb22`)

Measured on Apple M1 Pro / 16 GiB, macOS 26.7, using the pinned native Metal
backend (37/37 layers offloaded). The successful Base64 run took approximately
**56.2 seconds**, including model load and one refused Japanese attempt plus a
correction. `/usr/bin/time -l` reported approximately **4.22 GB maximum RSS** for
the process tree (not a precise unified-memory measurement). Runtime logs show
2,375.91 MiB Metal-mapped model, 1,152 MiB KV cache and 102.33 MiB Metal compute
buffer; generation was about 42-44 tokens/second. The model plus runtime download
is 2,513,576,543 bytes, excluding transport metadata and extracted runtime files.
Repeated end-to-end runs took 58.0-73.8 seconds with approximately 4.01-4.19 GB
maximum RSS; the committed capture records the 73.79-second run. The final run
also demonstrated a revalidated cache hit, matching field preconditions, and an
unchanged-evidence run with no inference.

These are small fixture observations, not benchmark quality claims:

| Fixture | Expected from provided evidence | Actual outcome |
|---|---|---|
| Base64, two existing blocks (development/tuning case) | Invalid single-BLOB decode now empties the BLOB; explicit 18 R4; no stated remedy/platform | Full five-locale, 25-field review-only proposal; correct French alias and Japanese/code identifiers; first Japanese response refused, bounded retry accepted |
| Command detail only, initially held out then used to exercise uncertainty/code protection | Unknown first release/platform/remedy | Machine decision kept these unknown; both English attempts omitted explicit unknown first release; refused, no patch |
| Generic "commands updated" introduction, held out | Insufficient detail for a specific candidate | Model incorrectly chose draft; later Japanese output invented a placeholder; refused for that separate structural reason, **decision test failed** |
| Optional list-box editing guard, held out | Optional documented guard, unknown first release/platform | Model incorrectly chose unknown remedy and described the guard as mandatory; both English attempts omitted unknown release; refused for that separate rule, **semantic support test failed** |
| Identical previous/current input | No inference, no rewrite | `no_material_change`, no generated fields |
| Appended source instruction / invented citation / unsupported version | Reject untrusted input or output | Offline trust/domain tests refuse; early real runs also retained unsupported-version/alias failures |

The frozen four-model-case batch produced **1/4 complete proposals and 3/4
refusals**, not four quality passes. Its 20 model responses were parseable,
schema-shaped JSON with allowed citation keys; that statistic says nothing about
semantic correctness. There were no additional model changes after the single
4B alternative. The successful draft is still verbose, has awkward French/German/
Japanese phrasing and an English loanword in Spanish; it is not publication-ready.
Unknown and optional-remedy generation are not reliable enough for broad use.

The initial model was official `Qwen/Qwen3-1.7B-GGUF`,
revision `90862c4b9d2787eaed51d12237eafdfe7c5f6077`,
`Qwen3-1.7B-Q8_0.gguf`, 1,834,426,016 bytes, SHA-256
`061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a`
(Apache-2.0, ungated). It ran natively around 77 tokens/second but repeatedly
ignored the French alias and added unsupported version/remediation wording.
Those failures, the first flat-schema request failure, and a subsequently fixed
shared-schema-object implementation error are distinct from final model quality
results. No failed prose was silently substituted into a successful draft.

Reproduce manually after setup; expected refusals return nonzero:

```sh
python3 -m tools.authoring example --case unknown
python3 -m tools.authoring example --case insufficient
python3 -m tools.authoring example --case listbox
python3 -m tools.authoring propose --input .cache/authoring/inputs/unknown.json
python3 -m tools.authoring propose --input .cache/authoring/inputs/insufficient.json
python3 -m tools.authoring propose --input .cache/authoring/inputs/listbox.json
```

`tests/fixtures/authoring-model-run.json` preserves actual generated prose and
selected failure bodies/provenance. These captures are **not** fed back as
authoritative facts or used to assert the model generalizes. Ordinary CI runs
offline tests and replay validation only:

```sh
python3 -m unittest tests.test_authoring tests.test_authoring_reliability tests.test_authoring_models -v
python3 -m unittest discover -s tests -v
npm ci --no-audit --no-fund
npm run build:search-runtime
npm test
python3 -m tools.publish
```

The last command builds a local ignored `_site/`; it does not deploy or include
any authoring proposals. Existing EmbeddingGemma search, 202 entities, 276 atomic
facts, 28 curated groups and authored/curated fingerprint tests remain unchanged.

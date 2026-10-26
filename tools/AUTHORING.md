# Local authoring: bounded, review-only prototype

This **manual developer-machine tool** makes candidate decisions and draft prose,
not verified facts. It is not part of the website, embedding encoder, ingestion,
publication build, or a scheduled workflow. **One successful example is not
evidence that the model makes reliable migration decisions or translations.**
The held-out failures below are important limitations, not successful refusals
by a factual-entailment checker.

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
fingerprint, all protected `data/*.json` hashes, config, and implementation hash
(which covers prompts/schema/validation). Cache hits are revalidated. Changing a
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

## Actual local evaluation and limitations

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
python3 -m unittest tests.test_authoring -v
python3 -m unittest discover -s tests -v
npm ci --no-audit --no-fund
npm run build:search-runtime
npm test
python3 -m tools.publish
```

The last command builds a local ignored `_site/`; it does not deploy or include
any authoring proposals. Existing EmbeddingGemma search, 202 entities, 276 atomic
facts, 28 curated groups and authored/curated fingerprint tests remain unchanged.

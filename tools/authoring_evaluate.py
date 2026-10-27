"""Explicit native-model experiment runner; never part of ordinary CI."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
import subprocess
import time

from . import authoring as a

CASES = a.ROOT / "tests/fixtures/authoring-evaluation-cases.json"


def inputs(case):
    if "example" in case:
        value = a.example(case["example"])
    else:
        changes = a.load(a.ROOT / "data/changes.json")
        selected = []
        for selector in case["select"]:
            matches = [e for change in changes for e in change["evidence"]
                       if e["source_id"] == selector["source_id"] and
                       e["block_id"] == selector["block_id"] and
                       selector.get("contains", "") in e["excerpt"]]
            a.require(bool(matches), "Evaluation selector no longer resolves")
            item = matches[0]
            quote = selector.get("quote", item["excerpt"])
            selected.append({key: item[key] for key in ("source_id", "block_id", "source_sha256")} |
                            {"quote": quote, "quote_sha256": a.text_hash(quote)})
        value = {"schema_version": 1, "target_id": case["target_id"],
                 "fields": list(a.FIELDS), "evidence": selected}
    previous = None
    if "previous_evidence_count" in case:
        previous = deepcopy(value)
        previous["evidence"] = previous["evidence"][:case["previous_evidence_count"]]
    a.validate_input(value)
    if previous:
        a.validate_input(previous)
    return value, previous


def evaluate_case(case, config, folder, base=None):
    value, previous = inputs(case)
    started = time.monotonic()
    key, provenance, delta = a.prepare(value, previous, config)
    outcome = {"name": case["name"], "split": case["split"], "delta": delta,
               "run": key, "expected": case["expected"], "human_reviewed": False}
    artifacts = None
    try:
        if base is None:
            path, cached = a.run(value, previous, config)
            result = a.load(path)["result"]
        else:
            artifacts = a.safe_path(folder / "warm" / case["name"])
            artifacts.mkdir(parents=True)
            outcome["artifacts"] = str(artifacts.relative_to(a.ROOT))
            a.write(artifacts / "input.json", provenance)
            before = a.snapshot()
            result = None if delta in ("no_material_change", "removal_requires_review") else a.generate(
                value, config, a.Client(base, config, artifacts))
            if result is not None:
                a.validate_result(result, value)
            a.require(a.snapshot() == before, "Protected data changed during warm evaluation")
            cached = False
        outcome.update(status="complete", cache_hit=cached, result=result)
        decision = result["decision"] if result else {}
        outcome["decision_matches"] = {
            field: decision.get(field) == expected
            for field, expected in case["expected"].items()
            if field in ("disposition", "threshold", "remedy")}
        if "modality" in case["expected"]:
            outcome["decision_matches"]["modality"] = (
                decision.get("extraction", {}).get("modality") == case["expected"]["modality"])
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as error:
        outcome.update(status="refused", error=str(error))
        if artifacts is not None:
            a.write(artifacts / "failure.json", {"error": str(error), "type": type(error).__name__})
    outcome["seconds"] = time.monotonic() - started
    return outcome


@contextmanager
def session(config, folder, warm):
    if warm:
        with a.runtime(config, folder) as base:
            yield base
    else:
        yield None


def evaluate(label, names, definitions_path=CASES, model="qwen3-4b", warm=False):
    config = a.model_config(model)
    definitions = a.load(definitions_path)
    a.require(not names or set(names) <= {case["name"] for case in definitions["cases"]},
              "Unknown evaluation case name")
    cases = [case for case in definitions["cases"] if not names or case["name"] in names]
    a.require(bool(cases), "No matching evaluation cases")
    folder = a.safe_path(a.HOME / "evaluations" / label)
    a.require(not folder.exists(), "Evaluation label already exists; use a new label, never overwrite results")
    folder.mkdir(parents=True)
    a.write(folder / "manifest.json", {
        "definitions": definitions, "definitions_sha256": a.file_hash(definitions_path),
        "model": model, "mode": "warm_benchmark" if warm else "cold_proposals",
        "implementation_sha256": a.file_hash(Path(a.__file__)), "config": config,
        "evaluation_sha256": a.file_hash(Path(__file__)),
        "stages_sha256": a.file_hash(a.ROOT / "tools/authoring_stages.py"),
        "inputs": {case["name"]: inputs(case) for case in cases}})
    outcomes = []
    with session(config, folder, warm) as base:
        for case in cases:
            outcome = evaluate_case(case, config, folder, base)
            outcomes.append(outcome)
            a.write(folder / f'{case["name"]}.json', outcome)
            print(case["name"], outcome["status"], round(outcome["seconds"], 2),
                  outcome.get("decision_matches", {}), outcome.get("error", ""), flush=True)
    a.write(folder / "results.json", outcomes)
    return folder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    parser.add_argument("--cases", nargs="*")
    parser.add_argument("--definitions", type=Path, default=CASES)
    parser.add_argument("--model", choices=a.MODEL_CONFIGS, default="qwen3-4b")
    parser.add_argument("--warm", action="store_true",
                        help="Benchmark one shared runtime; raw records only, no proposal reuse/writes")
    args = parser.parse_args()
    a.require(args.label and all(c.isalnum() or c in "-_" for c in args.label),
              "Use an alphanumeric evaluation label")
    print(evaluate(args.label, args.cases, args.definitions, args.model, args.warm).relative_to(a.ROOT))


if __name__ == "__main__":
    main()

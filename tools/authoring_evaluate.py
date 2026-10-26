"""Explicit native-model experiment runner; never part of ordinary CI."""
from __future__ import annotations

import argparse
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


def evaluate(label, names, definitions_path=CASES):
    config = a.load(a.CONFIG)
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
        "implementation_sha256": a.file_hash(Path(a.__file__)), "config": config,
        "stages_sha256": a.file_hash(a.ROOT / "tools/authoring_stages.py"),
        "inputs": {case["name"]: inputs(case) for case in cases}})
    outcomes = []
    for case in cases:
        value, previous = inputs(case)
        started = time.monotonic()
        key, _, delta = a.prepare(value, previous, config)
        outcome = {"name": case["name"], "split": case["split"], "delta": delta,
                   "run": key, "expected": case["expected"], "human_reviewed": False}
        try:
            path, cached = a.run(value, previous, config)
            proposal = a.load(path)
            result = proposal["result"]
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
        outcome["seconds"] = time.monotonic() - started
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
    args = parser.parse_args()
    a.require(args.label and all(c.isalnum() or c in "-_" for c in args.label),
              "Use an alphanumeric evaluation label")
    print(evaluate(args.label, args.cases, args.definitions).relative_to(a.ROOT))


if __name__ == "__main__":
    main()

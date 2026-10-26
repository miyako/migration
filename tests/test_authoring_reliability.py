"""Extraction contracts and frozen evaluations; no native inference in CI."""
from copy import deepcopy
import gzip
import hashlib
import json
import unittest
from unittest.mock import patch

from tools import authoring as a
from tools import authoring_stages as stages
from tools.authoring_evaluate import CASES, inputs


class ReliabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = a.load(a.ROOT / "tests/fixtures/authoring-reliability-results.json")
        cls.archive = (a.ROOT / cls.report["native_capture"]["path"]).read_bytes()
        cls.native = json.loads(gzip.decompress(cls.archive))

    def test_predeclared_inputs_are_trusted_and_original_cases_unchanged(self):
        definitions = a.load(CASES)
        frozen = a.load(a.ROOT / "tests/fixtures/authoring-reliability-results.json")
        self.assertEqual(a.file_hash(CASES), frozen["definitions_sha256"])
        originals = []
        for case in definitions["cases"]:
            value, previous = inputs(case)
            self.assertEqual(a.digest([value, previous]), frozen["frozen_input_sha256"][case["name"]])
            a.validate_input(value)
            if case["split"] == "original":
                originals.append(case["name"])
                self.assertEqual(value, a.example(case["example"]))
            if case["name"] == "material-delta":
                self.assertEqual(a.classify(value, previous), "material_change")
        self.assertEqual(originals, ["base64", "unknown", "insufficient", "listbox"])
        self.assertEqual(len(definitions["cases"]), 10)

    def test_extraction_needs_exact_evidence_references(self):
        evidence = a.example("base64")["evidence"]
        labeled = {f"E{i+1}": item for i, item in enumerate(evidence)}
        schema = stages.extraction_schema(list(labeled))
        value = {"specific_ref": "E2", "threshold_ref": "E1", "first_release": "18 R4",
                 "action_ref": "unknown", "modality": "unknown", "type": "behavior-change",
                 }
        stages.validate_extraction(value, schema, labeled)
        for field, replacement in (
            ("specific_ref", "invented"), ("threshold_ref", "unknown"),
            ("first_release", "19"), ("modality", "required"),
            ("specific_ref", "unknown")):
            invalid = {**value, field: replacement}
            with self.subTest(field=field), self.assertRaises(ValueError):
                stages.validate_extraction(invalid, schema, labeled)

    def test_optional_remedy_is_not_inferred_mandatory(self):
        evidence = a.example("listbox")["evidence"]
        labeled = {f"E{i+1}": item for i, item in enumerate(evidence)}
        extraction = {"specific_ref": "E1", "threshold_ref": "unknown", "first_release": "unknown",
                      "action_ref": "E1", "modality": "optional", "type": "behavior-change",
                      }
        stages.validate_extraction(extraction, stages.extraction_schema(list(labeled)), labeled)
        decision = stages.decision_from(extraction, labeled)
        self.assertEqual(decision["remedy"], "documented")
        self.assertEqual(decision["extraction"]["modality"], "optional")
        self.assertEqual(decision["threshold"], "unknown")
        self.assertEqual(decision["criticality"], "unknown")
        self.assertEqual(decision["platforms"], ["unknown"])

    def test_uncertainty_composition_is_explicit_not_claimed_model_generation(self):
        english = {"paragraph": "A condition is documented."}
        before = deepcopy(english)
        for language in a.LANGUAGES:
            composed = stages.compose(english, {"threshold": "unknown"}, language)
            self.assertTrue(composed["paragraph"].endswith(stages.UNCERTAINTY[language]))
        self.assertEqual(english, before)
        self.assertEqual(stages.compose(english, {"threshold": "18 R4"}, "en"), english)

    def test_localized_unknown_remedy_is_a_fixed_schema_contract(self):
        base = a.schemas(["E1"])[1]
        for language in a.LANGUAGES:
            schema = stages.prose_schema(base, {"remedy": "unknown"}, language)
            self.assertEqual(schema["properties"]["action"]["enum"],
                             [stages.NO_REMEDY[language][0]])
            self.assertNotIn("enum", schema["properties"]["paragraph"])
        self.assertNotIn("enum", base["properties"]["action"])

    def test_explicit_multilingual_release_cues_are_not_source_editions(self):
        examples = {"Since 4D v18 R4, the return value changes.": {"18 R4"},
                    "Depuis 4Dv 19 R4, ce nom est interdit.": {"19 R4"},
                    "4D v18 R6 以降、この動作が変わります。": {"18 R6"},
                    "Source edition 20.1. No first release stated.": set()}
        for text, expected in examples.items():
            with self.subTest(text=text):
                self.assertEqual(a.explicit_releases(text), expected)

    def test_optional_action_cannot_turn_into_required_work(self):
        decision = {"extraction": {"modality": "optional"}}
        stages.validate_modality({"one_line": "A guard is available.",
                                 "paragraph": "Old handling can be retained.",
                                 "action": "You can add an editing-state guard."}, decision)
        with self.assertRaises(ValueError):
            stages.validate_modality({"one_line": "A guard is mandatory.",
                                     "paragraph": "It must be added.", "action": "Add the guard."}, decision)

    def test_japanese_checks_do_not_miss_an_untranslated_adjective(self):
        with self.assertRaisesRegex(ValueError, "Invalid"):
            a.validate_japanese_text("Invalid base64 に toDecode が対応します。",
                                     "one_line", ["toDecode"])
        a.validate_japanese_text("toDecode は無効な Base64 で空の Blob を返します。",
                                "one_line", ["toDecode"])

    def test_action_candidate_gate_preserves_negations_and_positive_suggestions(self):
        quotes = ["Use of the feature is not recommended in projects.",
                  "Replacement is not required.",
                  "You can add a check to retain the old handling.",
                  "We recommend using a shared object.",
                  "The call now returns an empty value."]
        self.assertEqual(stages.action_candidates(quotes), quotes[2:4])

    def test_japanese_evidence_cannot_be_echoed_as_english_authoring(self):
        case = next(case for case in a.load(CASES)["cases"] if case["name"] == "japanese-events")
        value, _ = inputs(case)
        prose = {"one_line": "On Clicked の動作が変わります。",
                 "paragraph": "On Clicked および On Double Clicked が生成されます。",
                 "conditions": ["編集中のセル"], "action": "Unknown.", "action_basis": "Unknown.",
                 "citations": [a.citation_key(e) for e in value["evidence"]]}
        with self.assertRaisesRegex(ValueError, "untranslated Japanese"):
            a.validate_prose(prose, a.schemas(prose["citations"])[1], "en", value["evidence"])

    def test_stage_changes_invalidate_only_proposal_cache(self):
        value = a.example("base64")
        config = a.load(a.CONFIG)
        before, provenance, _ = a.prepare(value, None, config)
        original_hash = a.file_hash
        with patch.object(a, "file_hash", side_effect=lambda path:
                          "0" * 64 if path.name == "authoring_stages.py" else original_hash(path)):
            after, updated, _ = a.prepare(value, None, config)
            self.assertEqual(a.prepare(value, value, config)[2], "no_material_change")
        self.assertNotEqual(before, after)
        self.assertNotEqual(provenance["stages_sha256"], updated["stages_sha256"])
        self.assertEqual(provenance["protected_sha256"], updated["protected_sha256"])

    def test_lossless_native_archive_is_pinned_and_contains_all_experiments(self):
        record = self.report["native_capture"]
        self.assertEqual(hashlib.sha256(self.archive).hexdigest(), record["sha256"])
        self.assertEqual(hashlib.sha256(gzip.decompress(self.archive)).hexdigest(),
                         record["uncompressed_sha256"])
        self.assertEqual(len(self.native["evaluations"]), record["experiments"])
        self.assertEqual(len(self.native["runs"]), record["unique_runs"])
        self.assertFalse(self.native["human_reviewed"])

    def test_reserve_inputs_remain_frozen_and_trusted(self):
        path = a.ROOT / "tests/fixtures/authoring-reserve-cases.json"
        self.assertEqual(a.file_hash(path), self.report["reserve"]["definitions_sha256"])
        for case in a.load(path)["cases"]:
            value, previous = inputs(case)
            self.assertEqual(a.digest([value, previous]),
                             self.report["reserve"]["frozen_input_sha256"][case["name"]])
            a.validate_input(value)

    def test_final_native_proposals_replay_with_all_review_preconditions(self):
        for section in ("selected", "reserve"):
            record = self.report[section]
            evaluation = self.native["evaluations"][record["evaluation"].split("/")[-1]]
            manifest = evaluation["manifest"]
            self.assertEqual(manifest["implementation_sha256"],
                             self.report["selected"]["implementation_sha256"])
            self.assertEqual(manifest["stages_sha256"], self.report["selected"]["stages_sha256"])
            self.assertEqual(a.digest(manifest["config"]), self.report["selected"]["config_sha256"])
            self.assertEqual(a.file_hash(a.ROOT / "tools/authoring.py"), manifest["implementation_sha256"])
            self.assertEqual(a.file_hash(a.ROOT / "tools/authoring_stages.py"), manifest["stages_sha256"])
            completed = drafted = insufficient = 0
            for case in evaluation["outcomes"]:
                run = self.native["runs"][case["run"]]
                if case["status"] == "refused":
                    self.assertNotIn("proposal", run)
                    continue
                completed += 1
                proposal = run["proposal"]
                a.check_proposal(proposal)
                self.assertEqual(proposal["status"], "candidate")
                self.assertTrue(proposal["review_required"])
                self.assertFalse(proposal["publication_allowed"])
                result = proposal["result"]
                decision = result["decision"]
                self.assertEqual(decision["platforms"], ["unknown"])
                self.assertEqual(decision["criticality"], "unknown")
                self.assertEqual(decision["complexity"], "unknown")
                if decision["disposition"] == "insufficient":
                    insufficient += 1
                    self.assertEqual(result["localizations"], {})
                    self.assertEqual(result["patch"], [])
                else:
                    drafted += 1
                    self.assertEqual(set(result["localizations"]), set(a.LANGUAGES))
                    self.assertEqual(len(result["patch"]), 25)
                    self.assertTrue(all(set(entry) == {
                        "target_id", "locale", "field", "expected_value_sha256",
                        "proposed_value", "citations"} for entry in result["patch"]))
            self.assertEqual((completed, drafted, insufficient),
                             (record["complete_cases"], record["generated_proposals"],
                              record["correct_insufficient_decisions"]))

    def test_schema_validity_is_measured_separately_from_case_completion(self):
        for section in ("selected", "reserve"):
            record = self.report[section]
            evaluation = self.native["evaluations"][record["evaluation"].split("/")[-1]]
            responses = rejected = 0
            for case in evaluation["outcomes"]:
                for attempt in self.native["runs"][case["run"]]["attempts"].values():
                    for name, request in attempt.items():
                        if not name.endswith(".request.json"):
                            continue
                        stage = name[:-len(".request.json")]
                        value = json.loads(attempt[stage + ".raw.json"]["choices"][0]["message"]["content"])
                        a.validate_schema(value, request["response_format"]["json_schema"]["schema"])
                        responses += 1
                        rejected += int(stage + ".rejected.json" in attempt)
            self.assertEqual(responses, record["parseable_and_schema_shaped"])
            self.assertEqual(rejected, record["rejected_stage_attempts"])
            self.assertGreater(record["refused_cases"], 0)

    def test_recorded_optional_action_distortion_is_not_a_quality_success(self):
        case = next(row for row in self.report["selected"]["cases"] if row["name"] == "listbox")
        self.assertFalse(case["task_success"])
        run = self.native["runs"][case["run"]]
        attempt = run["attempts"]["attempt-0001"]
        action = json.loads(attempt["select_action.raw.json"]["choices"][0]["message"]["content"])
        self.assertEqual(action["modality"], "optional")
        prose = json.loads(attempt["en.raw.json"]["choices"][0]["message"]["content"])
        with self.assertRaisesRegex(ValueError, "must not become mandatory"):
            stages.validate_modality(prose, {"extraction": {"modality": "optional"}})
        self.assertIn("numeric", attempt["en.rejected.json"]["error"])
        self.assertNotIn("proposal", run)

    def test_numeric_guard_false_positive_is_preserved_not_relabeled_hallucination(self):
        case = next(row for row in self.report["selected"]["cases"]
                    if row["name"] == "french-restriction")
        attempt = self.native["runs"][case["run"]]["attempts"]["attempt-0001"]
        body = json.loads(attempt["ja.body.raw.json"]["choices"][0]["message"]["content"])
        self.assertIn("3項演算子", body["paragraph"])
        self.assertIn("numeric", attempt["ja.body.rejected.json"]["error"])
        self.assertFalse(case["task_success"])

    def test_actual_japanese_echo_is_refused_at_the_english_stage(self):
        case = next(row for row in self.report["selected"]["cases"]
                    if row["name"] == "japanese-events")
        run = self.native["runs"][case["run"]]
        attempt = run["attempts"]["attempt-0001"]
        value = run["provenance"]["input"]
        prose = json.loads(attempt["en.raw.json"]["choices"][0]["message"]["content"])
        prose["citations"] = [a.citation_key(e) for e in value["evidence"]]
        with self.assertRaisesRegex(ValueError, "untranslated Japanese"):
            a.validate_prose(prose, a.schemas(prose["citations"])[1], "en", value["evidence"])
        self.assertNotIn("proposal", run)


if __name__ == "__main__":
    unittest.main()

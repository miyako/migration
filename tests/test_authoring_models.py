"""Model selection and warm evaluation are offline; no download or native CI."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import authoring as a
from tools import authoring_evaluate as evaluate


class ModelTests(unittest.TestCase):
    def test_explicit_choice_keeps_original_default_and_runtime(self):
        qwen = a.model_config()
        gemma = a.model_config("gemma4-e4b")
        self.assertEqual(qwen, a.load(a.CONFIG))
        self.assertEqual(gemma["runtime"], qwen["runtime"])
        self.assertEqual(gemma["model"]["base_model"],
                         "google/gemma-4-E4B-it-qat-q4_0-unquantized")
        self.assertEqual(gemma["model"]["bytes"], 4590807392)
        with self.assertRaisesRegex(ValueError, "Unknown"):
            a.model_config("remote-llm")

    def test_optional_installation_lock_does_not_replace_qwen_lock(self):
        self.assertEqual(a.installation_path(a.model_config()).name, "installed.json")
        gemma = a.model_config("gemma4-e4b")
        self.assertEqual(a.installation_path(gemma).name, f"installed-{a.digest(gemma)}.json")
        self.assertNotEqual(a.installation_path(gemma), a.installation_path(a.model_config()))

    def test_chat_uses_embedded_template_with_vendor_thinking_and_sampling(self):
        (a.ROOT / ".cache").mkdir(exist_ok=True)
        for model in a.MODEL_CONFIGS:
            config = a.model_config(model)
            with self.subTest(model=model), tempfile.TemporaryDirectory(
                    dir=a.ROOT / ".cache") as folder, patch.object(a, "HOME", Path(folder)):
                response = {"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]}
                with patch.object(a, "http_json", return_value=response) as http:
                    a.Client("http://127.0.0.1:1234", config, Path(folder)).generate(
                        "contract", "Instruction.", {"quotes": ["data"]}, a.object_schema({}))
                request = http.call_args.args[1]
                self.assertEqual(request["chat_template_kwargs"], {"enable_thinking": False})
                self.assertNotIn("chat_template", request)
                suffix = "\n/no_think" if model == "qwen3-4b" else ""
                self.assertEqual(request["messages"][0]["content"],
                                 a.SYSTEM + suffix + "\nInstruction.")
                if model == "gemma4-e4b":
                    self.assertEqual((request["temperature"], request["top_p"],
                                      request["top_k"], request["min_p"]), (1.0, .95, 64, 0))

    def test_warm_benchmark_runs_pipeline_without_writing_a_proposal(self):
        case = {"name": "insufficient", "split": "original", "example": "insufficient",
                "expected": {"disposition": "insufficient"}}
        (a.ROOT / ".cache").mkdir(exist_ok=True)
        value = a.example("insufficient")
        result = {"decision": {"disposition": "insufficient"}, "localizations": {}, "patch": []}
        with tempfile.TemporaryDirectory(dir=a.ROOT / ".cache") as folder, \
                patch.object(a, "HOME", Path(folder)), \
                patch.object(a, "generate", return_value=result) as generate, \
                patch.object(a, "validate_result") as validate, \
                patch.object(a, "run") as cold:
            outcome = evaluate.evaluate_case(case, a.model_config(), Path(folder),
                                            "http://127.0.0.1:1234")
            self.assertEqual(outcome["status"], "complete")
            self.assertEqual(outcome["decision_matches"], {"disposition": True})
            generate.assert_called_once()
            self.assertEqual(generate.call_args.args[0], value)
            validate.assert_called_once_with(result, value)
            cold.assert_not_called()
            self.assertEqual(list(Path(folder).rglob("proposal.json")), [])
            self.assertTrue((Path(folder) / "warm/insufficient/input.json").exists())

    def test_warm_failure_is_explicit_and_preserves_no_success_result(self):
        case = {"name": "base64", "split": "original", "example": "base64", "expected": {}}
        (a.ROOT / ".cache").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=a.ROOT / ".cache") as folder, \
                patch.object(a, "HOME", Path(folder)), \
                patch.object(a, "generate", side_effect=ValueError("unsupported claim")):
            outcome = evaluate.evaluate_case(case, a.model_config(), Path(folder),
                                            "http://127.0.0.1:1234")
            self.assertEqual(outcome["status"], "refused")
            self.assertNotIn("result", outcome)
            failure = json.loads((Path(folder) / "warm/base64/failure.json").read_text())
            self.assertEqual(failure["error"], "unsupported claim")


class GemmaEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = a.load(a.ROOT / "tests/fixtures/authoring-gemma4-results.json")
        cls.archive = (a.ROOT / cls.report["native_capture"]["path"]).read_bytes()
        cls.native = json.loads(gzip.decompress(cls.archive))

    def test_exact_native_capture_and_vendor_template_are_preserved(self):
        self.assertEqual(hashlib.sha256(self.archive).hexdigest(),
                         self.report["native_capture"]["sha256"])
        self.assertEqual(hashlib.sha256(gzip.decompress(self.archive)).hexdigest(),
                         self.report["native_capture"]["uncompressed_sha256"])
        self.assertFalse(self.native["human_reviewed"])
        runtime = self.native["compatibility"]["runtime.json"]
        self.assertEqual(runtime["template_sha256"],
                         "603a42db292c25278e9b23d94c7abbe77453f13e26a053c43c5c2f900b4136f7")
        official = json.loads(self.native["upstream"]["qat_metadata"]["body"])
        self.assertEqual(runtime["props"]["chat_template"],
                         official["config"]["chat_template_jinja"].removesuffix("\n"))
        self.assertEqual(self.native["compatibility"]["manifest.json"]["config"],
                         a.model_config("gemma4-e4b"))
        metadata = json.loads(self.native["upstream"]["gguf_metadata"]["body"])
        artifact = next(item for item in metadata["siblings"]
                        if item["rfilename"] == self.report["pins"]["file"])
        self.assertEqual(artifact["lfs"]["sha256"], self.report["pins"]["sha256"])
        self.assertEqual(artifact["size"], self.report["pins"]["bytes"])

    def test_cold_candidates_and_warm_raw_results_replay_without_canonical_writes(self):
        for label, evaluation in self.native["evaluations"].items():
            manifest = evaluation["manifest"]
            self.assertEqual(manifest["config"], a.model_config(manifest["model"]))
            self.assertEqual(manifest["implementation_sha256"],
                             a.file_hash(a.ROOT / "tools/authoring.py"))
            for case in evaluation["outcomes"]:
                if manifest["mode"] == "warm_benchmark":
                    record = evaluation["warm"][case["name"]]
                    self.assertNotIn("proposal.json", record)
                    if case["status"] == "complete":
                        a.validate_result(case["result"], record["input.json"]["input"])
                else:
                    run = self.native["runs"][case["run"]]
                    if case["status"] == "complete":
                        self.assertFalse(case["cache_hit"], label)
                        a.check_proposal(run["proposal"])
                    else:
                        self.assertNotIn("proposal", run)

    def test_accepted_unsupported_empty_input_condition_is_not_a_quality_pass(self):
        evaluation = self.native["evaluations"]["gemma4-cold-frozen"]
        case = next(row for row in evaluation["outcomes"] if row["name"] == "unknown")
        run = self.native["runs"][case["run"]]
        result = run["proposal"]["result"]
        a.validate_result(result, run["provenance"]["input"])
        self.assertEqual(case["status"], "complete")
        self.assertIn("toDecode contains an empty text or blob value",
                      result["localizations"]["en"]["conditions"])
        self.assertEqual(a.example("unknown")["evidence"][0]["quote"],
                         "If toDecode contains an invalid base64 contents, "
                         "an empty text or blob value is returned.")
        self.assertIn("unknown", self.report["gemma"]["unsupported_accepted"])
        self.assertFalse(self.report["human_reviewed"])

    def test_incorrect_insufficient_decision_is_distinct_from_correct_decline(self):
        evaluation = self.native["evaluations"]["gemma4-cold-frozen"]
        case = next(row for row in evaluation["outcomes"] if row["name"] == "listbox")
        result = self.native["runs"][case["run"]]["proposal"]["result"]
        self.assertEqual(result["decision"]["disposition"], "insufficient")
        self.assertEqual(result["patch"], [])
        self.assertEqual(case["expected"]["disposition"], "draft")
        self.assertNotIn("listbox", self.report["gemma"]["correct_declines"])

    def test_quality_categories_account_for_every_machine_complete_case(self):
        for model, prefix in (("gemma", "gemma4"), ("qwen", "qwen-comparison")):
            summary = self.report[model]
            cases = [case for suffix in ("frozen", "reserve")
                     for case in self.native["evaluations"][prefix + "-cold-" + suffix]["outcomes"]]
            complete = {case["name"] for case in cases if case["status"] == "complete"}
            self.assertEqual(len(complete), summary["machine_complete"])
            self.assertEqual(len(cases) - len(complete), summary["machine_refused"])
            categories = ("source_consistent_review_drafts", "correct_declines", "incorrect_declines",
                          "unsupported_accepted", "wrong_or_missing_behavior_accepted",
                          "untranslated_prose_accepted")
            classified = [name for category in categories for name in summary[category]]
            self.assertEqual(len(classified), len(set(classified)))
            self.assertEqual(set(classified), complete)
            self.assertEqual(summary["source_inspected_task_outcomes"],
                             len(summary["source_consistent_review_drafts"]) +
                             len(summary["correct_declines"]))


if __name__ == "__main__":
    unittest.main()

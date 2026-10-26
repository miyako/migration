"""Original KB citations, PDF provenance and bounded editorial reconciliation."""
from copy import deepcopy
import subprocess
import unittest
from unittest.mock import patch

from tools.catalog import build, validate, verify_evidence
from tools.ingest import CACHE, ROOT, load
from tools.kb import fetch_one, landing_metadata, pdf_blocks


LANDING = """<div class="detailtitle">Tech Note: Test note</div>
<div class="detailtitle2">PRODUCT: 4D | VERSION: 19 R | PLATFORM: Mac &amp; Win</div>
<div class="detailtitle3">Published On: June 21, 2022</div>
<a href="/DLTN/TN/2022/example.zip">Tech Note Document</a>"""


class OriginalKB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = build()
        cls.audit = load(ROOT / "data/kb-audit.json")
        cls.sources = {s["id"]: s for s in cls.document["sources"] if s["family"] == "original-kb-technote"}
        cls.atomic = load(ROOT / "data/changes.json")

    def test_exact_bounded_counts_and_discovery_is_not_a_published_citation(self):
        self.assertEqual(len(self.sources), 8)
        self.assertEqual(len(self.audit["dispositions"]), 31)
        self.assertEqual({s["landing_url"] for s in self.audit["sources"].values()},
                         {s["url"] for s in self.sources.values()})
        self.assertEqual(self.audit["scope"]["research_landing_pages_verified"], 39)
        self.assertEqual(self.audit["scope"]["research_pdfs_inspected"], 15)
        self.assertFalse(self.audit["scope"]["exhaustive_archive_audit"])
        for source in self.sources.values():
            self.assertEqual(source["discovery"]["revision"], self.audit["discovery"]["revision"])
            self.assertEqual(source["language"], "en")
            self.assertEqual(source["fetch"]["content_kind"], "kb_pdf")
            self.assertTrue(source["kb_document"]["byline"])
            self.assertIn("no license inferred", source["kb_document"]["copyright_observation"])
        citations = [e for c in self.atomic for e in c["evidence"] if e["source_id"] in self.sources]
        self.assertEqual({e["source_id"] for e in citations}, self.sources.keys())
        self.assertTrue(all(e["url"] == self.sources[e["source_id"]]["url"]
                            and e["url"].startswith("https://kb.4d.com/assetid=") for e in citations))
        self.assertFalse(any("github.com/miyako/4d-tech-notes-summary" in e["url"]
                             for c in self.atomic for e in c["evidence"]))

    def test_only_four_distinct_new_unknown_facts_and_six_reconciliations(self):
        new = self.atomic[272:]
        self.assertEqual({c["id"] for c in new}, {
            "chg-project-standalone-designer-identity", "chg-project-users-blob-export",
            "chg-label-template-64bit-compatibility", "chg-project-deployed-users-preservation"})
        self.assertEqual(len({c["id"] for c in self.atomic}), 276)
        old_with_kb = [c for c in self.atomic[:272] if any(e["source_id"] in self.sources for e in c["evidence"])]
        self.assertEqual(len(old_with_kb), 6)
        self.assertTrue(all(c["threshold"] == {"exact": None, "bucket": None, "kind": "unknown"}
                            and c["complexity"] == {"level": "unknown"} and c["review_status"] == "candidate"
                            for c in new))
        self.assertEqual(sum(c["threshold"]["kind"] == "unknown" for c in self.atomic[:272]), 27)
        self.assertEqual(sum(len(c["member_ids"]) > 1 for c in self.document["changes"]), 28)
        for change in new:
            for language, text in change["localizations"].items():
                self.assertTrue(text["conditions"] and text["action"] and text["action_basis"])
                if language == "fr":
                    self.assertFalse(any(command in text["paragraph"] + text["action"]
                                         for command in ("CHANGE CURRENT USER", "USERS TO BLOB", "Get 4D file")))
        lists = next(c for c in self.atomic if c["id"] == "chg-project-save-list-call")
        self.assertIn("read-only", lists["localizations"]["en"]["paragraph"])
        self.assertIn("19 R6+", lists["localizations"]["en"]["paragraph"])
        self.assertIn("STOCKER LISTE", lists["localizations"]["fr"]["paragraph"])
        self.assertNotIn("SAVE LIST", lists["localizations"]["fr"]["paragraph"])

    def test_protected_changes_are_explicit_and_limited_to_documented_fields(self):
        edits = self.audit["protected_edits"]
        self.assertEqual(len(edits), 15)
        self.assertEqual({e["change_id"] for e in edits},
                         {"chg-project-save-list-call", "chg-rest-authentication-method-deprecation",
                          "chg-interprocess-variable-deprecation"})
        baseline = load(ROOT / "tests/fixtures/authored-baseline.json")
        for edit in edits:
            self.assertNotEqual(edit["before_sha256"], edit["after_sha256"])
            self.assertEqual(baseline["documents"]["changes"][edit["change_id"]][edit["language"]],
                             edit["after_sha256"])
            if edit["change_id"] != "chg-project-save-list-call":
                self.assertEqual(edit["fields"], ["action"])
            self.assertTrue(edit["reason"] and set(edit["source_ids"]) <= self.sources.keys())

    def test_validation_rejects_summary_citations_and_forged_pdf_page_identity(self):
        for field, value in (("url", "https://github.com/miyako/4d-tech-notes-summary"),
                             ("page", 999), ("sha256", "0" * 64), ("path", "invented.pdf"),
                             ("download_url", "https://example.test/not-original.zip")):
            document = deepcopy(self.document)
            evidence = next(e for c in document["changes"] for e in c["evidence"]
                            if e["source_id"] in self.sources)
            if field == "url":
                evidence[field] = value
            else:
                evidence["pdf"][field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "KB evidence"):
                validate(document)

    def test_short_fixture_keeps_page_boundaries_and_original_landing_urls(self):
        metadata = landing_metadata(LANDING, "https://kb.4d.com/assetid=78951")
        self.assertEqual(metadata["displayed_version"], "19 R")
        self.assertEqual(metadata["download_url"], "https://kb.4d.com/DLTN/TN/2022/example.zip")
        with patch("tools.kb.subprocess.run", return_value=subprocess.CompletedProcess(
                [], 0, b"LOAD LIST still works normally\fPage two\f", b"")):
            blocks = pdf_blocks(b"fixture-not-a-full-PDF", "Test note", "https://kb.4d.com/assetid=78951")
        self.assertEqual([b["page"] for b in blocks], [1, 2])
        self.assertEqual(blocks[0]["text"], "LOAD LIST still works normally")
        self.assertTrue(all(b["url"] == "https://kb.4d.com/assetid=78951" for b in blocks))
        with self.assertRaises(ValueError):
            landing_metadata(LANDING.replace("/DLTN/TN/2022/example.zip", "https://example.test/demo.zip"),
                             "https://kb.4d.com/assetid=78951")

    def test_fetch_failure_is_explicit_and_preserves_prior_provenance(self):
        source = deepcopy(self.sources["kb-78951-en"])
        with patch("tools.kb.retrieve", side_effect=OSError("test download failure")):
            fetched, alternates = fetch_one(source, "curl")
        self.assertEqual(fetched["fetch"]["status"], "fetch_error")
        self.assertIn("test download failure", fetched["fetch"]["error"])
        self.assertEqual(fetched["fetch"]["sha256"], source["fetch"]["sha256"])
        self.assertEqual(fetched["kb_document"], source["kb_document"])
        self.assertEqual(alternates, [])

    def test_actual_original_pdf_bytes_pages_and_quotes(self):
        if not all((CACHE / "kb" / (sid + ".pdf")).exists() for sid in self.sources):
            self.skipTest("Original documents stay local/ignored; offline fixtures validate the adapter contract")
        verify_evidence({"sources": list(self.sources.values()), "changes": [
            {**c, "evidence": [e for e in c["evidence"] if e["source_id"] in self.sources]}
            for c in self.atomic]})


if __name__ == "__main__":
    unittest.main()

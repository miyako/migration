"""Assertions about the actual editorial batch, not generated example records."""
from collections import Counter
import hashlib
import unittest

from tools.catalog import bucket, merge_candidates, verify_evidence
from tools.ingest import CACHE, LANGUAGES, ROOT, extract, load


class ContentBatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.changes = load(ROOT / "data/changes.json")
        cls.by_id = {c["id"]: c for c in cls.changes}
        cls.sources = {s["id"]: s for s in load(ROOT / "data/registry.json")}

    def test_stable_ids_atomicity_and_deduplication(self):
        self.assertEqual(len(self.changes), len(self.by_id))
        self.assertEqual(len(merge_candidates(self.changes * 2)), 68)
        for identifier in ("chg-colon-identifiers", "chg-pdfcreator-driver-deprecation",
                           "chg-bundled-php-dom-removal"):
            self.assertIn(identifier, self.by_id)
        self.assertEqual(Counter(c["type"] for c in self.changes),
                         {"removal": 56, "deprecation": 7, "restriction": 5})
        self.assertIn("_o_DISABLE BUTTON", self.by_id["chg-removed-disable-button"]["identifiers"])
        self.assertIn("_o_ENABLE BUTTON", self.by_id["chg-removed-enable-button"]["identifiers"])
        self.assertNotIn("chg-removed-get-platform-interface", self.by_id)

    def test_removed_command_thresholds_and_detection_stage(self):
        removed = [c for c in self.changes if c["id"].startswith("chg-removed-")]
        self.assertEqual(len(removed), 34)
        for change in removed:
            expected = "18 R2" if change["id"] in {
                "chg-removed-no-trace", "chg-removed-disable-button", "chg-removed-enable-button"
            } else "17 R5"
            self.assertEqual(change["threshold"],
                             {"exact": expected, "bucket": bucket(expected), "kind": "introduced"})
            self.assertEqual(change["type"], "removal")
            self.assertEqual(change["stage"], "runtime")
            self.assertTrue(any("Error 33" in e["excerpt"] for e in change["evidence"]))
            self.assertTrue(any("cannot be detected" in e["excerpt"] for e in change["evidence"]))
        graph = self.by_id["chg-removed-graph-table"]
        self.assertEqual({self.sources[e["source_id"]]["language"] for e in graph["evidence"]},
                         set(LANGUAGES))
        self.assertEqual({self.sources[e["source_id"]]["edition"] for e in graph["evidence"]},
                         {"18.2", "19"})

    def test_every_bundled_php_module_is_an_atomic_v20_runtime_removal(self):
        expected = {"dom": "DOM", "iconv": "Iconv", "libxml": "LibXML", "libxslt": "LibXSLT",
                    "simplexml": "SimpleXML", "gd": "GD", "xml": "XML", "xmlreader": "XMLreader",
                    "xmlwriter": "XMLwriter", "wddx": "WDDX", "zlib": "Zlib", "zip": "Zip"}
        php = [c for c in self.changes if c["id"].startswith("chg-bundled-php-")]
        self.assertEqual(len(php), len(expected))
        for suffix, module in expected.items():
            change = self.by_id[f"chg-bundled-php-{suffix}-removal"]
            self.assertIn(module, change["identifiers"])
            self.assertEqual(change["threshold"]["exact"], "20")
            self.assertEqual((change["type"], change["stage"]), ("removal", "runtime"))
            self.assertTrue(any(e["excerpt"] == module for e in change["evidence"]))
            self.assertIn("FastCGI", change["action"])
        # The old workaround cannot silently become the required final-target fix.
        for suffix in ("apply-transformation", "get-error", "set-parameter"):
            xslt = self.by_id[f"chg-removed-xslt-{suffix}"]
            self.assertIn("external FastCGI", xslt["action"])
            self.assertIn("not as a general XSLT engine", xslt["action"])
            self.assertTrue(any(e["source_id"] == "legacy-v20-deprecated-en"
                                for e in xslt["evidence"]))

    def test_known_features_keep_actual_threshold_platform_and_scope(self):
        for identifier, exact in {
            "chg-colon-identifiers": "19 R4",
            "chg-quicktime-support-removal": "17 R5",
            "chg-pict-rendering-removal": "17 R5",
            "chg-databaseoutsidepackage-ignored": "17 R5",
            "chg-non-unicode-mode-removal": "17 R5",
            "chg-float-field-type-removal": "18",
            "chg-windows-right-to-left-settings-ignored": "17 R4",
            "chg-odbc-pro-removal": "19",
        }.items():
            self.assertEqual(self.by_id[identifier]["threshold"]["exact"], exact)
        self.assertEqual(self.by_id["chg-odbc-pro-removal"]["platforms"], ["all"])
        for identifier in ("chg-oci-macos-removal", "chg-odbc-driver-macos-removal",
                           "chg-databaseoutsidepackage-ignored"):
            self.assertEqual(self.by_id[identifier]["platforms"], ["macos"])
        font = self.by_id["chg-object-set-font-name-parameter"]
        self.assertEqual(font["stage"], "unknown")
        self.assertIn("font-name string", font["action"])
        obj = self.by_id["chg-object-notation-compliance"]
        self.assertEqual(obj["threshold"]["exact"], "20")
        self.assertEqual(obj["applicability"]["formats"], ["binary"])
        self.assertIn("already opened successfully", obj["applicability"]["conditions"][0])
        self.assertFalse(any("-10537" in c["identifiers"] for c in self.changes))
        self.assertIn("Existing stored data are not converted",
                      self.by_id["chg-float-field-type-removal"]["localizations"]["en"]["paragraph"])

    def test_deprecations_unknowns_and_complexity_are_not_invented(self):
        for identifier in ("chg-pdfcreator-driver-deprecation",
                           "chg-write-pro-generic-page-break-deprecation",
                           "chg-deprecated-c-integer", "chg-deprecated-c-string",
                           "chg-deprecated-c-graph", "chg-deprecated-array-string"):
            change = self.by_id[identifier]
            self.assertEqual((change["type"], change["stage"], change["criticality"]),
                             ("deprecation", "modernization", "low"))
        for suffix in ("c-integer", "c-string", "c-graph", "array-string"):
            self.assertEqual(self.by_id["chg-deprecated-" + suffix]["threshold"]["exact"], "12")
        unknowns = {c["id"] for c in self.changes if c["threshold"]["kind"] == "unknown"}
        self.assertEqual(unknowns, {"chg-interprocess-variable-deprecation",
                                   "chg-project-picture-library-call", "chg-project-save-list-call",
                                   "chg-object-set-font-name-parameter"})
        for identifier in unknowns:
            self.assertEqual(self.by_id[identifier]["threshold"],
                             {"exact": None, "bucket": None, "kind": "unknown"})
        for identifier in ("chg-project-picture-library-call", "chg-project-save-list-call"):
            self.assertEqual(self.by_id[identifier]["applicability"]["formats"], ["project"])
        self.assertTrue(all(c["complexity"] == {"level": "unknown"} for c in self.changes))

    def test_full_localizations_honest_review_and_french_identifiers(self):
        for change in self.changes:
            self.assertEqual(set(change["localizations"]), set(LANGUAGES))
            self.assertEqual(change["review_status"], "candidate")
            self.assertNotIn("reviewed_by", change)
            for lang, text in change["localizations"].items():
                self.assertTrue(text["one_line"].strip() and text["paragraph"].strip())
                self.assertEqual(text["provenance"], "generated_candidate")
                if lang != "en":
                    self.assertNotEqual(text["paragraph"], change["localizations"]["en"]["paragraph"])
        self.assertIn("_o_PDFCreator Nom imprimante",
                      self.by_id["chg-pdfcreator-driver-deprecation"]["localizations"]["fr"]["paragraph"])
        self.assertIn("OBJET FIXER ACTIVATION",
                      self.by_id["chg-removed-enable-button"]["localizations"]["fr"]["paragraph"])
        self.assertIn("_o_C_ENTIER", self.by_id["chg-deprecated-c-integer"]["identifiers"])
        glossary = load(ROOT / "data/glossary.json")
        self.assertIn("German v20 PHP section itself is in English", glossary["note"])
        self.assertTrue(all(c["official"][lang] for c in glossary["concepts"] for lang in LANGUAGES))

    def test_pending_and_out_of_scope_sections_remain_explicit(self):
        dispositions = load(ROOT / "data/dispositions.json")
        by_id = {d["id"]: d for d in dispositions}
        self.assertEqual(len(by_id), len(dispositions))
        for v in (16, 17):
            for lang in LANGUAGES:
                self.assertEqual(by_id[f"content-v{v}-overview-children-{lang}"]["status"], "pending")
        for v in (18, 19, 20):
            for section in ("remaining-deprecated-commands", "http-variable-assignment",
                            "subtables", "legacy-file-apis", "numeric-standard-actions", "resource-forks"):
                self.assertEqual(by_id[f"content-v{v}-{section}-en"]["status"], "pending")
        self.assertEqual(by_id["content-v20-object-notation-opening-failure-en"]["status"], "out_of_scope")
        self.assertIn("Automatic Platform",
                      by_id["content-v18-platform-interface-ambiguity-en"]["reason"])
        self.assertIn("GWorld", by_id["content-v18-quickdraw-plugin-context-en"]["reason"])

    def test_live_snapshots_hashes_localized_aliases_and_evidence(self):
        selected = [s for s in self.sources.values()
                    if any(s["id"] == f"legacy-v{v}-deprecated-{lang}"
                           for v in (16, 17, 18, 19, 20) for lang in LANGUAGES)]
        if not all((CACHE / "raw" / (s["id"] + ".html")).exists() for s in selected):
            self.skipTest("The 25 upstream snapshots are intentionally ignored, not redistributed")
        for source in selected:
            raw = (CACHE / "raw" / (source["id"] + ".html")).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), source["fetch"]["sha256"])
            extracted = extract(raw.decode(), source["resolved_url"])
            self.assertEqual(extracted["language"], source["language"])
            self.assertEqual(len(extracted["blocks"]), source["fetch"]["block_count"])
        verify_evidence({"sources": list(self.sources.values()), "changes": self.changes})
        # Official aliases are grounded in a same-language source, not just present.
        cached_blocks = {
            s["id"]: {b["id"]: b for b in load(CACHE / "extracts" / (s["id"] + ".json"))["blocks"]}
            for s in selected
        }
        for change in self.changes:
            french_names = [name for name in change["identifiers"]
                            if name in {"OBJET FIXER POLICE", "_o_C_ENTIER", "_o_C_ALPHA",
                                        "_o_TABLEAU ALPHA", "_o_C_GRAPHE", "_o_PDFCreator Nom imprimante"}]
            for name in french_names:
                self.assertTrue(any(name in cached_blocks[e["source_id"]][e["block_id"]]["text"]
                                    for e in change["evidence"] if e["source_id"].endswith("-fr")))


if __name__ == "__main__":
    unittest.main()

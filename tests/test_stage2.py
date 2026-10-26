"""Evidence and editorial invariants for the legacy Changes/Compatibility batch."""
from collections import Counter
import hashlib
import re
import unittest

from tools.catalog import apply_overrides, bucket, group_entities, verify_evidence
from tools.discover_archive import document_identity
from tools.ingest import CACHE, LANGUAGES, ROOT, extract, load


class LegacyBehaviorSettings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atomic = apply_overrides(load(ROOT / "data/changes.json"), load(ROOT / "data/overrides.json"))
        cls.by_id = {c["id"]: c for c in cls.atomic}
        cls.sources = {s["id"]: s for s in load(ROOT / "data/registry.json")}
        cls.audit = load(ROOT / "data/section-audit.json")
        cls.entities = group_entities(cls.atomic, load(ROOT / "data/groups.json"))

    def test_five_exact_design_editions_and_all_verified_locale_urls(self):
        compatibility = [s for s in self.sources.values() if s["family"] == "compatibility-settings"]
        self.assertEqual(len(compatibility), 25)
        for major, edition, key, root in (
            (20, "20.1", "300-6602324", "100-6602032"),
            (19, "19", "300-5416914", "100-5416591"),
            (18, "18", "300-4575476", "100-4575411"),
            (17, "17.4", "300-4880529", "100-4880454"),
            (16, "16.3", "300-3670711", "100-3670638"),
        ):
            for lang in LANGUAGES:
                source = self.sources[f"legacy-design-v{major}-compatibility-{lang}"]
                self.assertEqual((source["edition"], source["manual"], source["manual_document_key"]),
                                 (edition, "Design Reference", root))
                self.assertEqual(document_identity(source["url"]), (key, lang))
                self.assertEqual(source["fetch"]["status"], "available")
                self.assertTrue(source["fetch"]["manual_document_urls"])
                self.assertEqual(source["discovery"]["method"], "archive_directory_link")
                for parent in source["fetch"]["manual_document_urls"]:
                    self.assertEqual(document_identity(parent), (root, lang))
                    self.assertEqual(parent.rsplit("/", 1)[0], source["url"].rsplit("/", 1)[0])
        # Actual translated slugs, not an English path with a suffix substituted.
        self.assertIn("/Page-Compatibilite.", self.sources["legacy-design-v20-compatibility-fr"]["url"])

    def test_command_display_is_authored_locale_only_with_bilingual_provenance(self):
        glossary = load(ROOT / "data/glossary.json")
        self.assertGreaterEqual(len(glossary["command_names"]), 133)
        if all((CACHE / "extracts" / (e["source_id"] + ".json")).exists()
               for names in glossary["command_names"] for e in names["evidence"]):
            verify_evidence({"sources": list(self.sources.values()), "changes": [],
                             "glossary": glossary})
        for entity in self.entities + self.atomic:
            for language, text in entity["localizations"].items():
                self.assertIsInstance(text["identifiers"], list)
                visible = "\n".join([
                    text["one_line"], text["paragraph"], text["action"],
                    *text["identifiers"],
                    *text.get("conditions", entity["applicability"]["conditions"]),
                    text.get("action_basis", entity.get("action_basis", "")),
                ])
                for names in glossary["command_names"]:
                    wrong = names["en" if language == "fr" else "fr"]
                    self.assertIsNone(re.search(r"(?<!\w)" + re.escape(wrong) + r"(?!\w)", visible),
                                      (entity["id"], language, wrong))
        font = self.by_id["chg-removed-font-number"]
        self.assertEqual(font["localizations"]["fr"]["identifiers"], ["_o_Numéro de police"])
        self.assertIn("_o_Font number", font["identifiers"])
        self.assertIn("_o_Numéro de police", font["identifiers"])
        # Archive typos are not promoted to invented official names.
        self.assertEqual(self.by_id["chg-removed-set-web-timeout"]["localizations"]["fr"]["identifiers"], [])
        graph = self.by_id["chg-removed-graph-table"]
        self.assertEqual(graph["threshold"]["exact"], "14")
        self.assertIn("v14", graph["localizations"]["fr"]["action"])
        self.assertIn("_o_GRAPHE SUR TABLE", graph["localizations"]["fr"]["conditions"][0])

    def test_compiler_requirements_are_distinct_from_post_opening_v20_binary_rule(self):
        for suffix in ("object-notation", "unicode-methods"):
            change = self.by_id["chg-v19-compiler-" + suffix]
            self.assertEqual(change["threshold"], {"exact": "19", "bucket": "v19", "kind": "introduced"})
            self.assertEqual((change["stage"], change["criticality"], change["type"]),
                             ("compilation", "blocking", "restriction"))
            self.assertTrue(any("compilation error" in e["excerpt"] for e in change["evidence"]))
        entity = next(e for e in self.entities if e["id"] == "chg-group-v19-compiler-settings")
        self.assertEqual(len(entity["member_ids"]), 2)
        binary = self.by_id["chg-object-notation-compliance"]
        self.assertEqual((binary["threshold"]["exact"], binary["applicability"]["formats"]), ("20", ["binary"]))
        project = self.by_id["chg-v19-project-recompile"]
        self.assertEqual(project["applicability"]["formats"], ["project"])
        self.assertIn("v18 Rx", project["action"])
        blob = self.by_id["chg-blob-parameter-type-check"]
        self.assertEqual(blob["stage"], "compilation")
        self.assertIsNone(blob["threshold"]["exact"])

    def test_actual_runtime_changes_and_shared_feature_groups(self):
        expected = {
            "range-checking-default": "17 R6", "base64-encode-ok": "18 R4",
            "base64-decode-ok": "18 R4", "base64-invalid-blob-empty": "18 R4",
            "entity-min-empty-undefined": "18 R6", "entity-max-empty-undefined": "18 R6",
            "entity-average-empty-undefined": "18 R6", "orda-rest-explicit-exposure": "18 R5",
            "shareable-entity-add-restriction": "18 R5", "listbox-editing-click-events": "18 R6",
            "path-all-objects-value": "18 R3", "requests-log-fields": "17 R5",
            "requests-log-microseconds": "17 R5", "logs-default-location-v18": "18",
            "write-pro-formula-filtering": "18 R2", "write-pro-freeze-recalculation": "18 R2",
            "icu-68-index-rebuild": "18 R6",
        }
        for suffix, exact in expected.items():
            change = self.by_id["chg-" + suffix]
            self.assertEqual(change["threshold"]["exact"], exact)
            self.assertEqual(change["threshold"]["bucket"], bucket(exact))
        self.assertIn("empties the BLOB", self.by_id["chg-base64-invalid-blob-empty"]["action"])
        self.assertIn("// %R-", self.by_id["chg-range-checking-default"]["action"])
        self.assertIn("// %R*", self.by_id["chg-range-checking-default"]["action"])
        self.assertIn("instead of Null", self.by_id["chg-entity-min-empty-undefined"]["action"])
        self.assertIn("not a universal requirement", self.by_id["chg-shareable-entity-add-restriction"]["action"])
        aggregates = next(e for e in self.entities if e["id"] == "chg-group-empty-entity-aggregates")
        self.assertEqual(len(aggregates["members"]), 3)
        self.assertEqual(set(aggregates["identifiers"]),
                         {"entitySelection.min()", "entitySelection.max()", "entitySelection.average()"})
        self.assertNotIn("chg-base64-invalid-blob-empty",
                         next(e for e in self.entities if e["id"] == "chg-group-base64-status")["member_ids"])

    def test_defaults_are_conditional_and_xml_milestones_are_not_collapsed(self):
        for suffix, exact in {
            "object-date-type-option": "16 R6", "standard-xpath-option": "18 R3",
            "macos-text-lf-option": "19 R2", "macos-xml-lf-option": "19 R3",
            "text-no-bom-option": "19 R2", "xml-no-bom-option": "19 R3",
            "windows-directwrite-option": "19 R3", "new-field-null-mapping-default": "19 R4",
        }.items():
            change = self.by_id["chg-" + suffix]
            self.assertEqual(change["threshold"]["exact"], exact)
            self.assertEqual(change["type"], "behavior")
            self.assertEqual(change["relevance"]["status"], "conditional")
        dates = self.by_id["chg-object-date-type-option"]["action"]
        self.assertIn("existing ISO dates stay unchanged", dates)
        self.assertIn("Upgrading alone does not mandate", dates)
        xpath = self.by_id["chg-standard-xpath-option"]["action"]
        self.assertIn("off for databases converted", xpath)
        self.assertIn("Keep the option off", xpath)
        directwrite = self.by_id["chg-windows-directwrite-option"]
        self.assertEqual(directwrite["platforms"], ["windows"])
        self.assertIn("List boxes already use DirectWrite", directwrite["action"])
        for suffix in ("text", "xml"):
            lf = self.by_id[f"chg-macos-{suffix}-lf-option"]
            self.assertEqual((lf["platforms"], lf["applicability"]["formats"]), (["macos"], ["project"]))
        null = self.by_id["chg-new-field-null-mapping-default"]["action"]
        self.assertIn("for new fields", null)
        self.assertIn("does not rewrite existing fields", null)
        http = self.by_id["chg-http-automatic-variable-assignment"]
        self.assertEqual(http["threshold"]["exact"], "13.4")
        self.assertIn("not a global v14 removal", http["action"])
        network = self.by_id["chg-legacy-network-layer-deprecation"]
        self.assertIsNone(network["threshold"]["exact"])
        history = network["localizations"]["en"]["paragraph"]
        self.assertIn("14 R5", history)
        self.assertIn("later manuals say v15", history)
        self.assertIn("server/client restarts", history)
        self.assertIn("21 R3", network["action"])

    def test_every_block_has_an_honest_audit_disposition(self):
        audited = {sid: audit for sid, audit in self.audit["sources"].items() if sid.startswith("legacy-")}
        self.assertEqual(len(audited), 55)
        statuses = Counter()
        for sid, source_audit in audited.items():
            source = self.sources[sid]
            self.assertEqual(source_audit["source_sha256"], source["fetch"]["sha256"])
            self.assertEqual(source_audit["url"], source["resolved_url"])
            self.assertEqual(source["catalog_scope"]["status"], "systematic_partial")
            blocks = source_audit["blocks"]
            self.assertEqual(len(blocks), source["fetch"]["block_count"])
            self.assertEqual(len({b["block_id"] for b in blocks}), len(blocks))
            for block in blocks:
                statuses[block["status"]] += 1
                self.assertTrue(block["reason"].strip())
                self.assertTrue(block["url"].startswith(source["resolved_url"] + "#"))
                self.assertTrue(set(block["change_ids"]) <= self.by_id.keys())
                self.assertEqual(bool(block["change_ids"]), block["status"] == "cataloged_context")
        self.assertEqual(sum(statuses.values()), 1564)
        self.assertTrue(set(statuses) >= {"pending", "retained_compatibility", "out_of_scope", "automatic_preservation"})
        english = {s: a for s, a in audited.items() if s.endswith("-en")}
        reasons = " ".join(b["reason"] for a in english.values() for b in a["blocks"])
        self.assertIn("not a claim that current v21 QUIC is still beta", reasons.replace("Not", "not"))
        self.assertIn("conversion rewrites it automatically", reasons)
        self.assertIn("Mojave 10.14 is the historical", reasons)
        self.assertIn("macOS OCI is removed in v19", reasons)
        self.assertFalse(any("quic" in c["id"].split("-") for c in self.atomic))

    def test_bounded_detail_links_preserve_real_failures_and_current_available_locations(self):
        details = [s for s in self.sources.values() if s["family"] == "changes-linked-detail"]
        self.assertEqual(len(details), 10)
        for source in details:
            self.assertEqual(source["discovery"]["method"], "archive_directory_link")
            self.assertEqual(source["fetch"]["status"], "available")
            history = source["url_history"][-1]
            self.assertEqual(history["fetch"]["http_status"], 404)
            self.assertEqual(history["discovery"]["method"], "legacy_article_link")
            self.assertEqual(history["disposition"], "superseded_location")
            self.assertNotIn("/doc/", history["url"])
            self.assertIn("/doc/", source["url"])
        self.assertTrue(any(e["source_id"].startswith("legacy-v19-detail-base64-decode-")
                            for e in self.by_id["chg-base64-invalid-blob-empty"]["evidence"]))
        self.assertTrue(any(e["source_id"].startswith("legacy-v19-detail-is-editing-text-")
                            for e in self.by_id["chg-listbox-editing-click-events"]["evidence"]))

    def test_historical_patch_exceptions_and_provenance_remain_explicit(self):
        index = self.by_id["chg-object-index-rare-corruption"]
        self.assertIsNone(index["threshold"]["exact"])
        for corrected in ("16.4 HF1", "17.1", "17 R4"):
            self.assertIn(corrected, index["action"])
        mail = self.by_id["chg-mail-attachment-posix-path"]
        self.assertIsNone(mail["threshold"]["exact"])
        self.assertIn("Englisch", mail["localizations"]["de"]["paragraph"])
        for change in self.atomic:
            self.assertEqual(change["review_status"], "candidate")
            self.assertEqual(change["complexity"], {"level": "unknown"})
            self.assertEqual(set(change["localizations"]), set(LANGUAGES))
        for change in self.atomic[138:192]:
            self.assertEqual({self.sources[e["source_id"]]["language"] for e in change["evidence"]},
                             set(LANGUAGES))
            for locale in change["localizations"].values():
                self.assertTrue(locale["action"].strip())
                self.assertEqual(locale["provenance"], "generated_candidate")

    def test_all_scoped_snapshots_and_exact_audit_blocks_match_current_extractor(self):
        scoped = self.audit["sources"]
        if not all((CACHE / "raw" / (sid + ".html")).exists() for sid in scoped):
            self.skipTest("Public upstream snapshots stay local; offline CI uses committed provenance")
        for sid, source_audit in scoped.items():
            source = self.sources[sid]
            raw = (CACHE / "raw" / (sid + ".html")).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), source_audit["source_sha256"])
            extracted = extract(raw.decode(), source["resolved_url"])
            self.assertEqual(extracted["language"], source["language"])
            self.assertEqual([b["id"] for b in extracted["blocks"]],
                             [b["block_id"] for b in source_audit["blocks"]])
        verify_evidence({"sources": list(self.sources.values()), "changes": self.atomic})


if __name__ == "__main__":
    unittest.main()

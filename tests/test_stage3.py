"""Bounded modern-note evidence, localization and release-history contracts."""
from collections import Counter
from copy import deepcopy
import hashlib
import unittest

from tools.catalog import apply_overrides, bucket, build, group_entities, validate, verify_evidence
from tools.discover_docs import advertised_public_revision
from tools.ingest import CACHE, LANGUAGES, ROOT, EXTRACTOR_VERSION, extract, load


class ModernContent(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atomic = apply_overrides(load(ROOT / "data/changes.json"), load(ROOT / "data/overrides.json"))
        cls.by_id = {c["id"]: c for c in cls.atomic}
        cls.sources = {s["id"]: s for s in load(ROOT / "data/registry.json")}
        cls.scoped = {sid: audit for sid, audit in load(ROOT / "data/section-audit.json")["sources"].items()
                      if sid.startswith("docs-")}
        cls.entities = group_entities(cls.atomic, load(ROOT / "data/groups.json"))

    def test_original_ids_and_groups_survive_and_new_records_are_not_beta(self):
        self.assertEqual(len(self.atomic), 276)
        self.assertEqual(len(self.atomic[192:272]), 80)
        self.assertEqual(len(self.entities), 202)
        self.assertEqual(sum("members" in entity for entity in self.entities), 28)
        self.assertFalse(any(c["threshold"]["exact"] == "21 R5" for c in self.atomic))
        self.assertFalse(any("vector" in c["id"] for c in self.atomic[192:]))
        self.assertEqual(Counter(c["type"] for c in self.atomic),
                         {"behavior": 91, "removal": 83, "deprecation": 66, "restriction": 36})
        self.assertTrue(all(c["complexity"] == {"level": "unknown"} and c["review_status"] == "candidate"
                            for c in self.atomic))

    def test_exact_patch_hf_build_and_branch_thresholds_remain_one_fact(self):
        expected = {
            "time-negative-expression": ["20.7 HF2", "20 R10"],
            "open-datastore-password-default": ["20.3", "20 R4"],
            "filehandle-zero-offset": ["20.1 HF1", "20.2", "20 R2"],
            "tls-authentication-branch-fixes": [
                "19.7 build 288986", "20.2 build 100956", "20 R2 HF1 build 100440", "20 R3"],
        }
        for suffix, releases in expected.items():
            fact = self.by_id["chg-" + suffix]
            self.assertEqual(fact["threshold"]["alternatives"], releases)
            self.assertEqual(fact["threshold"]["bucket"], bucket(fact["threshold"]["exact"]))
            for release in releases:
                self.assertTrue(any(release.replace("build ", "") in e["excerpt"].replace("LTS ", "").replace(", ", " ")
                                    or release.split(" build ")[0] in " / ".join(e.get("section_path", [])) + e["excerpt"]
                                    for e in fact["evidence"]), release)
        tls = self.by_id["chg-tls-authentication-branch-fixes"]
        self.assertIn("not directly impacted", tls["localizations"]["en"]["paragraph"])
        self.assertIn("private server key", tls["action"])

    def test_php_lifecycles_and_final_target_bounds_are_distinct(self):
        modules = [c for c in self.atomic if c["id"].startswith("chg-bundled-php-")]
        self.assertEqual(len(modules), 12)
        self.assertTrue(all(c["threshold"]["exact"] == "20" and c["applies_until"] == "20 R3"
                            for c in modules))
        self.assertEqual(self.by_id["chg-internal-php-interpreter-removal"]["threshold"]["exact"], "20 R3")
        self.assertEqual(self.by_id["chg-php-command-deprecation"]["type"], "deprecation")
        self.assertEqual(self.by_id["chg-php-command-deprecation"]["threshold"]["exact"], "21")
        self.assertEqual(self.by_id["chg-php-settings-page-removed"]["threshold"]["exact"], "21 R3")
        pair = self.by_id["chg-icu-20-1-client-server-pair"]
        self.assertIsNone(pair["applies_until"])
        self.assertEqual(pair["applicability"]["target_releases"], ["20.1"])
        group = next(c for c in self.entities if c["id"] == "chg-group-bundled-php-modules")
        self.assertEqual(group["applies_until"], "20 R3")
        self.assertEqual(self.by_id["chg-legacy-network-layer-deprecation"]["threshold"]["kind"], "unknown")
        self.assertEqual(self.by_id["chg-legacy-network-layer-removal"]["threshold"]["exact"], "21 R3")
        self.assertEqual(self.by_id["chg-legacy-network-layer-removal"]["applicability"]["formats"],
                         ["binary", "project"])

    def test_every_visible_condition_and_rationale_is_precomputed_in_five_languages(self):
        for change in self.atomic + self.entities:
            self.assertEqual(set(change["localizations"]), set(LANGUAGES))
            for language, text in change["localizations"].items():
                self.assertTrue(text["action"].strip(), (change["id"], language))
                self.assertTrue(text["conditions"] and all(s.strip() for s in text["conditions"]),
                                (change["id"], language))
                if change.get("action_basis"):
                    self.assertTrue(text["action_basis"].strip(), (change["id"], language))
                    if language != "en":
                        self.assertNotEqual(text["action_basis"], change["localizations"]["en"]["action_basis"])
                if language != "en":
                    self.assertNotEqual(text["conditions"], change["localizations"]["en"]["conditions"])
                self.assertEqual(text["provenance"], "generated_candidate")
        document = build()
        for field in ("conditions", "action_basis"):
            invalid = deepcopy(document)
            card = next(c for c in invalid["changes"] if c.get("action_basis"))
            del card["localizations"]["ja"][field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate(invalid)

    def test_all_four_families_and_public_revision_have_real_locale_provenance(self):
        self.assertEqual(len(self.scoped), 21)
        for family in ("current", "v21", "v20", "v19", "public"):
            entries = [s for sid, s in self.sources.items() if sid.startswith(f"docs-{family}-release-notes-")]
            self.assertEqual({s["language"] for s in entries}, {"en", "fr", "es", "ja"})
            self.assertTrue(all(s["fetch"]["status"] == "available" for s in entries))
            self.assertTrue(all(s["catalog_scope"]["status"] == "systematic_partial" for s in entries))
        missing = [s for s in load(ROOT / "data/source-locations.json")["unresolved"]
                   if s["status"] == "not_linked"]
        self.assertEqual(len(missing), 5)
        self.assertTrue(all(s["language"] == "de" and "url" not in s and "http_status" not in s for s in missing))
        for change in self.atomic[192:]:
            self.assertFalse(any(self.sources[e["source_id"]]["language"] == "de" for e in change["evidence"]))
        current = self.sources["docs-current-release-notes-en"]
        public = self.sources["docs-public-release-notes-en"]
        self.assertIn({"label": "21 R4", "url": public["url"]}, current["fetch"]["documentation"]["version_links"])
        self.assertEqual(load(ROOT / "data/latest.json")["release"], "21 R4")
        self.assertIn("login-gated", load(ROOT / "data/latest.json")["limitation"])
        extracted = {"documentation": current["fetch"]["documentation"]}
        self.assertEqual(advertised_public_revision(current, extracted, "21 R4")["url"], public["url"])
        with self.assertRaises(ValueError):
            advertised_public_revision(current, extracted, "99 R9")

    def test_every_scoped_block_has_exact_snapshot_bound_disposition(self):
        statuses = Counter()
        for sid, audit in self.scoped.items():
            source = self.sources[sid]
            self.assertEqual(audit["source_sha256"], source["fetch"]["sha256"])
            self.assertEqual(len(audit["blocks"]), source["fetch"]["block_count"])
            self.assertEqual(len({b["block_id"] for b in audit["blocks"]}), len(audit["blocks"]))
            for block in audit["blocks"]:
                statuses[block["status"]] += 1
                self.assertTrue(block["reason"].strip())
                self.assertTrue(set(block["change_ids"]) <= self.by_id.keys())
                self.assertEqual(bool(block["change_ids"]), block["status"] == "cataloged_context")
        self.assertTrue({"cataloged_context", "out_of_scope", "pending", "automatic_preservation"} <= statuses.keys())

    def test_real_optional_end_tags_and_all_scoped_evidence(self):
        if not all((CACHE / "raw" / (sid + ".html")).exists() for sid in self.scoped):
            self.skipTest("Public snapshots remain local; offline fixtures cover the parser")
        for sid, audit in self.scoped.items():
            source = self.sources[sid]
            raw = (CACHE / "raw" / (sid + ".html")).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), source["fetch"]["sha256"])
            extracted = extract(raw.decode(), source["resolved_url"])
            self.assertEqual(extracted["extractor_version"], EXTRACTOR_VERSION)
            self.assertEqual([b["id"] for b in extracted["blocks"]], [b["block_id"] for b in audit["blocks"]])
            if source["family"] == "documentation-release-notes":
                for row in (b for b in extracted["blocks"] if b["cells"]):
                    self.assertEqual(len(row["table_header"]), 4)
                    self.assertLessEqual(len(row["cells"]), 4)  # One upstream rowspan continuation has three.
                if sid == "docs-current-release-notes-en":
                    icu = next(b for b in extracted["blocks"] if b["cells"][:2] == ["ICU", "77.1"])
                    self.assertNotIn("OpenSSL", icu["text"])
                    self.assertNotIn("21 R5", icu["text"])
                if sid == "docs-public-release-notes-en":
                    openssl = next(b for b in extracted["blocks"] if b["cells"][:1] == ["OpenSSL"])
                    self.assertEqual(openssl["cells"][1:3], ["4.0", "21 R4"])
        verify_evidence({"sources": list(self.sources.values()), "changes": self.atomic,
                         "glossary": load(ROOT / "data/glossary.json")})
        for change in self.atomic:
            for evidence in change["evidence"]:
                if evidence["source_id"] in self.scoped:
                    extracted = load(CACHE / "extracts" / (evidence["source_id"] + ".json"))
                    block = next(b for b in extracted["blocks"] if b["id"] == evidence["block_id"])
                    self.assertEqual(evidence["section_path"], block["headings"])


if __name__ == "__main__":
    unittest.main()

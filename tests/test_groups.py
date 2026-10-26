from collections import Counter
from copy import deepcopy
import unittest

from tools.catalog import apply_overrides, build, group_entities, validate, verify_evidence
from tools.ingest import CACHE, LANGUAGES, ROOT, load


class FeatureEntities(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atomic = apply_overrides(load(ROOT / "data/changes.json"), load(ROOT / "data/overrides.json"))
        cls.config = load(ROOT / "data/groups.json")
        cls.entities = group_entities(cls.atomic, cls.config)

    def test_all_facts_have_exactly_one_entity_without_losing_history(self):
        atomic = {c["id"]: c for c in self.atomic}
        members = [mid for entity in self.entities for mid in entity["member_ids"]]
        self.assertEqual(Counter(members), Counter({mid: 1 for mid in atomic}))
        self.assertEqual((len(atomic), len(self.entities), len(self.config["groups"])), (272, 198, 28))
        self.assertEqual(sum(len(e["member_ids"]) for e in self.entities if "members" in e), 102)
        for entity in self.entities:
            for member in entity.get("members", []):
                self.assertEqual(member, atomic[member["id"]])
                self.assertTrue(set(member["identifiers"]) <= set(entity["identifiers"]))
                self.assertTrue(all(e in entity["evidence"] for e in member["evidence"]))
        for identifier in ("chg-colon-identifiers", "chg-pdfcreator-driver-deprecation",
                           "chg-bundled-php-dom-removal"):
            self.assertIn(identifier, members)
        self.assertEqual(group_entities(self.atomic, self.config), self.entities)

    def test_group_summaries_actions_and_complexity_are_authored_not_inherited(self):
        for entity in self.entities:
            self.assertEqual(entity["complexity"], {"level": "unknown"})
            if "members" not in entity:
                continue
            self.assertEqual(set(entity["localizations"]), set(LANGUAGES))
            for lang, text in entity["localizations"].items():
                self.assertTrue(all(text[key].strip() for key in ("one_line", "paragraph", "action")))
                self.assertEqual(text["provenance"], "generated_candidate")
                if lang != "en":
                    self.assertNotEqual(text["paragraph"], entity["localizations"]["en"]["paragraph"])
            self.assertEqual(entity["review_status"], "candidate")

    def test_duplicate_unknown_and_incompatible_members_fail(self):
        for invalid in ("duplicate-owner", "duplicate-member", "unknown-member", "shadow-id"):
            config = deepcopy(self.config)
            if invalid == "duplicate-owner":
                definition = deepcopy(config["groups"][0])
                definition["id"] += "-duplicate"
                config["groups"].append(definition)
            elif invalid == "duplicate-member":
                config["groups"][0]["member_ids"].append(config["groups"][0]["member_ids"][0])
            elif invalid == "unknown-member":
                config["groups"][0]["member_ids"][0] = "chg-not-a-fact"
            else:
                config["groups"][0]["id"] = self.atomic[0]["id"]
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                group_entities(self.atomic, config)
        member_id = self.config["groups"][0]["member_ids"][1]
        for field, value in (("threshold", {"exact": "19 R4", "bucket": "v20", "kind": "introduced"}),
                             ("type", "deprecation"), ("stage", "syntax"), ("platforms", ["macos"]),
                             ("criticality", "low"), ("complexity", {"level": "simple"})):
            atomic = deepcopy(self.atomic)
            next(c for c in atomic if c["id"] == member_id)[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "incompatible"):
                group_entities(atomic, self.config)
        atomic = deepcopy(self.atomic)
        next(c for c in atomic if c["id"] == member_id)["applicability"]["formats"] = ["project"]
        with self.assertRaisesRegex(ValueError, "incompatible"):
            group_entities(atomic, self.config)

    def test_overrides_are_applied_before_grouping_and_prestart_cutoff_is_not_hidden(self):
        graph = next(e for e in self.entities if e["id"] == "chg-removed-graph-table")
        self.assertEqual((graph["threshold"]["exact"], graph["type"]), ("14", "restriction"))
        self.assertIn("formally removed in 17 R5", graph["localizations"]["en"]["paragraph"])
        config = deepcopy(self.config)
        definition = deepcopy(config["groups"][0])
        definition.update(id="chg-group-invalid-removal",
                          member_ids=["chg-removed-graph-table", "chg-removed-add-data-segment"])
        config["groups"] = [definition]
        with self.assertRaisesRegex(ValueError, "incompatible"):
            group_entities(self.atomic, config)

    def test_linked_detail_provenance_and_systematic_partial_scope(self):
        document = build()
        details = [s for s in document["sources"] if s["discovery"]["method"] == "legacy_article_link"]
        self.assertEqual(len(details), 10)
        scoped = [s for s in document["sources"] if s.get("catalog_scope", {}).get("status") == "systematic_partial"]
        self.assertEqual(len(scoped), 76)
        for field, value in (("parent_sha256", "0" * 64), ("document_key", "200-1")):
            invalid = deepcopy(document)
            source = next(s for s in invalid["sources"] if s["id"] == details[0]["id"])
            source["discovery"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate(invalid)
        evidence_sources = {e["source_id"] for c in self.atomic for e in c["evidence"]}
        if not all((CACHE / "extracts" / (sid + ".json")).exists() for sid in evidence_sources):
            self.skipTest("Full documentation extracts are intentionally ignored")
        verify_evidence({"sources": document["sources"], "changes": self.atomic})
        verify_evidence(document)


if __name__ == "__main__":
    unittest.main()

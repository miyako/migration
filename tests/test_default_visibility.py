from copy import deepcopy
import unittest

from tools.catalog import apply_default_visibility, catalog_document, validate_default_visibility
from tools.ingest import ROOT, load


class DefaultVisibility(unittest.TestCase):
    def setUp(self):
        self.changes = [
            {"id": "chg-routine", "member_ids": ["chg-routine"], "criticality": "blocking"},
            {"id": "chg-actionable", "member_ids": ["chg-actionable"], "criticality": "low"},
            {"id": "chg-advisory", "member_ids": ["chg-advisory"]},
            {"id": "chg-group", "member_ids": ["chg-first", "chg-second"],
             "members": [{"id": "chg-first"}, {"id": "chg-second"}]},
        ]
        self.config = {"schema_version": 2, "routine_checks": {
            "chg-routine": {"member_ids": ["chg-routine"], "reason": "Standard version prerequisite."},
            "chg-group": {"member_ids": ["chg-first", "chg-second"],
                          "reason": "Both members describe routine compatibility checks."},
        }, "advisory_items": {
            "chg-advisory": {"member_ids": ["chg-advisory"], "reason": "Optional adoption.",
                             "category": "optional_adoption", "target_releases": ["21", "21 R4"]},
        }}

    def test_explicit_entity_classification_preserves_facts_and_does_not_infer_severity(self):
        original = deepcopy(self.changes)
        records = apply_default_visibility(self.changes, self.config)
        self.assertEqual(self.changes, original)
        self.assertEqual(len(records), len(original))
        for record, source in zip(records, original):
            if record["id"] in self.config["routine_checks"]:
                self.assertEqual(record.pop("default_visibility"), {
                    "category": "routine_check",
                    "reason": self.config["routine_checks"][record["id"]]["reason"],
                })
            elif record["id"] in self.config["advisory_items"]:
                expected = deepcopy(self.config["advisory_items"][record["id"]])
                expected.pop("member_ids")
                self.assertEqual(record.pop("default_visibility"), expected)
            self.assertEqual(record, source)

    def test_invalid_configuration_unknown_ids_and_unreviewed_membership_fail(self):
        for invalid in (None, {}, {"schema_version": 2, "routine_checks": {}},
                        {"schema_version": 1, "routine_checks": []}):
            with self.subTest(config=invalid), self.assertRaises(ValueError):
                apply_default_visibility(self.changes, invalid)
        for value in (None, {}, {"reason": "", "member_ids": ["chg-routine"]},
                      {"reason": "Routine", "member_ids": ["chg-other"]},
                      {"reason": "Routine", "member_ids": ["chg-routine"], "extra": True}):
            config = deepcopy(self.config)
            config["routine_checks"]["chg-routine"] = value
            with self.subTest(classification=value), self.assertRaises(ValueError):
                apply_default_visibility(self.changes, config)
        config = deepcopy(self.config)
        config["routine_checks"]["chg-missing"] = {"reason": "Routine", "member_ids": ["chg-missing"]}
        with self.assertRaisesRegex(ValueError, "unknown entity"):
            apply_default_visibility(self.changes, config)
        changed = deepcopy(self.changes)
        changed[-1]["member_ids"].append("chg-new-actionable-member")
        with self.assertRaisesRegex(ValueError, "reviewed entity membership"):
            apply_default_visibility(changed, self.config)
        config = deepcopy(self.config)
        config["advisory_items"]["chg-routine"] = config["advisory_items"]["chg-advisory"]
        with self.assertRaisesRegex(ValueError, "overlap"):
            apply_default_visibility(self.changes, config)
        for field, value in (("category", "routine_check"), ("category", []),
                             ("target_releases", []), ("target_releases", ["latest"]),
                             ("target_releases", ["21", "21"]), ("target_releases", None)):
            config = deepcopy(self.config)
            config["advisory_items"]["chg-advisory"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                apply_default_visibility(self.changes, config)

    def test_only_supported_documented_metadata_is_valid(self):
        validate_default_visibility({})
        validate_default_visibility({"default_visibility": {
            "category": "routine_check", "reason": "Standard minimum version.",
        }})
        validate_default_visibility({"default_visibility": {
            "category": "deferred_modernization", "reason": "Supported deprecation.",
            "target_releases": ["21", "21 R4"],
        }})
        for value in (None, True, [], {}, {"category": "important", "reason": "Keep"},
                      {"category": "routine_check", "reason": " "},
                      {"category": "routine_check", "reason": "Routine", "extra": True}):
            with self.subTest(metadata=value), self.assertRaises(ValueError):
                validate_default_visibility({"default_visibility": value})

    def test_published_classifications_preserve_all_entities_and_atomic_members(self):
        document = catalog_document()
        classified = {c["id"]: c for c in document["changes"] if "default_visibility" in c}
        configuration = load(ROOT / "data/default-visibility.json")
        config = {**configuration["routine_checks"], **configuration["advisory_items"]}
        self.assertEqual(len(document["changes"]), 202)
        self.assertEqual(len(classified), 27)
        self.assertEqual(len(configuration["routine_checks"]), 11)
        self.assertEqual(sum(c["category"] == "deferred_modernization"
                             for c in configuration["advisory_items"].values()), 7)
        self.assertEqual(sum(c["category"] == "optional_adoption"
                             for c in configuration["advisory_items"].values()), 9)
        self.assertEqual(set(classified), set(config))
        members = [mid for c in document["changes"] for mid in c["member_ids"]]
        self.assertEqual(len(members), 276)
        self.assertEqual(len(set(members)), 276)
        self.assertIn("chg-client-minimum-20-7", classified)
        self.assertNotIn("chg-object-index-rare-corruption", classified)
        self.assertNotIn("chg-legacy-network-layer-deprecation", classified)
        for identifier, change in classified.items():
            self.assertEqual(change["default_visibility"]["reason"], config[identifier]["reason"])
            self.assertEqual(change["member_ids"], config[identifier]["member_ids"])
            self.assertEqual(change["member_ids"], [identifier])
            self.assertTrue(change["evidence"])
            self.assertEqual(len(change["localizations"]), 5)
            if identifier in configuration["advisory_items"]:
                self.assertEqual(change["default_visibility"]["target_releases"], ["21", "21 R4"])


if __name__ == "__main__":
    unittest.main()

"""Fixed editorial contract; proposal perturbations simulate inputs, not model inference."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import unittest

from tools.catalog import apply_overrides, group_entities
from tools.ingest import ROOT, load


AUTHORED_TEXT_FIELDS = ("one_line", "paragraph", "action", "provenance")


def localization_digest(value):
    authored = {language: {key: text[key] for key in AUTHORED_TEXT_FIELDS}
                for language, text in value.items()}
    return hashlib.sha256(json.dumps(
        authored, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


def localized_field_fingerprints(localizations, fields):
    """Fingerprint explicit caller-selected fields; missing fields fail closed."""
    fields = tuple(fields)
    return {
        language: {
            field: hashlib.sha256(json.dumps(
                text[field], ensure_ascii=False, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")).hexdigest()
            for field in fields
        }
        for language, text in localizations.items()
    }


def field_subset_digest(document, paths):
    projected = {}
    for path in paths:
        value = document
        for key in path.removeprefix("/").split("/"):
            value = value[key.replace("~1", "/").replace("~0", "~")]
        projected[path] = value
    return hashlib.sha256(json.dumps(
        projected, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")).hexdigest()


class CuratedContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = load(ROOT / "tests/fixtures/curated-group-contract.json")
        cls.candidates = load(ROOT / "data/changes.json")
        cls.overrides = load(ROOT / "data/overrides.json")
        cls.groups = load(ROOT / "data/groups.json")
        cls.atomic = apply_overrides(cls.candidates, cls.overrides)

    def assert_contract(self, entities, config):
        by_id = {entity["id"]: entity for entity in entities}
        definitions = {group["id"]: group for group in config["groups"]}
        self.assertEqual(len(self.contract["groups"]), 27)
        self.assertEqual(len({g["id"] for g in self.contract["groups"]}), 27)
        for frozen in self.contract["groups"]:
            with self.subTest(group=frozen["id"]):
                definition = definitions[frozen["id"]]
                entity = by_id[frozen["id"]]
                self.assertEqual(definition["member_ids"], frozen["member_ids"])
                self.assertEqual(entity["member_ids"], frozen["member_ids"])
                self.assertEqual([m["id"] for m in entity["members"]], frozen["member_ids"])
                self.assertEqual(localization_digest(definition["localizations"]),
                                 frozen["localizations_sha256"])
                self.assertEqual(localization_digest(entity["localizations"]),
                                 frozen["localizations_sha256"])
                self.assertEqual(entity["action"], definition["localizations"]["en"]["action"])

    def assert_patch(self, actual, patch):
        for key, value in patch.items():
            if isinstance(value, dict):
                self.assert_patch(actual[key], value)
            else:
                self.assertEqual(actual[key], value)

    def assert_localized_fingerprints(self, localizations, expected):
        for language, fingerprints in expected.items():
            actual = localized_field_fingerprints(
                {language: localizations[language]}, fingerprints.keys())
            self.assertEqual(actual[language], fingerprints)

    def test_fixed_curated_assignments_text_and_override_document(self):
        self.assertEqual(self.contract["localized_text_fields"], list(AUTHORED_TEXT_FIELDS))
        self.assertEqual(field_subset_digest(self.overrides, self.contract["override_core_paths"]),
                         self.contract["override_core_sha256"])
        # Original document hashes record provenance; additive fields/groups are allowed.
        for key in ("baseline_groups_document_sha256", "baseline_overrides_document_sha256"):
            self.assertRegex(self.contract[key], r"^[0-9a-f]{64}$")
        entities = group_entities(self.atomic, self.groups)
        self.assertEqual(entities, group_entities(
            apply_overrides(self.candidates, self.overrides), self.groups))
        self.assert_contract(entities, self.groups)
        self.assertEqual(Counter(mid for entity in entities for mid in entity["member_ids"]),
                         Counter(c["id"] for c in self.atomic))

    def test_additive_override_conditions_preserve_original_deep_subset(self):
        augmented = deepcopy(self.overrides)
        texts = augmented["changes"]["chg-removed-graph-table"]["patch"]["localizations"]
        for language in ("en", "de", "es", "ja"):
            texts[language].setdefault("conditions", [f"Synthetic {language} condition"])
        paths = self.contract["override_core_paths"]
        self.assertEqual(field_subset_digest(augmented, paths), self.contract["override_core_sha256"])
        for path in paths:
            changed = deepcopy(augmented)
            parent = changed
            keys = path.removeprefix("/").split("/")
            for key in keys[:-1]:
                parent = parent[key]
            parent[keys[-1]] = "Changed protected value"
            with self.subTest(path=path):
                self.assertNotEqual(field_subset_digest(changed, paths),
                                    self.contract["override_core_sha256"])
        missing = deepcopy(augmented)
        del missing["changes"]["chg-removed-graph-table"]["patch"]["localizations"]["fr"]["conditions"]
        with self.assertRaises(KeyError):
            field_subset_digest(missing, paths)

    def assert_local_fields(self, authored, projected):
        for language, text in authored.items():
            for field in ("conditions", "action_basis"):
                if field not in text:
                    continue
                with self.subTest(language=language, field=field):
                    value = text[field]
                    if field == "conditions":
                        self.assertIsInstance(value, list)
                        self.assertTrue(value)
                        self.assertTrue(all(isinstance(item, str) and item.strip() for item in value))
                    else:
                        self.assertIsInstance(value, str)
                        self.assertTrue(value.strip())
                    self.assertEqual(projected[language][field], value)

    def test_available_localized_conditions_and_rationale_survive_projection(self):
        entities = group_entities(self.atomic, self.groups)
        by_id = {e["id"]: e for e in entities}
        for definition in self.groups["groups"]:
            self.assert_local_fields(definition["localizations"],
                                     by_id[definition["id"]]["localizations"])
        members = {member["id"]: member for entity in entities
                   for member in entity.get("members", [entity])}
        for atomic in self.atomic:
            self.assert_local_fields(atomic["localizations"],
                                     members[atomic["id"]]["localizations"])

    def test_additive_group_locale_fields_do_not_change_frozen_prose_hashes(self):
        config = deepcopy(self.groups)
        for definition in config["groups"]:
            for language, text in definition["localizations"].items():
                text.setdefault("conditions", [f"Synthetic {language} localized applicability"])
                text.setdefault("action_basis", f"Synthetic {language} localized rationale")
        entities = group_entities(self.atomic, config)
        self.assert_contract(entities, config)
        by_id = {e["id"]: e for e in entities}
        for definition in config["groups"]:
            self.assert_local_fields(definition["localizations"],
                                     by_id[definition["id"]]["localizations"])
        changed = deepcopy(config)
        changed["groups"][0]["localizations"]["fr"]["paragraph"] += " Changed authored prose."
        self.assertNotEqual(localization_digest(changed["groups"][0]["localizations"]),
                            self.contract["groups"][0]["localizations_sha256"])

    def test_caller_supplied_fingerprints_can_protect_future_localized_fields(self):
        # Synthetic helper coverage, not the pending all-fact/all-group authored baseline.
        localized = {
            language: {"conditions": [f"Synthetic {language} condition"],
                       "action_basis": f"Synthetic {language} rationale"}
            for language in ("en", "fr", "de", "es", "ja")
        }
        expected = localized_field_fingerprints(localized, ("conditions", "action_basis"))
        self.assert_localized_fingerprints(deepcopy(localized), expected)
        augmented = deepcopy(localized)
        for text in augmented.values():
            text["unrelated_future_field"] = "Additive metadata"
        self.assert_localized_fingerprints(augmented, expected)
        for field, value in (("conditions", ["Changed condition"]),
                             ("action_basis", "Changed rationale")):
            changed = deepcopy(localized)
            changed["fr"][field] = value
            with self.subTest(field=field), self.assertRaises(AssertionError):
                self.assert_localized_fingerprints(changed, expected)
        missing = deepcopy(localized)
        del missing["ja"]["action_basis"]
        with self.assertRaises(KeyError):
            self.assert_localized_fingerprints(missing, expected)

    def test_simulated_proposal_reordering_swapping_and_replacement_cannot_recurate(self):
        proposals = deepcopy(self.candidates)
        payloads = [deepcopy(c["localizations"]) for c in reversed(proposals)]
        for index, (candidate, swapped) in enumerate(zip(proposals, payloads)):
            candidate["localizations"] = swapped
            candidate["action"] = f"Synthetic proposal action {index}"
            for language, text in candidate["localizations"].items():
                for key in ("one_line", "paragraph", "action"):
                    text[key] = f"Synthetic replacement {index}/{language}/{key}"
        proposals.reverse()
        self.assertNotEqual(proposals[0]["id"], self.candidates[0]["id"])
        self.assertNotEqual(proposals[0]["localizations"], self.candidates[-1]["localizations"])
        overridden = apply_overrides(proposals, self.overrides)
        entities = group_entities(overridden, self.groups)
        self.assert_contract(entities, self.groups)
        by_id = {c["id"]: c for c in overridden}
        flattened = {member["id"]: member for entity in entities
                     for member in entity.get("members", [entity])}
        for identifier, override in self.overrides["changes"].items():
            self.assert_patch(by_id[identifier], override["patch"])
            self.assert_patch(flattened[identifier], override["patch"])
            self.assertEqual(by_id[identifier]["editorial_override"],
                             {"reason": override["reason"]})
        for entity in entities:
            for member in entity.get("members", []):
                self.assertEqual(member, by_id[member["id"]])
        # Entity emission follows input order; identity/content comparison is by stable ID.
        self.assertEqual({e["id"]: e for e in entities},
                         {e["id"]: e for e in group_entities(list(reversed(overridden)), self.groups)})

    def test_unmatched_fact_remains_singleton_without_stealing_curated_members(self):
        fact = deepcopy(self.atomic[0])
        fact["id"] = "chg-synthetic-unmatched-contract-fact"
        fact["identifiers"] = ["SYNTHETIC_UNMATCHED"]
        entities = group_entities(self.atomic + [fact], self.groups)
        self.assert_contract(entities, self.groups)
        singleton = next(e for e in entities if e["id"] == fact["id"])
        self.assertEqual(singleton, {**fact, "member_ids": [fact["id"]]})
        self.assertNotIn("members", singleton)
        self.assertEqual(sum(fact["id"] in e["member_ids"] for e in entities), 1)

    def test_missing_source_member_raises_instead_of_silently_dropping(self):
        # No source-removal pipeline exists: exercise its observable missing-fact boundary.
        for frozen in self.contract["groups"]:
            missing = frozen["member_ids"][0]
            with self.subTest(missing=missing), self.assertRaisesRegex(ValueError, "unknown atomic IDs"):
                group_entities([c for c in self.atomic if c["id"] != missing], self.groups)

    def test_duplicate_assignments_and_members_are_rejected(self):
        for invalid in ("duplicate-owner", "duplicate-member", "unknown-member"):
            config = deepcopy(self.groups)
            if invalid == "duplicate-owner":
                definition = deepcopy(config["groups"][0])
                definition["id"] = "chg-group-synthetic-duplicate-owner"
                config["groups"].append(definition)
                error = "multiple entities"
            elif invalid == "duplicate-member":
                config["groups"][0]["member_ids"].append(config["groups"][0]["member_ids"][0])
                error = "distinct explicit members"
            else:
                config["groups"][0]["member_ids"][0] = "chg-synthetic-missing-member"
                error = "unknown atomic IDs"
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, error):
                group_entities(self.atomic, config)

    def test_incompatible_cutoffs_and_bounds_are_rejected(self):
        member_id = self.contract["groups"][0]["member_ids"][1]
        for field, value, error in (
            ("threshold", {"exact": "19 R4", "bucket": "v20", "kind": "introduced"}, "incompatible"),
            ("applies_until", "99", "incompatible"),
            ("applies_until", "20", "must follow"),
            ("applies_until", "not-a-release", "Invalid exact release"),
        ):
            atomic = deepcopy(self.atomic)
            next(c for c in atomic if c["id"] == member_id)[field] = value
            with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, error):
                group_entities(atomic, self.groups)


if __name__ == "__main__":
    unittest.main()

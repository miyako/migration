"""Release identity, backport cutoffs and exclusive final-target bounds."""
from copy import deepcopy
import unittest

from tools.catalog import (apply_overrides, bucket, build, group_entities, release_key,
                           validate, validate_documentation_version_link, validate_localized_applicability,
                           validate_version_applicability)
from tools.ingest import LANGUAGES, ROOT, load


class VersionApplicability(unittest.TestCase):
    def record(self):
        return {
            "id": "chg-branch-test",
            "threshold": {
                "kind": "target_requirement", "exact": "19.7 build288986", "bucket": "v19",
                "alternatives": ["19.7 build288986", "20.2 build100956",
                                 "20 R2 HF1 build100440", "20 R3"],
            },
            "applies_until": None,
        }

    def test_release_order_and_buckets_do_not_rewrite_exact_identity(self):
        releases = ["19.7 build288986", "20", "20.2 build100956", "20.3", "20 R2",
                    "20 R2 HF1 build100440", "20 R3", "21", "21 R3", "21 R4", "21 R5"]
        self.assertEqual(sorted(releases, key=release_key), releases)
        for release, expected in (("19.7 build288986", "v19"), ("20.3", "v20"),
                                  ("20 R2 HF1 build100440", "v21"), ("21 R3", "latest")):
            self.assertEqual(bucket(release), expected)
        self.assertEqual(release_key("4D v20R2 HF1 (build 100440)"),
                         release_key("20 R2 HF1 build100440"))
        for invalid in ("release 20", "20 R", "20 build1)", "20 beta", None):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                release_key(invalid)
        record = self.record()
        original = deepcopy(record)
        validate_version_applicability(record)
        self.assertEqual(record, original)

    def test_pinned_public_documentation_requires_the_actual_advertised_label_url_pair(self):
        sources = {source["id"]: source for source in load(ROOT / "data/registry.json")}
        public = sources["docs-public-release-notes-en"]
        validate_documentation_version_link(public, sources)
        for field, value in (("parent", "https://developer.4d.com/docs/unknown/Notes/updates"),
                             ("parent_sha256", "0" * 64), ("label", "21 R3")):
            invalid = deepcopy(public)
            invalid["discovery"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_documentation_version_link(invalid, sources)
        invalid = deepcopy(public)
        invalid["url"] = "https://developer.4d.com/docs/21-R3/Notes/updates"
        with self.assertRaises(ValueError):
            validate_documentation_version_link(invalid, sources)
        for invalid_links in ([], [{"label": "21 R4", "url": "https://developer.4d.com/docs/21-R3/Notes/updates"}],
                              [{"label": "21 R3", "url": public["url"]}]):
            invalid_sources = deepcopy(sources)
            parent = invalid_sources["docs-current-release-notes-en"]
            parent["fetch"]["documentation"]["version_links"] = invalid_links
            with self.subTest(links=invalid_links), self.assertRaisesRegex(ValueError, "advertised together"):
                validate_documentation_version_link(public, invalid_sources)

    def test_alternatives_and_bounds_are_validated_including_overrides(self):
        record = self.record()
        for bound in (None, "v21", "21 R3", "latest"):
            validate_version_applicability({**record, "applies_until": bound})
        for alternatives in (None, [], "20 R3", ["20 R3"],
                             [record["threshold"]["exact"]] * 2,
                             [record["threshold"]["exact"], "garbage"]):
            invalid = deepcopy(record)
            invalid["threshold"]["alternatives"] = alternatives
            with self.subTest(alternatives=alternatives), self.assertRaises(ValueError):
                validate_version_applicability(invalid)
        for bound in ("20 R3", "19", "", "invalid", 21):
            overrides = {"schema_version": 1, "changes": {record["id"]: {
                "reason": "Synthetic bounded workaround", "patch": {"applies_until": bound}}}}
            with self.subTest(bound=bound), self.assertRaises(ValueError):
                apply_overrides([record], overrides)
        unknown = {"id": "chg-unknown", "threshold": {
            "exact": None, "bucket": None, "kind": "unknown"}, "applies_until": "20 R3"}
        validate_version_applicability(unknown)
        unknown["threshold"]["alternatives"] = ["20"]
        with self.assertRaises(ValueError):
            validate_version_applicability(unknown)

    def test_primary_bucket_is_its_own_release_not_an_alternative_bucket(self):
        alternatives = ["19.7 build 288986", "20.2 build 100956",
                        "20 R2 HF1 build 100440", "20 R3"]
        for exact, expected_bucket in zip(alternatives, ["v19", "v20", "v21", "v21"]):
            record = self.record()
            record["threshold"].update(exact=exact, bucket=expected_bucket, alternatives=alternatives)
            validate_version_applicability(record)
            for wrong_bucket in {"v19", "v20", "v21", "latest"} - {expected_bucket}:
                overrides = {"schema_version": 1, "changes": {record["id"]: {
                    "reason": "Primary bucket must follow its own exact release",
                    "patch": {"threshold": {"bucket": wrong_bucket}}}}}
                with self.subTest(exact=exact, bucket=wrong_bucket), self.assertRaisesRegex(
                        ValueError, "Incorrect bucket"):
                    apply_overrides([record], overrides)

    def test_exact_target_constraints_are_validated_without_inventing_an_end_bound(self):
        record = self.record()
        record["applicability"] = {"target_releases": ["20.1"]}
        validate_version_applicability(record)
        self.assertIsNone(record["applies_until"])
        for targets in (None, [], ["latest"], ["20.1", "20.1"], ["invalid"], [20.1]):
            invalid = deepcopy(record)
            invalid["applicability"]["target_releases"] = targets
            with self.subTest(targets=targets), self.assertRaises(ValueError):
                validate_version_applicability(invalid)

    def test_localized_conditions_actions_and_rationales_are_required_and_not_english_copies(self):
        record = {"id": "chg-localization-test", "identifiers": ["JSON Validate", "_o_COMMAND"],
                  "action_basis": "Based on documented behavior.",
                  "localizations": {
                      language: {"conditions": [condition], "action": action, "action_basis": basis}
                      for language, condition, action, basis in [
                          ("en", "The application uses this command.", "Use a project.",
                           "Based on documented behavior."),
                          ("fr", "L’application utilise cette commande.", "Utilisez un projet.",
                           "Fondé sur le comportement documenté."),
                          ("de", "Die Anwendung verwendet diesen Befehl.", "Verwenden Sie ein Projekt.",
                           "Auf Grundlage des dokumentierten Verhaltens."),
                          ("es", "La aplicación utiliza este comando.", "Utilice un proyecto.",
                           "Basado en el comportamiento documentado."),
                          ("ja", "アプリケーションがこのコマンドを使用しています。", "プロジェクトを使用してください。",
                           "文書化された動作に基づきます。"),
                      ]}}
        validate_localized_applicability(record)
        for language in LANGUAGES:
            for field in ("conditions", "action", "action_basis"):
                invalid = deepcopy(record)
                del invalid["localizations"][language][field]
                with self.subTest(language=language, field=field), self.assertRaises(ValueError):
                    validate_localized_applicability(invalid)
            invalid = deepcopy(record)
            invalid["localizations"][language]["conditions"] = []
            with self.subTest(language=language, empty_conditions=True), self.assertRaises(ValueError):
                validate_localized_applicability(invalid)
        for field in ("conditions", "action_basis"):
            invalid = deepcopy(record)
            invalid["localizations"]["fr"][field] = deepcopy(invalid["localizations"]["en"][field])
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "English fallback"):
                validate_localized_applicability(invalid)
        for text in record["localizations"].values():
            text.update(conditions=["_o_COMMAND", "JSON Validate"], action_basis="_o_COMMAND")
        validate_localized_applicability(record)
        for text in record["localizations"].values():
            text["conditions"] = ["Application uses _o_COMMAND."]
        with self.assertRaisesRegex(ValueError, "English fallback"):
            validate_localized_applicability(record)

    def test_group_conditions_and_rationales_are_authored_not_inherited(self):
        atomic = apply_overrides(load(ROOT / "data/changes.json"), load(ROOT / "data/overrides.json"))
        config = load(ROOT / "data/groups.json")
        definition = config["groups"][0]
        for field in ("conditions", "action_basis", "action"):
            invalid = deepcopy(config)
            del invalid["groups"][0]["localizations"]["ja"][field]
            with self.subTest(field=field), self.assertRaises(ValueError):
                group_entities(atomic, invalid)
        definition["localizations"]["en"]["conditions"] = ["Authored condition for this group."]
        definition["localizations"]["en"]["action_basis"] = "Authored rationale for this group."
        entity = next(c for c in group_entities(atomic, config) if c["id"] == definition["id"])
        self.assertEqual(entity["applicability"]["conditions"], ["Authored condition for this group."])
        self.assertEqual(entity["action_basis"], "Authored rationale for this group.")
        for language in LANGUAGES:
            self.assertEqual(entity["localizations"][language]["action_basis"],
                             definition["localizations"][language]["action_basis"])

    def test_groups_and_published_groups_preserve_full_applicability(self):
        atomic = apply_overrides(load(ROOT / "data/changes.json"), load(ROOT / "data/overrides.json"))
        config = load(ROOT / "data/groups.json")
        by_id = {change["id"]: change for change in atomic}
        unbounded = next(definition for definition in config["groups"]
                         if all(by_id[mid]["applies_until"] is None for mid in definition["member_ids"]))
        member_id = unbounded["member_ids"][1]
        for field, value in (("applies_until", "21 R3"), ("threshold", self.record()["threshold"])):
            changed = deepcopy(atomic)
            next(c for c in changed if c["id"] == member_id)[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "incompatible"):
                group_entities(changed, config)
        changed = deepcopy(atomic)
        next(c for c in changed if c["id"] == member_id)["applicability"]["target_releases"] = ["20.1"]
        with self.assertRaisesRegex(ValueError, "incompatible"):
            group_entities(changed, config)
        document = build()
        group = next(c for c in document["changes"] if len(c.get("members", [])) > 1)
        group["applies_until"] = "21 R3"
        for member in group["members"]:
            member["applies_until"] = "21 R3"
        validate(document)
        group["members"][1]["applies_until"] = "21 R4"
        with self.assertRaisesRegex(ValueError, "Published group metadata"):
            validate(document)
        group["members"][1]["applies_until"] = group["applies_until"]
        group["threshold"] = deepcopy(self.record()["threshold"])
        for member in group["members"]:
            member["threshold"] = deepcopy(group["threshold"])
        validate(document)
        group["members"][1]["threshold"]["alternatives"].pop()
        with self.assertRaisesRegex(ValueError, "Published group metadata"):
            validate(document)
        group["members"][1]["threshold"] = deepcopy(group["threshold"])
        group["applicability"]["target_releases"] = ["20.1"]
        for member in group["members"]:
            member["applicability"]["target_releases"] = ["20.1"]
        validate(document)
        group["members"][1]["applicability"]["target_releases"] = ["20.2"]
        with self.assertRaisesRegex(ValueError, "Published group metadata"):
            validate(document)


if __name__ == "__main__":
    unittest.main()

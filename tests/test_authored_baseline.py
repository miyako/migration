"""Committed authored fields are durable editorial inputs, not model caches."""
import hashlib
import json
import unittest

from tools.ingest import ROOT, load


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


class AuthoredBaseline(unittest.TestCase):
    def test_every_committed_authored_field_matches_the_reviewable_baseline(self):
        fixture = load(ROOT / "tests/fixtures/authored-baseline.json")
        for document, expected in fixture["documents"].items():
            data = load(ROOT / "data" / (document + ".json"))
            records = data["groups"] if document == "groups" else data
            by_id = {record["id"]: record for record in records}
            self.assertTrue(expected.keys() <= by_id.keys())
            for cid, localized in expected.items():
                for language, digest in localized.items():
                    self.assertEqual(fingerprint(by_id[cid]["localizations"][language]), digest,
                                     (cid, language))
        self.assertEqual(fingerprint(load(ROOT / "data/overrides.json")), fixture["overrides_sha256"])
        self.assertEqual(fingerprint(load(ROOT / "data/groups.json")), fixture["groups_sha256"])

if __name__ == "__main__":
    unittest.main()

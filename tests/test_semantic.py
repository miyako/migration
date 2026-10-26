from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from tools.catalog import build, catalog_document
from tools.ingest import ROOT
from tools.semantic import validate_index, validate_config, corpus_rows


class SemanticContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = build()

    def test_offline_index_integrity_all_locales(self):
        manifest = validate_index(self.catalog, ROOT / "data/search")
        for language, entry in manifest["languages"].items():
            self.assertEqual(len(entry["ids"]), 276)
            self.assertEqual(entry["bytes"], 276 * 768 * 4)
            self.assertEqual(len(corpus_rows(self.catalog, language)), 276)

    def test_content_changes_require_explicit_reindex_not_regeneration(self):
        changed = deepcopy(self.catalog)
        changed["changes"][0]["localizations"]["ja"]["paragraph"] += " altered"
        with self.assertRaisesRegex(ValueError, "Stale semantic corpus"):
            validate_index(changed, ROOT / "data/search")

    def test_reindex_can_assemble_fresh_authored_corpus_without_publication(self):
        self.assertEqual(catalog_document()["changes"], self.catalog["changes"])

    def test_model_changes_cannot_reuse_old_vectors(self):
        changed = deepcopy(self.catalog)
        changed["semantic_search"]["runtime"]["transformers"] = "next"
        with self.assertRaisesRegex(ValueError, "model contract"):
            validate_index(changed, ROOT / "data/search")
        for field, value in (("model", "different"), ("status", "available"), ("dimensions", 256)):
            config = deepcopy(self.catalog["semantic_search"])
            config[field] = value
            with self.assertRaisesRegex(ValueError, "model contract"):
                validate_config(config)

    def test_corrupt_vector_asset_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            for path in (ROOT / "data/search").iterdir():
                if path.name.endswith((".json", ".f32")):
                    (target / path.name).write_bytes(path.read_bytes())
            path = target / "en.f32"
            path.write_bytes(bytes(path.stat().st_size))
            with self.assertRaisesRegex(ValueError, "checksum"):
                validate_index(self.catalog, target)

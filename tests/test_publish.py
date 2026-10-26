from pathlib import Path
import re
from shutil import copytree
from tempfile import TemporaryDirectory
import unittest

from tools.ingest import ROOT
from tools.publish import publish


class Publication(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "source"
        self.output = Path(self.temp.name) / "output"
        copytree(ROOT / "site", self.source)
        (self.source / "data").mkdir(exist_ok=True)
        (self.source / "data/catalog.json").write_text('{"fixture":true}\n')

    def test_deterministic_complete_relative_graph(self):
        release = publish(self.source, self.output)
        self.assertEqual(release, publish(self.source, self.output))
        html = (self.output / "index.html").read_text()
        for reference in re.findall(r'(?:src|href)="(\./[^"#]+)', html):
            self.assertTrue(reference.startswith(f"./{release.as_posix()}/"), reference)
            self.assertTrue((self.output / reference).is_file(), reference)
        for name in ("app.mjs", "logic.mjs", "styles.css", "4d.svg", "data/catalog.json"):
            self.assertEqual((self.source / name).read_bytes(),
                             (self.output / release / name).read_bytes())
        self.assertFalse((self.output / release / "logic.test.mjs").exists())
        self.assertFalse((self.output / release / "README.md").exists())
        self.assertFalse((self.output / "app.mjs").exists())
        self.assertIn("from './logic.mjs'", (self.output / release / "app.mjs").read_text())
        self.assertIn("new URL('./data/catalog.json', import.meta.url)",
                      (self.output / release / "app.mjs").read_text())

    def test_every_runtime_change_invalidates_whole_release(self):
        previous = publish(self.source, self.output)
        for name in ("index.html", "app.mjs", "logic.mjs", "styles.css", "4d.svg", "data/catalog.json"):
            with self.subTest(name=name):
                path = self.source / name
                path.write_bytes(path.read_bytes() + b"\n")
                current = publish(self.source, self.output)
                self.assertNotEqual(previous, current)
                html = (self.output / "index.html").read_text()
                self.assertIn(f"./{current.as_posix()}/app.mjs", html)
                self.assertNotIn(previous.as_posix(), html)
                previous = current

    def test_missing_required_file_fails_before_writing(self):
        (self.source / "data/catalog.json").unlink()
        with self.assertRaisesRegex(ValueError, "data/catalog.json"):
            publish(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_source_cannot_be_output_or_nested_with_output(self):
        for output in (self.source, self.source / "output", self.source.parent):
            with self.subTest(output=output), self.assertRaises(ValueError):
                publish(self.source, output)

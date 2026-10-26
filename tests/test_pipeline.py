from copy import deepcopy
from email.message import Message
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.parse import urljoin
from urllib.request import urlopen

from tools.catalog import apply_overrides, bucket, build, merge_candidates, validate, verify_evidence
from tools.ingest import availability, CurlResponse, DOM, extract, fetch_one, initial_registry, load, ROOT


class Versions(unittest.TestCase):
    def test_exact_and_historical_r_buckets(self):
        for release, expected in {
            "15 R4": "v16", "19 R4": "v20", "20 R10": "v21",
            "21 R2": "latest", "v18.2": "v18", "4D v16.3": "v16",
            "16 R2": "v17", "16 R6": "v17", "21": "v21",
        }.items():
            with self.subTest(release=release):
                self.assertEqual(bucket(release), expected)
        self.assertEqual(bucket("21 R4", current_major=22), "v22")

    def test_no_invented_release(self):
        for release in ("latest", "v19 next", "R4", "", "v20!"):
            with self.assertRaises(ValueError):
                bucket(release)


class Extraction(unittest.TestCase):
    def test_heading_table_code_anchor_and_relative_urls(self):
        html = """<html lang="fr"><title>Guide</title><h1>Guide</h1>
        <h4><a name="42">Introduced in 18 R6</a></h4>
        <div id="Paragraph_text_42"><table><tr><th>API</th><th>Change</th></tr>
        <tr><td>min()</td><td>Undefined</td></tr></table>
        <pre>if (x &lt; 2)\n  run()</pre><p>A new rule.</p>
        <a href="/4Dv20/example.html">Details</a></div></html>"""
        result = extract(html, "https://example.test/doc/4Dv20/a.fr.html")
        self.assertEqual(result["language"], "fr")
        row = next(b for b in result["blocks"] if b["cells"] == ["min()", "Undefined"])
        self.assertEqual(row["headings"], ["Guide", "Introduced in 18 R6"])
        self.assertEqual(row["table_header"], ["API", "Change"])
        self.assertEqual(row["url"], "https://example.test/doc/4Dv20/a.fr.html#42")
        self.assertTrue(any(b["kind"] == "code" and "x < 2" in b["text"] and "\n" in b["text"]
                            for b in result["blocks"]))
        self.assertEqual(result["links"][-1]["url"], "https://example.test/4Dv20/example.html")
        self.assertEqual(row["id"], extract(html, "https://example.test/other")["blocks"][1]["id"])

    def test_wordpress_alternates_and_scope(self):
        html = """<html lang="en-US"><title>News</title>
        <link rel="alternate" hreflang="ja" href="/ja/article/">
        <nav><p>Noise</p></nav><article><h1>Version</h1>
        <div class="entry-content"><h2>Topic</h2><p>Actual content.</p></div>
        <p>Outside content</p></article></html>"""
        result = extract(html, "https://blog.example.test/article/")
        self.assertEqual([b["text"] for b in result["blocks"]], ["Actual content."])
        self.assertEqual(result["alternates"], [{"language": "ja", "url": "https://blog.example.test/ja/article/"}])

    def test_soft404_language_and_unrecognized_content(self):
        for title in ("404", "Page not found", "Page introuvable", "Seite nicht gefunden"):
            doc = extract(f"<html lang='en'><title>{title}</title><p>Try again.</p></html>", "https://example.test")
            self.assertEqual(availability(doc, "en"), "soft_404")
        valid = extract("<html lang='en'><title>Guide</title><p>Content</p></html>", "https://example.test")
        self.assertEqual(availability(valid, "fr"), "language_mismatch")
        self.assertEqual(availability(valid, "en"), "available")
        self.assertEqual(availability(extract("<title>Guide</title>", "https://example.test"), "en"), "unrecognized_content")

    def test_unavailable_retains_source_and_prior_provenance(self):
        from urllib.error import HTTPError
        entry = {"id": "s", "url": "https://example.test/missing", "language": "en",
                 "fetch": {"status": "available", "sha256": "a" * 64, "fetched_at": "previous"}}
        with patch("tools.ingest.urlopen", side_effect=HTTPError(entry["url"], 404, "Gone", {}, None)):
            fetched, links = fetch_one(entry)
        self.assertEqual(fetched["url"], entry["url"])
        self.assertEqual(fetched["fetch"]["status"], "unavailable")
        self.assertEqual(fetched["fetch"]["sha256"], "a" * 64)
        self.assertEqual(links, [])

    def test_conditional_cache_changed_diff_and_redirect_language(self):
        from urllib.error import HTTPError
        entry = {"id": "s", "url": "https://example.test/guide", "language": "en", "fetch": {"status": "not_fetched"}}
        body = b"<html lang='en'><title>Guide</title><p>Old rule.</p></html>"
        headers = Message()
        headers["Content-Type"] = "text/html; charset=utf-8"
        headers["ETag"] = '"revision-one"'
        def response(content, resolved=entry["url"]):
            return CurlResponse(content, {"http_code": 200, "url_effective": resolved}, headers)
        with tempfile.TemporaryDirectory() as directory, patch("tools.ingest.CACHE", Path(directory)):
            with patch("tools.ingest.open_source", return_value=response(body)):
                fetched, _ = fetch_one(entry)
            self.assertEqual(fetched["fetch"]["sha256"], hashlib.sha256(body).hexdigest())
            def not_modified(request, transport):
                self.assertEqual(request.get_header("If-none-match"), '"revision-one"')
                raise HTTPError(entry["url"], 304, "Not modified", {}, None)
            with patch("tools.ingest.open_source", side_effect=not_modified), patch("tools.ingest.extract") as parser:
                cached, _ = fetch_one(fetched)
                parser.assert_not_called()
            self.assertEqual(cached["fetch"]["status"], "available")
            self.assertEqual(cached["fetch"]["http_status"], 304)
            # Changing only content affects this source and creates a local diff.
            changed = body.replace(b"Old rule.", b"New rule.")
            with patch("tools.ingest.open_source", return_value=response(changed)):
                updated, _ = fetch_one(cached)
            diff = (Path(directory) / "diffs/s.diff").read_text()
            self.assertIn("Old rule.", diff)
            self.assertIn("New rule.", diff)
            self.assertEqual(updated["fetch"]["previous_sha256"], fetched["fetch"]["sha256"])
            with patch("tools.ingest.open_source", return_value=response(body, "https://example.test/en/fallback")):
                localized, _ = fetch_one({**entry, "language": "fr"})
            self.assertEqual(localized["fetch"]["status"], "language_mismatch")
            self.assertTrue(localized["fetch"]["redirected"])

    def test_304_reextracts_after_extractor_change(self):
        from urllib.error import HTTPError
        entry = {"id": "s", "url": "https://example.test", "language": "en", "fetch": {"status": "available"}}
        with tempfile.TemporaryDirectory() as directory, patch("tools.ingest.CACHE", Path(directory)):
            raw = Path(directory) / "raw/s.html"
            raw.parent.mkdir()
            raw.write_text("<html lang='en'><p>Cached rule.</p></html>")
            with patch("tools.ingest.open_source", side_effect=HTTPError(entry["url"], 304, "", {}, None)):
                result, _ = fetch_one(entry)
            self.assertEqual(result["fetch"]["status"], "available")
            self.assertEqual(load(Path(directory) / "extracts/s.json")["blocks"][0]["text"], "Cached rule.")


class Registry(unittest.TestCase):
    def test_all_21_seeds_and_48_legacy_probes(self):
        config = load(ROOT / "data/sources.json")
        entries = initial_registry(config)
        self.assertEqual(len(config["seeds"]), 21)
        self.assertEqual(len(entries), 69)
        self.assertEqual(len({e["id"] for e in entries}), 69)
        for language in ("en", "fr", "de", "es", "ja"):
            self.assertEqual(sum(e["language"] == language for e in entries), 21 if language == "en" else 12)
        self.assertEqual(sum(e["family"] == "blog-overview" for e in entries), 9)
        self.assertEqual(next(e for e in entries if e["id"] == "legacy-v18-deprecated-ja")["edition"], "18.2")
        self.assertIn(".ja.html", next(e for e in entries if e["id"] == "legacy-v18-deprecated-ja")["url"])


class Publication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = build()

    def test_catalog_valid_and_locally_published(self):
        validate(self.document)
        self.assertEqual(self.document["coverage"]["english_seeds"], 21)
        self.assertEqual(self.document["coverage"]["reviewed_changes"], 0)
        self.assertEqual(self.document["semantic_search"]["status"], "unavailable")
        self.assertEqual(len(self.document["changes"]), 3)

    def test_offline_reproducible_build(self):
        path = ROOT / "site/data/catalog.json"
        before = path.read_bytes()
        build()
        self.assertEqual(before, path.read_bytes())

    def test_repeated_editions_deduplicate_by_stable_id(self):
        original = deepcopy(self.document["changes"][0])
        other = deepcopy(original)
        other["evidence"][0]["source_id"] = "another-edition"
        result = merge_candidates([original, other])
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[0]["evidence"]), len(original["evidence"]) + 1)
        other["threshold"]["exact"] = "20"
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            merge_candidates([original, other])

    def test_override_persists_and_does_not_mutate_input(self):
        original = deepcopy(self.document["changes"][0])
        override = {"schema_version": 1, "changes": {original["id"]: {"reason": "Human correction",
                                                "patch": {"criticality": "high"}}}}
        result = apply_overrides([original], override)
        self.assertEqual(result[0]["criticality"], "high")
        self.assertEqual(original["criticality"], "blocking")
        self.assertEqual(apply_overrides([original], override), result)
        override["changes"][original["id"]]["patch"]["id"] = "renamed"
        with self.assertRaises(ValueError):
            apply_overrides([original], override)

    def test_invalid_localization_evidence_bucket_and_review_rejected(self):
        for mutate in (
            lambda d: d["changes"][0]["localizations"].pop("ja"),
            lambda d: d["changes"][0]["localizations"]["ja"].update(paragraph=d["changes"][0]["localizations"]["en"]["paragraph"]),
            lambda d: d["changes"][0]["threshold"].update(bucket="v19"),
            lambda d: d["changes"][0].update(review_status="reviewed"),
            lambda d: d["changes"][0]["evidence"][0].update(source_id="invented"),
            lambda d: d["latest"].update(status="unverified"),
            lambda d: d["semantic_search"].update(status="available"),
        ):
            doc = deepcopy(self.document)
            mutate(doc)
            with self.assertRaises(ValueError):
                validate(doc)

    def test_unknown_threshold_platform_stage_and_action_are_explicit(self):
        doc = deepcopy(self.document)
        change = doc["changes"][0]
        change.update(threshold={"exact": None, "bucket": None, "kind": "unknown"},
                      platforms=["unknown"], stage="unknown", criticality="unknown",
                      action=None, action_basis="No documented action has yet been extracted.")
        validate(doc)
        change["threshold"]["bucket"] = "v20"
        with self.assertRaisesRegex(ValueError, "Unknown threshold"):
            validate(doc)

    def test_live_evidence_when_cache_present(self):
        if not (ROOT / ".cache/extracts/legacy-v20-deprecated-en.json").exists():
            self.skipTest("Raw source cache is intentionally not committed")
        verify_evidence(self.document)

    def test_evidence_change_requires_editorial_review(self):
        if not (ROOT / ".cache/extracts/legacy-v20-deprecated-en.json").exists():
            self.skipTest("Raw source cache is intentionally not committed")
        for field, value in (("excerpt", "Invented quote"), ("heading", "Wrong context"),
                             ("source_sha256", "0" * 64), ("url", "https://example.test/fake")):
            doc = deepcopy(self.document)
            doc["changes"][0]["evidence"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                verify_evidence(doc)

    def test_published_assets_under_pages_subpath(self):
        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=ROOT / "site", **kwargs)

            def do_GET(self):
                if not self.path.startswith("/migration/"):
                    self.send_error(404)
                    return
                self.path = self.path.removeprefix("/migration")
                super().do_GET()

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}/migration/"
        try:
            with urlopen(base, timeout=5) as response:
                html = response.read().decode()
            nodes = list(DOM(html).root.walk())
            assets = [n.attrs.get("src") for n in nodes if n.tag == "script" and n.attrs.get("src")]
            assets += [n.attrs.get("href") for n in nodes if n.tag == "link" and n.attrs.get("rel") == "stylesheet"]
            self.assertTrue(assets, "Expected local script/style assets")
            for asset in assets:
                self.assertFalse(asset.startswith(("/", "http:", "https:")), "Assets must use Pages-safe relative URLs")
                with urlopen(urljoin(base, asset), timeout=5) as response:
                    self.assertEqual(response.status, 200)
            with urlopen(urljoin(base, "data/catalog.json"), timeout=5) as response:
                published = json.loads(response.read())
            self.assertEqual(published, self.document)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()

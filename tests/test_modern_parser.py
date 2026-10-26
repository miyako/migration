"""Optional HTML end tags must not merge modern release-note evidence."""
import unittest

from tools.ingest import DOM, ROOT, extract


class ModernOptionalTags(unittest.TestCase):
    url = "https://developer.4d.com/docs/Notes/updates"

    def setUp(self):
        self.html = (ROOT / "tests/fixtures/modern-optional-tags.html").read_text()
        self.result = extract(self.html, self.url)

    def test_optional_table_rows_and_cells_remain_isolated(self):
        rows = [b for b in self.result["blocks"] if b["kind"] == "table_row"]
        header = ["Library", "Current version", "Updated in 4D", "Comment"]
        self.assertEqual([b["cells"] for b in rows], [
            header,
            ["CEF", "7258", "21", "Chromium 139"],
            ["ICU", "77.1", "21", "Reindex text"],
            ["OpenSSL", "4.0.1", "21 R5", "Beta"],
        ])
        for row in rows:
            self.assertEqual(len(row["cells"]), 4)
            self.assertEqual(row["table_header"], header)
            self.assertEqual(row["anchor"], "libraries")
        icu = rows[2]
        self.assertEqual(icu["text"], "ICU 77.1 21 Reindex text")
        self.assertNotIn("Beta", icu["text"])
        self.assertNotIn("21 R5", icu["text"])
        self.assertEqual(sum("Beta" in b["text"] for b in self.result["blocks"]), 1)

    def test_optional_paragraphs_and_nested_lists_are_atomic(self):
        blocks = self.result["blocks"]
        self.assertEqual([b["text"] for b in blocks if b["kind"] == "paragraph"], [
            "First independent rule.", "Second independent rule with emphasis .",
            "Paragraph in a list.", "Another paragraph in that list.",
            "After the list.", "Final rule.",
        ])
        self.assertEqual([b["text"] for b in blocks if b["kind"] == "list_item"], [
            "Outer context", "Nested first rule.", "Nested second rule.", "Sibling rule.",
        ])
        self.assertEqual(len({b["id"] for b in blocks}), len(blocks))
        self.assertEqual(blocks[-1]["headings"], ["Release Notes", "Migration rules", "Next section"])
        self.assertEqual(blocks[-1]["anchor"], "next")

    def test_mixed_explicit_cells_and_table_sections(self):
        html = """<div class="theme-doc-markdown"><table>
        <thead><tr><th>Name</th><th>Value
        <tbody><tr><th>First<td>1</td>
        <tr><td>Second</td><td>2
        <tbody><tr><td>Third<td>3
        <tfoot><tr><td>Total<td>6</table></div>"""
        rows = [b for b in extract(html, self.url)["blocks"] if b["kind"] == "table_row"]
        self.assertEqual([b["cells"] for b in rows], [
            ["Name", "Value"], ["First", "1"], ["Second", "2"], ["Third", "3"], ["Total", "6"],
        ])

    def test_legacy_malformed_nesting_and_ids_are_unchanged(self):
        html = """<html lang="en"><title>Guide</title><h1>Guide</h1><div id="Paragraph_text_42"><p>Existing rule.<p>Second rule.<ul><li>Outer context<ul><li>Nested rule.</li></ul></li><li>Sibling.</li></ul><table><thead><tr><th>API<th>Change<tbody><tr><td>min()<td>Undefined</table></div></html>"""
        blocks = extract(html, "https://example.test/legacy.en.html")["blocks"]
        self.assertEqual([(b["id"], b["text"], b["cells"]) for b in blocks], [
            ("873c53f482a034e8", "Outer context", []),
            ("af49c90f13a784ad", "Nested rule.", []),
            ("2ceaa087ddf44991", "Sibling.", []),
            ("9eb98f5ea39f0dbe", "API Change min() Undefined", ["API Change min() Undefined"]),
            ("2c5f0f8307930478", "min() Undefined", ["min() Undefined"]),
        ])
        self.assertTrue(all(b["anchor"] == "42" for b in blocks))

    def test_repairs_are_opt_in_and_confined_to_modern_scope(self):
        table = "<table><tr><th>First<th>Second</table>"
        html = table + '<div class="theme-doc-markdown">' + table + "</div>" + table
        for modern, expected in ((False, [1, 1, 1]), (True, [1, 2, 1])):
            rows = [n for n in DOM(html, modern=modern).root.walk() if n.tag == "tr"]
            self.assertEqual([sum(c.tag == "th" for c in row.children if hasattr(c, "tag"))
                              for row in rows], expected)


class BlogListExtraction(unittest.TestCase):
    def test_branch_fix_lists_are_atomic_and_existing_paragraphs_unchanged(self):
        start = """<html lang="en"><title>Security bulletin</title>
        <nav><ul><li>Navigation noise</li></ul></nav><article>
        <div class="entry-content"><h2>Fixed versions</h2>
        <p id="intro">Existing introduction.</p>"""
        end = """<p>Existing conclusion.</p></div>
        <ul><li>Outside article noise</li></ul></article></html>"""
        lists = """<ul>
        <li>4D 19.7 <strong>build 288986</strong></li>
        <li>4D 20.2 build 100956</li>
        <li>4D 20 R2 HF1 build 100440</li>
        <li>4D 20 R3</li>
        <li>Nested context<ol><li>Nested branch rule.</li></ol></li>
        <li><p>Paragraph list rule.</p></li>
        </ul><pre><code><li>Code is not a list rule.</li></code></pre>"""
        url = "https://blog.4d.com/fixture/"
        original = extract(start + end, url)["blocks"]
        expanded = extract(start + lists + end, url)["blocks"]
        self.assertEqual([b for b in expanded if b in original], original)
        self.assertEqual([b["text"] for b in expanded if b["kind"] == "list_item"], [
            "4D 19.7 build 288986", "4D 20.2 build 100956",
            "4D 20 R2 HF1 build 100440", "4D 20 R3",
            "Nested context", "Nested branch rule.",
        ])
        self.assertEqual(sum(b["text"] == "Paragraph list rule." for b in expanded), 1)
        self.assertTrue(all(b["headings"] == ["Fixed versions"] for b in expanded))
        self.assertFalse(any("noise" in b["text"] for b in expanded))

    def test_generic_articles_still_do_not_emit_list_items(self):
        html = "<article><p>Existing paragraph.</p><ul><li>Not entry-content.</li></ul></article>"
        self.assertEqual([b["text"] for b in extract(html, "https://example.test")["blocks"]],
                         ["Existing paragraph."])


if __name__ == "__main__":
    unittest.main()

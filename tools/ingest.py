"""Bounded source ingestion. Raw copyrighted pages and structural extracts stay local."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import difflib
from email import message_from_bytes
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"
LANGUAGES = ("en", "fr", "de", "es", "ja")
EXTRACTOR_VERSION = 8


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Node:
    def __init__(self, tag="", attrs=None, parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs or []), parent
        self.children = []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self):
        if self.tag in {"script", "style", "nav", "footer", "noscript"}:
            return ""
        return re.sub(r"\s+", " ", " ".join(
            child.text() if isinstance(child, Node) else child for child in self.children
        )).strip()

    def code(self):
        return "".join(child.code() if isinstance(child, Node) else child for child in self.children)


class DOM(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "wbr"}
    P_BOUNDARIES = {"address", "article", "aside", "blockquote", "details", "div", "dl",
                    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
                    "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main",
                    "menu", "nav", "ol", "p", "pre", "section", "table", "td", "th",
                    "tr", "thead", "tbody", "tfoot", "ul"}

    def __init__(self, html, modern=False):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.current = self.root
        self.modern = modern
        self.feed(html)
        self.close()

    def close_optional(self, tags, barriers, scope):
        node = self.current
        while node is not scope:
            if node.tag in barriers:
                return
            if node.tag in tags:
                self.current = node.parent
                return
            node = node.parent

    def handle_starttag(self, tag, attrs):
        # Repair omitted end tags only inside Docusaurus content; legacy trees
        # deliberately retain their historical malformed nesting and block IDs.
        scope = self.current
        if self.modern:
            while scope.parent and "theme-doc-markdown" not in scope.attrs.get("class", "").split():
                scope = scope.parent
            if scope.parent:
                if tag in self.P_BOUNDARIES:
                    self.close_optional({"p"}, {"table"}, scope)
                if tag in {"thead", "tbody", "tfoot"}:
                    self.close_optional({"tr"}, {"table"}, scope)
                    self.close_optional({"thead", "tbody", "tfoot"}, {"table"}, scope)
                elif tag == "tr":
                    self.close_optional({"tr"}, {"table"}, scope)
                elif tag in {"td", "th"}:
                    self.close_optional({"td", "th"}, {"tr", "table"}, scope)
                elif tag == "li":
                    self.close_optional({"li"}, {"ul", "ol"}, scope)
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in self.VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        node = self.current
        while node.parent:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def extract(html, url):
    dom = DOM(html, modern=True).root
    nodes = list(dom.walk())
    title = next((n.text() for n in nodes if n.tag == "title"), "")
    language = next((n.attrs.get("lang", "").split("-")[0].lower()
                     for n in nodes if n.tag == "html"), "")
    # Legacy DOM contains malformed p/table nesting. Walk in document order rather
    # than relying on well-formed paragraph descendants.
    modern_scope = next((n for n in nodes if "theme-doc-markdown" in n.attrs.get("class", "").split()), None)
    blog_scope = next((n for n in nodes if "entry-content" in n.attrs.get("class", "").split()), None)
    scope = modern_scope or blog_scope
    if scope is None:
        scope = next((n for n in nodes if n.tag == "article"), dom)
    navigation_scope = next((n for n in nodes if n.attrs.get("id") == "Title_list"), None)
    navigation_heading = next((n.text() for n in nodes if n.attrs.get("id") == "newListTitle"), "")
    navigation_index = navigation_scope is not None and bool(navigation_heading)
    if navigation_index:
        scope = navigation_scope
    legacy = any(n.attrs.get("id", "").startswith("Paragraph_text_") for n in nodes)
    atomic_lists = modern_scope is not None or legacy or scope is blog_scope
    headings = [(1, navigation_heading)] if navigation_index else []
    blocks, links, alternates, tabs = [], [], [], []
    for n in nodes:
        href = n.attrs.get("href")
        if href and n.tag in {"a", "link"}:
            resolved = urljoin(url, href)
            if urlsplit(resolved).scheme in {"http", "https"}:
                if n.tag == "a":
                    links.append({"text": n.text(), "url": resolved})
                lang = n.attrs.get("hreflang", "").split("-")[0]
                if lang in LANGUAGES and "alternate" in n.attrs.get("rel", "").split():
                    alternates.append({"language": lang, "url": resolved})
    active = set(scope.walk())
    if navigation_index:
        for n in nodes:
            if n not in active:
                continue
            if n.tag == "li" and n.parent and n.parent.parent and "home_tabs" in n.parent.parent.attrs.get("class", "").split():
                target = next((a for a in n.walk() if a.tag == "a" and a.attrs.get("href")), None)
                if target:
                    tabs.append({"label": target.text(), "url": urljoin(url, target.attrs["href"]),
                                 "selected": "selected" in n.attrs.get("class", "").split()})
    heading_anchor = ""
    for n in nodes:
        if n not in active:
            continue
        ancestor = n
        while ancestor is not scope and ancestor is not None:
            if ancestor.tag in {"nav", "footer", "aside", "script", "style"}:
                break
            ancestor = ancestor.parent
        if ancestor is not scope:
            continue
        if re.fullmatch(r"h[1-6]", n.tag):
            level = int(n.tag[1])
            headings = [(depth, text) for depth, text in headings if depth < level]
            headings.append((level, n.text().replace("\u200b", "").strip() if modern_scope else n.text()))
            heading_anchor = n.attrs.get("id", "")
        if n.tag not in ({"p", "tr", "pre", "li"} if atomic_lists else {"p", "tr", "pre"}):
            continue
        if modern_scope or (atomic_lists and n.tag == "li"):
            ancestors = []
            parent = n.parent
            while parent and parent is not scope:
                ancestors.append(parent.tag)
                parent = parent.parent
            if (modern_scope and n.tag != "tr" and "table" in ancestors) or "pre" in ancestors:
                continue
            if n.tag == "li" and any(c.tag in {"p", "table", "pre"} for c in n.walk() if c is not n):
                continue
        if legacy:
            ancestor = n.parent
            while ancestor and not ancestor.attrs.get("id", "").startswith("Paragraph_text_"):
                ancestor = ancestor.parent
            if ancestor is None:
                continue
        else:
            ancestor = n
        if navigation_index:
            ancestor = n.parent
            while ancestor and not ancestor.attrs.get("id", "").startswith("TitreTitle"):
                ancestor = ancestor.parent
            if ancestor is None:
                continue
        # A p wrapping a table in legacy HTML is not a standalone paragraph.
        if n.tag == "p" and any(c.tag in {"table", "tr", "pre"} for c in n.walk() if c is not n):
            continue
        text = n.code().strip() if n.tag == "pre" else n.text()
        if atomic_lists and n.tag == "li":
            text = re.sub(r"\s+", " ", " ".join(
                c.text() if isinstance(c, Node) else c for c in n.children
                if not isinstance(c, Node) or c.tag not in {"ul", "ol"}
            )).strip()
        if not text:
            continue
        cells = [c.text() for c in n.children if isinstance(c, Node) and c.tag in {"td", "th"}]
        table = n.parent
        while table and table.tag != "table":
            table = table.parent
        header = []
        if n.tag == "tr" and table:
            first = next((r for r in table.walk() if r.tag == "tr"), None)
            if first:
                header = [c.text() for c in first.children if isinstance(c, Node) and c.tag in {"td", "th"}]
        anchor = (ancestor.attrs.get("id", "") if navigation_index else
                  ancestor.attrs.get("id", "").removeprefix("Paragraph_text_") if legacy else
                  n.attrs.get("id", "") or (heading_anchor if modern_scope else ""))
        block_id = hashlib.sha256(("\n".join(t for _, t in headings) + "\n" + n.tag + "\n" + text).encode()).hexdigest()[:16]
        block = {
            "id": block_id, "kind": {"p": "paragraph", "tr": "table_row", "pre": "code", "li": "list_item"}[n.tag],
            "headings": [t for _, t in headings], "text": text, "cells": cells,
            "table_header": header, "anchor": anchor,
            "url": url.split("#")[0] + ("#" + anchor if anchor else ""),
        }
        if navigation_index:
            target = next((a for a in n.walk() if a.tag == "a" and a.attrs.get("href")), None)
            block.update(kind="navigation_entry", label=target.text() if target else text,
                         target_url=urljoin(url, target.attrs["href"]) if target else None,
                         markers=[span.text() for span in n.walk() if "tdc_toc_upd" in span.attrs.get("class", "").split()])
        if block not in blocks:
            blocks.append(block)
    metadata = {n.attrs.get("name"): n.attrs.get("content") for n in nodes if n.tag == "meta"}
    documentation = None
    if metadata.get("docusaurus_version"):
        documentation = {
            "version": metadata["docusaurus_version"],
            "locale": metadata.get("docusaurus_locale"),
            "canonical_url": next((urljoin(url, n.attrs["href"]) for n in nodes
                                   if n.tag == "link" and n.attrs.get("rel") == "canonical"), None),
            "channel_label": next((n.text() for n in nodes if
                                   "theme-doc-version-badge" in n.attrs.get("class", "").split()), None),
            "article_scope": modern_scope is not None,
            "release_headings": [n.text().replace("\u200b", "").strip() for n in (modern_scope.walk() if modern_scope else [])
                                 if n.tag == "h2"],
            "locale_links": [{"language": n.attrs["hreflang"], "url": urljoin(url, n.attrs["href"])}
                             for n in nodes if n.tag == "link" and n.attrs.get("rel") == "alternate"
                             and n.attrs.get("hreflang") not in {None, "x-default"}],
            "version_links": [{"label": n.text(), "url": urljoin(url, n.attrs["href"])}
                              for n in nodes if n.tag == "a" and "dropdown__link" in n.attrs.get("class", "").split()
                              and not n.attrs.get("lang") and "/Notes/updates" in n.attrs.get("href", "")],
        }
    return {"extractor_version": EXTRACTOR_VERSION, "title": title, "language": language,
            "documentation": documentation,
            "content_kind": "navigation_index" if navigation_index else "article",
            "navigation": {"heading": navigation_heading, "tabs": tabs} if navigation_index else None,
            "blocks": blocks, "links": links, "alternates": alternates}


def availability(extracted, expected_language):
    title = extracted["title"].casefold()
    if any(term in title for term in ("404", "not found", "page introuvable", "seite nicht gefunden",
                                      "página no encontrada", "ページが見つかりません")):
        return "soft_404"
    if not extracted["blocks"] and extracted.get("content_kind") != "navigation_index":
        return "unrecognized_content"
    if not extracted["language"]:
        return "language_unverified"
    if extracted["language"] != expected_language:
        return "language_mismatch"
    return "available"


def extraction_metadata(extracted, entry):
    metadata = {"block_count": len(extracted["blocks"]), "detected_language": extracted["language"],
                "content_kind": extracted["content_kind"]}
    if extracted["content_kind"] == "navigation_index":
        metadata["navigation_entry_count"] = len(extracted["blocks"])
        metadata["selected_tab"] = next((tab["label"] for tab in extracted["navigation"]["tabs"] if tab["selected"]), None)
    if extracted.get("documentation"):
        metadata["documentation"] = extracted["documentation"]
    if entry.get("manual_document_key"):
        pattern = "." + entry["manual_document_key"] + "." + entry["language"] + ".html"
        metadata["manual_document_urls"] = sorted({link["url"] for link in extracted["links"]
                                                  if link["url"].endswith(pattern)
                                                  and urlsplit(link["url"]).path.rsplit("/", 1)[0] ==
                                                  urlsplit(entry.get("resolved_url", entry["url"])).path.rsplit("/", 1)[0]})
    return metadata


def initial_registry(config, locations=None):
    if config.get("schema_version") != 1:
        raise ValueError("Unsupported source configuration schema version")
    result = []
    locations = locations or {}
    identifiers = set()
    for seed in config["seeds"]:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", seed["id"]):
            raise ValueError(f"Invalid stable source ID: {seed['id']}")
        if seed["id"] in identifiers:
            raise ValueError(f"Duplicate source ID: {seed['id']}")
        identifiers.add(seed["id"])
        if urlsplit(seed["url"]).scheme != "https" or not urlsplit(seed["url"]).netloc:
            raise ValueError(f"Source must use HTTPS: {seed['id']}")
        modern = seed["family"] == "documentation-release-notes"
        if modern:
            route = documentation_route(seed["url"])
            if route["language"] != "en" or route["channel"] != seed.get("documentation_channel"):
                raise ValueError(f"Modern seed requires an English route with an explicit matching channel: {seed['id']}")
        if seed["family"] != "blog-overview" and not modern and ".en.html" not in seed["url"]:
            raise ValueError(f"Legacy discovery requires an .en.html seed: {seed['id']}")
        for language in LANGUAGES if seed["family"] != "blog-overview" else ("en",):
            identifier = seed["id"] + "-" + language
            location = None if modern and language == "en" else locations.get(identifier)
            if language != "en" and location is None:
                continue
            entry = dict(seed)
            entry["id"] = identifier
            entry["language"] = language
            entry["url"] = location["url"] if location else seed["url"]
            entry.update({
                "publisher": "4D", "authority": "official_documentation" if modern else
                "official_documentation_mirror" if seed["family"] != "blog-overview" else "official_publisher",
                "host_operator": "4D" if modern or seed["family"] == "blog-overview" else "4D Japan archive",
                "discovery": location["discovery"] if location else {"parent": None, "method": "provided_seed"},
                "fetch": {"status": "not_fetched"},
            })
            result.append(entry)
    return result


def merge_registry(configured, existing):
    by_id = {entry["id"]: entry for entry in existing}
    entries = []
    for entry in configured:
        previous = by_id.get(entry["id"], {})
        if previous.get("url") == entry["url"]:
            entry = {**previous, **{k: v for k, v in entry.items() if k != "fetch"}}
            if entry.get("family") == "documentation-release-notes" and previous.get("fetch", {}).get("documentation"):
                entry["edition"] = previous["edition"]
        elif previous:
            entry = {**entry, "url_history": previous.get("url_history", []) + [{
                "url": previous["url"], "resolved_url": previous.get("resolved_url"),
                "fetch": previous["fetch"], "discovery": previous["discovery"],
                "disposition": "superseded_url_probe" if previous["discovery"]["method"] == "derived_language_probe"
                else "superseded_location",
            }]}
        entries.append(entry)
    return entries + [entry for entry in existing if entry["id"] not in {x["id"] for x in entries}]


class CurlResponse(io.BytesIO):
    def __init__(self, body, metadata, headers):
        super().__init__(body)
        self.status = metadata["http_code"]
        self.url = metadata["url_effective"]
        self.headers = headers


def documentation_route(url):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.netloc != "developer.4d.com" or parsed.query or parsed.fragment:
        raise ValueError(f"Not an official release-note route: {url}")
    match = re.fullmatch(r"/docs/(?:(fr|de|es|ja|pt)/)?(?:(\d+(?:-R\d+)?)/)?Notes/updates/?", parsed.path)
    if not match:
        raise ValueError(f"Not a release-note route: {url}")
    return {"language": match[1] or "en", "version": match[2],
            "channel": "versioned" if match[2] else "moving-current"}


def source_availability(extracted, entry):
    status = availability(extracted, entry["language"])
    if status != "available" or entry.get("family") != "documentation-release-notes":
        return status
    documentation = extracted.get("documentation")
    if not documentation or not documentation["article_scope"]:
        return "documentation_unverified"
    requested = documentation_route(entry["url"])
    resolved = documentation_route(entry.get("resolved_url", entry["url"]))
    if resolved["language"] != entry["language"] or documentation["locale"] != entry["language"]:
        return "language_mismatch"
    if (requested != resolved or (requested["version"] and documentation["version"] != requested["version"])
            or documentation["canonical_url"] != entry.get("resolved_url", entry["url"])):
        return "edition_mismatch"
    return status


def content_fingerprint(extracted):
    return hashlib.sha256("\n".join(block["text"] for block in extracted["blocks"]).encode()).hexdigest()


def verify_documentation_locale(extracted, entry):
    if entry.get("family") != "documentation-release-notes" or entry["language"] == "en":
        return
    english_id = entry["id"].rsplit("-", 1)[0] + "-en"
    path = CACHE / "extracts" / (english_id + ".json")
    if not path.exists():
        entry["fetch"].update(status="translation_unverified", error=f"Fetch {english_id} before verifying localized content.")
        return
    english = load(path)
    if (english.get("documentation") or {}).get("version") != extracted["documentation"]["version"]:
        entry["fetch"].update(status="translation_unverified", error=f"Refresh {english_id}: its cached documentation edition differs.")
        return
    entry["fetch"]["locale_comparison"] = {
        "english_source_id": english_id, "english_content_sha256": content_fingerprint(english),
        "localized_content_sha256": content_fingerprint(extracted),
        "scope": "Whole-article fallback detection only; not a human translation-completeness review.",
    }
    if content_fingerprint(extracted) == content_fingerprint(english):
        entry["fetch"].update(status="locale_fallback", error="Article content is identical to English; not verified as a translation.")


def open_source(request, transport):
    if transport == "urllib":
        return urlopen(request, timeout=35)
    # Some macOS Python installations lack intermediate certificates available
    # to the OS trust store. curl is an explicit alternative, never an insecure retry.
    with tempfile.TemporaryDirectory(prefix="migration-fetch-") as folder:
        folder = Path(folder)
        command = ["curl", "--silent", "--show-error", "--location", "--max-time", "35",
                   "--max-filesize", "12000000", "--max-redirs", "5",
                   "--proto", "=https", "--proto-redir", "=https",
                   "--dump-header", str(folder / "headers"), "--output", str(folder / "body"),
                   "--write-out", "%{json}"]
        for key, value in request.header_items():
            command += ["--header", f"{key}: {value}"]
        command += [request.full_url]
        result = subprocess.run(command, capture_output=True, timeout=40, check=False)
        if result.returncode:
            raise OSError(f"curl exited {result.returncode}: {result.stderr.decode().strip()}")
        metadata = json.loads(result.stdout)
        header_blocks = (folder / "headers").read_bytes().strip().split(b"\r\n\r\n")
        headers = message_from_bytes(header_blocks[-1].split(b"\r\n", 1)[1])
        if metadata["http_code"] >= 400 or metadata["http_code"] == 304:
            raise HTTPError(metadata["url_effective"], metadata["http_code"], "curl HTTP response", headers, None)
        return CurlResponse((folder / "body").read_bytes(), metadata, headers)


def fetch_one(entry, refresh=False, transport="urllib"):
    entry = json.loads(json.dumps(entry))
    old = entry.get("fetch", {})
    path = CACHE / "raw" / (entry["id"] + ".html")
    headers = {"User-Agent": "4D-migration-reference/0.1 (bounded public documentation ingestion)"}
    if not refresh and path.exists():
        if old.get("etag"):
            headers["If-None-Match"] = old["etag"]
        if old.get("last_modified"):
            headers["If-Modified-Since"] = old["last_modified"]
    checked = now()
    try:
        with open_source(Request(entry["url"], headers=headers), transport) as response:
            body = response.read(12_000_001)
            if len(body) > 12_000_000:
                raise ValueError("Source exceeds 12 MB bounded fetch limit")
            resolved = response.url
            # A redirect is preserved, never silently interpreted as the requested locale.
            entry["resolved_url"] = resolved
            content_type = response.headers.get("Content-Type", "")
            if "html" not in content_type:
                raise ValueError(f"Expected HTML, received {content_type}")
            encoding = response.headers.get_content_charset() or "utf-8"
            html = body.decode(encoding, errors="strict")
            digest = hashlib.sha256(body).hexdigest()
            extracted_path = CACHE / "extracts" / (entry["id"] + ".json")
            if (digest == old.get("sha256") and extracted_path.exists()
                    and load(extracted_path).get("extractor_version") == EXTRACTOR_VERSION):
                extracted = load(extracted_path)
            else:
                extracted = extract(html, resolved)
                if path.exists():
                    previous = path.read_text(encoding="utf-8")
                    diff = "".join(difflib.unified_diff(previous.splitlines(True), html.splitlines(True),
                                                       fromfile=entry["id"] + ":previous", tofile=entry["id"] + ":current"))
                    diff_path = CACHE / "diffs" / (entry["id"] + ".diff")
                    diff_path.parent.mkdir(parents=True, exist_ok=True)
                    diff_path.write_text(diff, encoding="utf-8")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(html, encoding="utf-8")
                save(extracted_path, extracted)
            status = source_availability(extracted, entry)
            if status == "available" and entry.get("family") == "documentation-release-notes":
                entry["edition"] = extracted["documentation"]["version"].replace("-R", " R")
            entry["title"] = extracted["title"]
            entry["fetch"] = {
                "status": status, "checked_at": checked, "fetched_at": checked,
                "sha256": digest, "etag": response.headers.get("ETag"),
                "last_modified": response.headers.get("Last-Modified"),
                "http_status": response.status, "redirected": resolved != entry["url"],
                "detected_language": extracted["language"],
                "previous_sha256": old.get("sha256") if digest != old.get("sha256") else old.get("previous_sha256"),
                "block_count": len(extracted["blocks"]),
                **extraction_metadata(extracted, entry),
            }
            if status == "available" and entry.get("manual_document_key") and not entry["fetch"]["manual_document_urls"]:
                entry["fetch"]["status"] = "manual_unverified"
                entry["fetch"]["error"] = f"Expected same-edition manual parent {entry['manual_document_key']} is not linked"
            if entry["fetch"]["status"] == "available":
                verify_documentation_locale(extracted, entry)
            return entry, extracted["alternates"]
    except HTTPError as error:
        if error.code == 304:
            entry["fetch"] = {**old, "checked_at": checked, "http_status": 304}
            extracted_path = CACHE / "extracts" / (entry["id"] + ".json")
            extracted = load(extracted_path) if extracted_path.exists() else {}
            if extracted.get("extractor_version") != EXTRACTOR_VERSION:
                extracted = extract(path.read_text(encoding="utf-8"), entry.get("resolved_url", entry["url"]))
                save(extracted_path, extracted)
                entry["fetch"]["block_count"] = len(extracted["blocks"])
            entry["fetch"]["status"] = source_availability(extracted, entry)
            if entry["fetch"]["status"] == "available" and entry.get("family") == "documentation-release-notes":
                entry["edition"] = extracted["documentation"]["version"].replace("-R", " R")
            entry["fetch"].update(extraction_metadata(extracted, entry))
            if entry["fetch"]["status"] == "available" and entry.get("manual_document_key") and not entry["fetch"]["manual_document_urls"]:
                entry["fetch"]["status"] = "manual_unverified"
                entry["fetch"]["error"] = f"Expected same-edition manual parent {entry['manual_document_key']} is not linked"
            else:
                entry["fetch"].pop("error", None)
            if entry["fetch"]["status"] == "available":
                verify_documentation_locale(extracted, entry)
            return entry, extracted["alternates"]
        entry["resolved_url"] = error.url
        entry["fetch"] = {**old, "status": "unavailable" if error.code in {404, 410} else "http_error",
                          "checked_at": checked, "http_status": error.code,
                          "redirected": error.url != entry["url"], "error": str(error)}
    except (URLError, TimeoutError, OSError, UnicodeError, ValueError, subprocess.TimeoutExpired) as error:
        entry["fetch"] = {**old, "status": "fetch_error", "checked_at": checked, "error": str(error)}
    print(f"{entry['id']}: {entry['fetch']['status']}: {entry['fetch'].get('error', '')}", file=sys.stderr)
    return entry, []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", action="append", help="Fetch only these stable source IDs (repeatable)")
    parser.add_argument("--refresh", action="store_true", help="Unconditional refetch; otherwise use HTTP validators")
    parser.add_argument("--transport", choices=("urllib", "curl"), default="urllib",
                        help="Explicit TLS-verifying transport (curl requires curl 7.70+)")
    parser.add_argument("--accept-discoveries", action="store_true", help="Explicitly register pending, same-host blog language links")
    args = parser.parse_args()
    registry_path = ROOT / "data/registry.json"
    existing = load(registry_path) if registry_path.exists() else []
    locations_path = ROOT / "data/source-locations.json"
    locations = load(locations_path)["locations"] if locations_path.exists() else {}
    entries = merge_registry(initial_registry(load(ROOT / "data/sources.json"), locations), existing)
    queue_path = ROOT / "data/discoveries.json"
    discoveries = load(queue_path) if queue_path.exists() else []
    if args.accept_discoveries:
        for item in discoveries:
            if item["status"] == "pending":
                parent = next(e for e in entries if e["id"] == item["parent"])
                entry = {**parent, "id": parent["id"].removesuffix("-en") + "-" + item["language"],
                         "url": item["url"], "language": item["language"], "fetch": {"status": "not_fetched"},
                         "discovery": {"parent": parent["id"], "method": "reviewed_hreflang"}}
                for stale in ("title", "resolved_url"):
                    entry.pop(stale, None)
                if entry["id"] not in {e["id"] for e in entries}:
                    entries.append(entry)
                item["status"] = "accepted"
    selected = [e for e in entries if not args.id or e["id"] in args.id]
    if args.id and set(args.id) - {e["id"] for e in entries}:
        parser.error("Unknown source ID; add it to data/sources.json or review discoveries first")
    updates = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for entry, alternates in pool.map(lambda e: fetch_one(e, args.refresh, args.transport), selected):
            updates[entry["id"]] = entry
            print(f"{entry['id']}: {entry['fetch']['status']}")
            if entry["family"] != "blog-overview":
                continue
            for alternate in alternates:
                if alternate["language"] == entry["language"]:
                    continue
                if urlsplit(alternate["url"]).netloc != urlsplit(entry["url"]).netloc:
                    continue
                item = {"parent": entry["id"], **alternate, "method": "hreflang", "status": "pending"}
                if not any(d["url"] == item["url"] and d["parent"] == item["parent"] for d in discoveries):
                    discoveries.append(item)
    save(registry_path, [updates.get(e["id"], e) for e in entries])
    save(queue_path, discoveries)


if __name__ == "__main__":
    main()

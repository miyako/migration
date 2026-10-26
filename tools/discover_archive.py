"""Resolve translated legacy slugs by following bounded archive directory links."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import PurePosixPath
import re
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request

from .ingest import CACHE, DOM, LANGUAGES, ROOT, load, now, open_source, save


def document_identity(url):
    match = re.search(r"\.(\d+-\d+)\.([a-z]{2})\.html$", urlsplit(url).path)
    return (match[1], match[2]) if match else None


def directory_links(html, base):
    links = set()
    for node in DOM(html).root.walk():
        if node.tag != "a" or not node.attrs.get("href"):
            continue
        resolved = urljoin(base, node.attrs["href"])
        parsed = urlsplit(resolved)
        if parsed.scheme == "https" and parsed.netloc == urlsplit(base).netloc and not parsed.query and not parsed.fragment:
            links.add(resolved)
    return sorted(links)


def matching_documents(links, directory, document_key, language):
    return sorted({link for link in links
                   if link.rsplit("/", 1)[0] + "/" == directory
                   and document_identity(link) == (document_key, language)})


class ArchiveNavigator:
    def __init__(self, root, transport, previous=None, limit=24):
        if not root.endswith("/") or urlsplit(root).scheme != "https":
            raise ValueError("Archive root must be an HTTPS directory URL")
        self.root, self.transport, self.limit = root, transport, limit
        self.previous = {p["url"]: p for p in previous or []}
        self.pages, self.links = {}, {}

    def read(self, url, parent=None):
        if url in self.links:
            return self.links[url]
        if not url.startswith(self.root) or len(self.pages) >= self.limit:
            raise ValueError(f"Archive discovery exceeded its root/page bound: {url}")
        key = hashlib.sha256(url.encode()).hexdigest()
        path = CACHE / "navigation" / (key + ".html")
        old = self.previous.get(url, {})
        headers = {"User-Agent": "4D-migration-reference/0.1 (bounded archive link discovery)"}
        if path.exists():
            for header, field in (("If-None-Match", "etag"), ("If-Modified-Since", "last_modified")):
                if old.get(field):
                    headers[header] = old[field]
        checked_at = now()
        try:
            with open_source(Request(url, headers=headers), self.transport) as response:
                if response.url != url:
                    raise ValueError(f"Archive directory redirected unexpectedly: {url} -> {response.url}")
                if "html" not in response.headers.get("Content-Type", ""):
                    raise ValueError(f"Archive index is not HTML: {url}")
                body = response.read(12_000_001)
                if len(body) > 12_000_000:
                    raise ValueError(f"Archive index exceeds 12 MB: {url}")
                html = body.decode(response.headers.get_content_charset() or "utf-8")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(html, encoding="utf-8")
                metadata = {"url": url, "parent": parent, "checked_at": checked_at,
                            "fetched_at": checked_at, "http_status": response.status,
                            "sha256": hashlib.sha256(body).hexdigest(),
                            "etag": response.headers.get("ETag"),
                            "last_modified": response.headers.get("Last-Modified")}
        except HTTPError as error:
            if error.code != 304 or not path.exists():
                raise ValueError(f"Cannot trace archive directory {url}: HTTP {error.code}") from error
            html = path.read_text(encoding="utf-8")
            metadata = {**old, "checked_at": checked_at, "http_status": 304}
        self.pages[url] = metadata
        self.links[url] = directory_links(html, url)
        return self.links[url]

    def resolve(self, seed):
        if not seed["url"].startswith(self.root):
            raise ValueError(f"Seed is outside configured archive: {seed['id']}")
        identity = document_identity(seed["url"])
        if identity is None or identity[1] != "en":
            raise ValueError(f"Expected an exact English legacy document seed: {seed['id']}")
        parts = PurePosixPath(seed["url"][len(self.root):]).parts
        directory, parent, chain = self.root, None, [self.root]
        for part in parts[:-1]:
            links = self.read(directory, parent)
            child = urljoin(directory, part + "/")
            if child not in links:
                raise ValueError(f"Required directory is not linked from {directory}: {child}")
            parent, directory = directory, child
            chain.append(directory)
        links = self.read(directory, parent)
        locations, unresolved = {}, []
        for language in LANGUAGES:
            matches = matching_documents(links, directory, identity[0], language)
            identifier = seed["id"] + "-" + language
            if len(matches) > 1:
                raise ValueError(f"Ambiguous document/edition/language match for {identifier}: {matches}")
            if not matches:
                unresolved.append({"id": identifier, "directory": directory, "document_key": identity[0],
                                   "language": language, "status": "not_discovered",
                                   "reason": "No exact linked document ID/language in this edition; not proof of absent translation elsewhere."})
                continue
            locations[identifier] = {
                "url": matches[0],
                "discovery": {"method": "archive_directory_link", "parent": directory,
                              "chain": chain + matches, "document_key": identity[0],
                              "index_sha256": self.pages[directory]["sha256"]},
            }
        return locations, unresolved


def retain_article_discovery(discovered, previous):
    """A directory refresh must not erase a more specific verified article link."""
    return {
        identifier: previous[identifier]
        if previous.get(identifier, {}).get("url") == location["url"]
        and previous[identifier]["discovery"]["method"] == "legacy_article_link"
        else location
        for identifier, location in discovered.items()
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transport", choices=("urllib", "curl"), default="urllib")
    args = parser.parse_args()
    config = load(ROOT / "data/sources.json")
    navigation_path = ROOT / "data/archive-navigation.json"
    previous = load(navigation_path)["pages"] if navigation_path.exists() else []
    navigator = ArchiveNavigator(config["archive_root"], args.transport, previous)
    prior_locations = load(ROOT / "data/source-locations.json")
    locations = {key: value for key, value in prior_locations["locations"].items() if not key.startswith("legacy-")}
    unresolved = [item for item in prior_locations["unresolved"] if not item["id"].startswith("legacy-")]
    for seed in config["seeds"]:
        if seed["family"] not in {"blog-overview", "documentation-release-notes", "original-kb-technote"}:
            found, pending = navigator.resolve(seed)
            locations.update(retain_article_discovery(found, prior_locations["locations"]))
            unresolved.extend(pending)
    save(navigation_path, {"schema_version": 1, "root": navigator.root, "pages": list(navigator.pages.values())})
    save(ROOT / "data/source-locations.json", {"schema_version": 1, "locations": locations, "unresolved": unresolved})
    print(f"Traced {len(navigator.pages)} archive indexes; resolved {len(locations)} legacy source URLs. "
          f"{len(unresolved)} unresolved, never guessed.")


if __name__ == "__main__":
    main()

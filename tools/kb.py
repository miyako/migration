"""Bounded original KB landing/ZIP-PDF adapter; documents remain in ignored cache."""
from __future__ import annotations

from copy import deepcopy
import hashlib
import io
import re
import subprocess
import zipfile
from urllib.parse import urljoin, urlsplit
from urllib.request import Request

from . import ingest


def kb_url(value):
    parsed = urlsplit(value)
    return parsed.scheme == "https" and parsed.netloc == "kb.4d.com" and not parsed.fragment


def landing_metadata(html, url):
    nodes = list(ingest.DOM(html).root.walk())

    def text(class_name):
        values = [n.text() for n in nodes if class_name in n.attrs.get("class", "").split()]
        if len(values) != 1:
            raise ValueError(f"Expected one KB {class_name}")
        return values[0]

    title, context, published = (text(c) for c in ("detailtitle", "detailtitle2", "detailtitle3"))
    downloads = [urljoin(url, n.attrs["href"]) for n in nodes
                 if n.tag == "a" and n.text() == "Tech Note Document" and n.attrs.get("href")]
    if len(downloads) != 1 or not kb_url(downloads[0]):
        raise ValueError("Expected one original KB document download")
    version = re.search(r"VERSION:\s*(.*?)\s*\|", context)
    if not version or not published.startswith("Published On: "):
        raise ValueError("Missing KB publication/version metadata")
    return {"title": title, "displayed_version": version[1], "context": context,
            "published_on": published.removeprefix("Published On: "),
            "download_url": downloads[0]}


def pdf_blocks(body, title, url):
    result = subprocess.run(["pdftotext", "-layout", "-", "-"], input=body,
                            capture_output=True, check=True, timeout=60)
    pages = result.stdout.decode("utf-8").split("\f")
    if pages[-1] == "":
        pages.pop()
    blocks = []
    for page, raw in enumerate(pages, 1):
        text = re.sub(r"\s+", " ", raw).strip()
        if not text:
            continue
        heading = f"{title} (PDF p. {page})"
        blocks.append({"id": hashlib.sha256((heading + "\n" + text).encode()).hexdigest()[:16],
                       "kind": "pdf_page", "headings": [title, heading], "text": text,
                       "page": page, "url": url, "anchor": "", "cells": [], "table_header": []})
    if not blocks:
        raise ValueError("PDF has no extractable text")
    return blocks


def retrieve(url, transport, limit):
    if not kb_url(url):
        raise ValueError("KB fetch must stay on the original HTTPS host")
    with ingest.open_source(Request(url, headers={"User-Agent": "4D-migration-reference/0.1"}),
                            transport, max_bytes=limit) as response:
        body = response.read(limit + 1)
        if len(body) > limit or not kb_url(response.url):
            raise ValueError("KB response exceeds bounds or leaves the original host")
        return body, response.url, response.status


def fetch_one(entry, transport):
    entry = deepcopy(entry)
    checked = ingest.now()
    try:
        landing, resolved, status = retrieve(entry["url"], transport, 2_000_000)
        metadata = landing_metadata(landing.decode("utf-8"), resolved)
        archive, download, _ = retrieve(metadata["download_url"], transport, 64_000_000)
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            candidates = [info for info in zipped.infolist()
                          if info.filename.lower().endswith(".pdf") and
                          not info.filename.startswith("__MACOSX/")]
            if len(candidates) != 1 or candidates[0].file_size > 12_000_000:
                raise ValueError("Expected one bounded PDF in the original KB archive")
            pdf_path = candidates[0].filename
            pdf = zipped.read(candidates[0])
        blocks = pdf_blocks(pdf, metadata["title"], entry["url"])
        covers = [b["text"] for b in blocks if b["page"] == 1 and " By " in b["text"]]
        if len(covers) != 1:
            raise ValueError("Missing original PDF author byline")
        metadata.update(download_url=download, archive_sha256=hashlib.sha256(archive).hexdigest(),
                        pdf_path=pdf_path, pdf_sha256=hashlib.sha256(pdf).hexdigest(),
                        page_count=max(b["page"] for b in blocks), language="en",
                        byline=covers[0].split(" By ", 1)[1].rsplit(" Technical Note ", 1)[0],
                        copyright_observation="No explicit copyright notice found in extracted PDF text; no license inferred.",
                        rights="Original 4D document; no redistribution license established.")
        folder = ingest.CACHE / "kb"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / (entry["id"] + ".html")).write_bytes(landing)
        (folder / (entry["id"] + ".zip")).write_bytes(archive)
        (folder / (entry["id"] + ".pdf")).write_bytes(pdf)
        ingest.save(ingest.CACHE / "extracts" / (entry["id"] + ".json"),
                    {"title": metadata["title"], "language": "en", "blocks": blocks,
                     "links": [{"url": metadata["download_url"], "text": "Tech Note Document"}],
                     "alternates": [], "kb_document": metadata})
        entry.update(resolved_url=resolved, title=metadata["title"], kb_document=metadata,
                     fetch={"status": "available", "checked_at": checked, "fetched_at": checked,
                            "sha256": hashlib.sha256(landing).hexdigest(), "http_status": status,
                            "redirected": resolved != entry["url"], "detected_language": "en",
                            "block_count": len(blocks), "content_kind": "kb_pdf"})
    except (OSError, ValueError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        entry["fetch"] = {**entry.get("fetch", {}), "status": "fetch_error",
                          "checked_at": checked, "error": str(error)}
        print(f"{entry['id']}: fetch_error: {error}", file=ingest.sys.stderr)
    return entry, []


def verify_cached_document(source):
    folder = ingest.CACHE / "kb"
    bodies = {}
    for suffix, digest in (("html", source["fetch"]["sha256"]),
                           ("zip", source["kb_document"]["archive_sha256"]),
                           ("pdf", source["kb_document"]["pdf_sha256"])):
        path = folder / (source["id"] + "." + suffix)
        if not path.exists():
            raise ValueError(f"Fetch {source['id']} before original KB verification")
        bodies[suffix] = path.read_bytes()
        if hashlib.sha256(bodies[suffix]).hexdigest() != digest:
            raise ValueError(f"Original KB {suffix} hash changed: {source['id']}")
    metadata = landing_metadata(bodies["html"].decode("utf-8"), source["resolved_url"])
    if any(metadata[key] != source["kb_document"][key] for key in metadata):
        raise ValueError("Original KB landing metadata changed")
    with zipfile.ZipFile(io.BytesIO(bodies["zip"])) as archive:
        if archive.read(source["kb_document"]["pdf_path"]) != bodies["pdf"]:
            raise ValueError("PDF is not the recorded original archive member")
    return pdf_blocks(bodies["pdf"], source["title"], source["url"])

"""Register release-note locales from four official seeds, never guessed routes."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

from .ingest import (CACHE, LANGUAGES, ROOT, documentation_route, fetch_one,
                     initial_registry, load, merge_registry, save)


def linked_locales(seed, extracted, source):
    locations, unresolved = {}, []
    documentation = extracted["documentation"]
    route = documentation_route(seed["url"])
    for language in LANGUAGES:
        matches = sorted({item["url"] for item in documentation["locale_links"] if item["language"] == language})
        identifier = seed["id"] + "-" + language
        if len(matches) > 1:
            raise ValueError(f"Ambiguous official locale links for {identifier}: {matches}")
        if not matches:
            unresolved.append({
                "id": identifier, "language": language, "parent": source["url"],
                "status": "not_linked", "checked_at": source["fetch"]["checked_at"],
                "parent_sha256": source["fetch"]["sha256"],
                "supported_site_languages": sorted({item["language"] for item in documentation["locale_links"]}),
                "reason": "No official hreflang counterpart in this edition's navigation; no URL guessed or English fallback registered.",
            })
            continue
        alternate_route = documentation_route(matches[0])
        if alternate_route != {**route, "language": language}:
            raise ValueError(f"Official locale link changes requested edition/channel: {identifier}: {matches[0]}")
        locations[identifier] = {
            "url": matches[0],
            "discovery": {"method": "official_docs_hreflang", "parent": source["url"],
                          "parent_sha256": source["fetch"]["sha256"],
                          "checked_at": source["fetch"]["checked_at"], "language": language,
                          "requested_channel": route["channel"], "requested_version": route["version"]},
        }
    return locations, unresolved


def advertised_public_revision(parent, extracted, release):
    """Only an actually advertised version route can become the bounded public pin."""
    matches = [link for link in extracted["documentation"]["version_links"]
               if link["label"] == release]
    if len(matches) != 1:
        raise ValueError(f"Public release {release!r} needs one advertised documentation link")
    route = documentation_route(matches[0]["url"])
    if route["language"] != "en" or route["channel"] != "versioned":
        raise ValueError("Public revision must be an English versioned documentation route")
    source = deepcopy(parent)
    source.update(id="docs-public-release-notes-en", url=matches[0]["url"],
                  documentation_channel="versioned", fetch={"status": "not_fetched"},
                  discovery={"method": "official_docs_version_link", "parent": parent["url"],
                             "parent_sha256": parent["fetch"]["sha256"], "label": release,
                             "checked_at": parent["fetch"]["checked_at"]})
    for key in ("resolved_url", "title", "catalog_scope"):
        source.pop(key, None)
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transport", choices=("urllib", "curl"), default="urllib")
    parser.add_argument("--public-release", help="Also check this exact advertised public revision (for example '21 R4')")
    args = parser.parse_args()
    config = load(ROOT / "data/sources.json")
    seeds = [seed for seed in config["seeds"] if seed["family"] == "documentation-release-notes"]
    if len(seeds) != 4:
        parser.error("Discovery is bounded to the four configured release-note seeds")
    registry_path = ROOT / "data/registry.json"
    locations_path = ROOT / "data/source-locations.json"
    locations_document = load(locations_path)
    entries = merge_registry(initial_registry(config, locations_document["locations"]), load(registry_path))
    by_id = {entry["id"]: entry for entry in entries}
    locations = {key: value for key, value in locations_document["locations"].items() if
                 key not in {seed["id"] + "-" + language for seed in seeds for language in LANGUAGES}}
    unresolved = [item for item in locations_document["unresolved"] if
                  item["id"] not in {seed["id"] + "-" + language for seed in seeds for language in LANGUAGES}]
    updates = {}
    for seed in seeds:
        identifier = seed["id"] + "-en"
        source, _ = fetch_one(by_id[identifier], transport=args.transport)
        updates[identifier] = source
        if source["fetch"]["status"] != "available":
            save(registry_path, [updates.get(entry["id"], entry) for entry in entries])
            raise ValueError(f"Cannot discover locales from {identifier}: {source['fetch']['status']}")
        extracted = load(CACHE / "extracts" / (identifier + ".json"))
        found, missing = linked_locales(seed, extracted, source)
        locations.update(found)
        unresolved.extend(missing)
    if args.public_release:
        parent = updates["docs-current-release-notes-en"]
        revision = advertised_public_revision(
            parent, load(CACHE / "extracts" / (parent["id"] + ".json")), args.public_release)
        revision, _ = fetch_one(revision, refresh=True, transport=args.transport)
        if revision["fetch"]["status"] != "available":
            raise ValueError(f"Public revision unavailable: {revision['fetch']['status']}")
        updates[revision["id"]] = revision
        found, missing = linked_locales(
            {**revision, "id": "docs-public-release-notes"},
            load(CACHE / "extracts" / (revision["id"] + ".json")), revision)
        locations.update(found)
        unresolved = [item for item in unresolved if not item["id"].startswith("docs-public-release-notes-")] + missing
        entries = [entry for entry in entries if not entry["id"].startswith("docs-public-release-notes-")]
        entries.append(revision)
        for language in LANGUAGES:
            identifier = "docs-public-release-notes-" + language
            if language == "en" or identifier not in found:
                continue
            entries.append({**deepcopy(revision), "id": identifier, "language": language,
                            "url": found[identifier]["url"], "discovery": found[identifier]["discovery"],
                            "fetch": {"status": "not_fetched"}})
    save(locations_path, {**locations_document, "locations": locations, "unresolved": unresolved})
    entries = merge_registry(initial_registry(config, locations), [updates.get(entry["id"], entry) for entry in entries])
    checked_families = {seed["id"] for seed in seeds}
    if args.public_release:
        checked_families.add("docs-public-release-notes")
    selected = [entry for entry in entries if entry["family"] == "documentation-release-notes"
                and entry["language"] != "en" and entry["id"].rsplit("-", 1)[0] in checked_families]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for source, _ in pool.map(lambda entry: fetch_one(entry, transport=args.transport), selected):
            updates[source["id"]] = source
    save(registry_path, [updates.get(entry["id"], entry) for entry in entries])
    for source in updates.values():
        print(f"{source['id']}: {source['fetch']['status']}; edition={source['edition']}; {source.get('resolved_url')}")
    print(f"{len(updates)} affected sources checked; {len(unresolved)} unresolved locales; no catalog changes generated.")


if __name__ == "__main__":
    main()

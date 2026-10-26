"""Validate and publish a small, explicit catalog; never generate content at runtime."""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from .ingest import CACHE, LANGUAGES, ROOT, load, save
from .discover_archive import document_identity

BUCKETS = [f"v{major}" for major in range(16, 22)] + ["latest"]
STAGES = ["syntax", "compilation", "runtime", "modernization", "unknown"]
CRITICALITIES = ["blocking", "high", "medium", "low", "unknown"]


def bucket(release, current_major=21):
    match = re.fullmatch(r"(?:4D\s*)?v?(\d+)(?:\.\d+)*(?:\s+R(\d+))?", release.strip(), re.I)
    if not match:
        raise ValueError(f"Invalid exact release: {release!r}")
    major, r = int(match[1]), match[2]
    if r:
        return "latest" if major == current_major else f"v{major + 1}"
    return f"v{major}"


def merge_candidates(candidates):
    """Explicit editorial IDs deduplicate editions, not text/title similarity."""
    merged = {}
    for candidate in candidates:
        identifier = candidate["id"]
        if identifier not in merged:
            merged[identifier] = deepcopy(candidate)
            continue
        prior = merged[identifier]
        left, right = deepcopy(prior), deepcopy(candidate)
        left.pop("evidence")
        right.pop("evidence")
        if left != right:
            raise ValueError(f"Conflicting repeated change {identifier}; resolve editorially")
        for evidence in candidate["evidence"]:
            if evidence not in prior["evidence"]:
                prior["evidence"].append(deepcopy(evidence))
    return list(merged.values())


def deep_merge(original, patch):
    result = deepcopy(original)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def apply_overrides(candidates, overrides):
    require(overrides.get("schema_version") == 1, "Unsupported override schema version")
    result = []
    identifiers = {c["id"] for c in candidates}
    unknown = set(overrides["changes"]) - identifiers
    if unknown:
        raise ValueError(f"Overrides reference unknown IDs: {sorted(unknown)}")
    for change in candidates:
        override = overrides["changes"].get(change["id"])
        if override:
            if set(override) != {"reason", "patch"} or not override["reason"].strip():
                raise ValueError("Every override requires a reason and patch")
            if "id" in override["patch"]:
                raise ValueError("Overrides cannot change stable IDs")
            change = deep_merge(change, override["patch"])
            change["editorial_override"] = {"reason": override["reason"]}
        result.append(change)
    return result


def require(condition, message):
    if not condition:
        raise ValueError(message)


def url(value):
    return isinstance(value, str) and urlsplit(value).scheme == "https" and bool(urlsplit(value).netloc)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def validate(document):
    require(document["schema_version"] == 1, "Unsupported schema version")
    sources = {s["id"]: s for s in document["sources"]}
    require(len(sources) == len(document["sources"]), "Duplicate source IDs")
    navigation = document["archive_navigation"]
    require(navigation["schema_version"] == 1, "Unsupported archive navigation schema")
    indexes = {page["url"]: page for page in navigation["pages"]}
    require(len(indexes) == len(navigation["pages"]) <= 24, "Invalid/over-limit archive indexes")
    for source in sources.values():
        for field in ("id", "family", "publisher", "authority", "edition", "language", "url", "discovery", "fetch"):
            require(field in source, f"Source missing {field}")
        require(source["language"] in LANGUAGES and url(source["url"]), "Invalid source language/URL")
        require(nonempty(source["fetch"]["status"]), "Missing source fetch status")
        if source["discovery"]["method"] == "archive_directory_link":
            discovery = source["discovery"]
            chain = discovery["chain"]
            require(len(chain) >= 2 and chain[0] == navigation["root"] and chain[-1] == source["url"],
                    "Invalid archive discovery chain")
            require(chain[-2] == discovery["parent"] and all(item in indexes for item in chain[:-1]),
                    "Discovery path requires recorded archive indexes")
            for index, parent in enumerate(chain[:-1]):
                require(indexes[parent]["parent"] == (chain[index - 1] if index else None),
                        "Archive index parent does not match traced path")
            require(discovery["index_sha256"] == indexes[discovery["parent"]]["sha256"],
                    "Discovery index hash mismatch")
            require(document_identity(source["url"]) == (discovery["document_key"], source["language"]),
                    "Discovered document identity/language mismatch")
        for attempt in source.get("url_history", []):
            require(url(attempt["url"]) and nonempty(attempt["fetch"]["status"])
                    and attempt["disposition"] in {"superseded_url_probe", "superseded_location"},
                    "Historical URL attempt needs URL, recorded status and disposition")
    ids = set()
    for change in document["changes"]:
        for field in ("id", "identifiers", "threshold", "applies_until", "platforms", "modules", "type",
                      "criticality", "stage", "relevance", "applicability", "action", "localizations",
                      "evidence", "confidence", "review_status", "notices"):
            require(field in change, f"Change {change.get('id')} missing {field}")
        identifier = change["id"]
        require(bool(re.fullmatch(r"chg-[a-z0-9]+(?:-[a-z0-9]+)*", identifier)), "Invalid stable change ID")
        require(identifier not in ids, f"Duplicate change {identifier}")
        ids.add(identifier)
        threshold = change["threshold"]
        if threshold["kind"] == "unknown":
            require(threshold["exact"] is None and threshold["bucket"] is None,
                    "Unknown threshold must not invent an exact release or bucket")
        else:
            require(nonempty(threshold["exact"]) and threshold["bucket"] == bucket(threshold["exact"]),
                    f"Incorrect bucket for {identifier}")
            require(threshold["kind"] in {"introduced", "target_requirement"}, "Invalid threshold kind")
        if change["applies_until"] is not None:
            require(change["applies_until"] in BUCKETS, "Invalid applies_until bucket")
        require(change["stage"] in STAGES, "Invalid stage")
        require(change["criticality"] in CRITICALITIES, "Invalid criticality")
        require(change["review_status"] in {"candidate", "reviewed"}, "Invalid review status")
        if change["review_status"] == "reviewed":
            require(nonempty(change.get("reviewed_by")) and nonempty(change.get("reviewed_at")),
                    "Human review requires named reviewer and date")
        require(change["confidence"] in {"high", "medium", "low"}, "Invalid confidence")
        require(change["relevance"]["status"] in {"in_scope", "out_of_scope", "conditional", "unknown"}
                and nonempty(change["relevance"]["reason"]), "Missing relevance reason")
        require(nonempty(change["action"]) or (change["action"] is None and nonempty(change.get("action_basis"))),
                "Unknown action must be null with an explanation, not an invented instruction")
        require(isinstance(change["platforms"], list) and bool(change["platforms"]) and
                set(change["platforms"]) <= {"all", "unknown", "windows", "macos", "linux"}, "Invalid platforms")
        require(isinstance(change["modules"], list) and bool(change["modules"]) and
                all(nonempty(x) for x in change["modules"]), "Missing extensible module labels")
        require(isinstance(change["identifiers"], list) and all(nonempty(x) for x in change["identifiers"]),
                "Invalid identifiers")
        require(isinstance(change["type"], str) and nonempty(change["type"]), "Missing change type")
        applicability = change["applicability"]
        require(isinstance(applicability["formats"], list) and bool(applicability["formats"]) and
                set(applicability["formats"]) <= {"binary", "project", "unknown"}, "Invalid format applicability")
        require(isinstance(applicability["conditions"], list) and bool(applicability["conditions"]) and
                all(nonempty(x) for x in applicability["conditions"]), "Missing applicability conditions")
        require(set(change["localizations"]) == set(LANGUAGES), f"Missing localization for {identifier}")
        for language, text in change["localizations"].items():
            require(all(nonempty(text.get(k)) for k in ("one_line", "paragraph", "provenance")),
                    f"Incomplete {language} localization for {identifier}")
            require(text["provenance"] in {"generated_candidate", "human_reviewed", "official_translation"},
                    "Invalid localization provenance")
            require(len(text["one_line"]) <= 240, "One-line summary too long")
            if language != "en":
                require(text["paragraph"] != change["localizations"]["en"]["paragraph"], "English fallback is not a translation")
            if text["provenance"] == "human_reviewed":
                require(nonempty(text.get("reviewed_by")) and nonempty(text.get("reviewed_at")),
                        "Reviewed localization requires a reviewer and date")
            if text["provenance"] == "official_translation":
                official_source = sources.get(text.get("source_id"))
                require(official_source is not None and official_source["language"] == language
                        and official_source["edition"] == text.get("edition"),
                        "Official translation requires a same-language, same-edition source")
        require(isinstance(change["evidence"], list) and bool(change["evidence"]), f"Missing evidence for {identifier}")
        for evidence in change["evidence"]:
            source = sources.get(evidence["source_id"])
            require(source is not None, "Evidence references an unknown source")
            require(url(evidence["url"]), "Invalid evidence URL")
            require(all(nonempty(evidence.get(k)) for k in ("heading", "excerpt", "block_id", "source_sha256")),
                    "Missing evidence provenance")
            require(len(evidence["excerpt"]) <= 420, "Evidence excerpts must be short; link to original instead")
            require(bool(re.fullmatch(r"[a-f0-9]{64}", evidence["source_sha256"])), "Invalid source hash")
        require(isinstance(change["notices"], list), "Invalid notices")
    clarifications = {c["id"]: c for c in document["clarifications"]}
    require(len(clarifications) == len(document["clarifications"]), "Duplicate clarification IDs")
    for item in clarifications.values():
        require(item["status"] in {"pending", "resolved", "superseded"}, "Invalid clarification status")
        require(nonempty(item["title"]) and nonempty(item["disposition"]) and bool(item["evidence"]),
                "Clarification needs evidence and disposition")
        require(set(item["change_ids"]) <= ids, "Unknown affected change")
        require(url(item["issue_url"]), "Confirmed public clarification requires its GitHub issue URL")
    for change in document["changes"]:
        require(set(change["notices"]) <= clarifications.keys(), "Unknown clarification notice")
    latest = document["latest"]
    if latest["release"] is not None:
        require(latest["status"] == "verified" and url(latest["url"]) and nonempty(latest["verified_at"])
                and nonempty(latest.get("excerpt")), "Latest needs verified concrete release and evidence")
        bucket(latest["release"])
    else:
        require(latest["status"] == "unverified", "Unverified latest must not resolve to a release")
    semantic = document["semantic_search"]
    require(semantic["status"] == "unavailable" and semantic["model"] is None,
            "Semantic inference is not implemented; never publish a pretend available state")
    for disposition in document["dispositions"]:
        require(disposition["source_id"] in sources and nonempty(disposition["reason"])
                and url(disposition["url"]), "Disposition requires source, URL and reason")
        require(disposition["status"] in {"out_of_scope", "pending"}, "Invalid editorial disposition")
    for concept in document["glossary"]["concepts"]:
        require(set(concept["official"]) == set(LANGUAGES), "Glossary must preserve explicit language unknowns")
        for language, term in concept["official"].items():
            if term is None:
                continue
            source = sources.get(term["source_id"])
            require(source is not None and source["language"] == language
                    and source["edition"] == concept["edition"] and nonempty(term["text"]),
                    "Official glossary term must align source language and edition")


def verify_evidence(document):
    sources = {s["id"]: s for s in document["sources"]}
    for change in document["changes"]:
        for evidence in change["evidence"]:
            source = sources[evidence["source_id"]]
            require(source["fetch"]["status"] == "available", "Cannot verify unavailable evidence")
            require(source["fetch"]["sha256"] == evidence["source_sha256"], "Source changed; review evidence before publishing")
            path = CACHE / "extracts" / (source["id"] + ".json")
            require(path.exists(), f"Fetch {source['id']} before live evidence verification")
            matches = [b for b in load(path)["blocks"] if b["id"] == evidence["block_id"]]
            require(len(matches) == 1, f"Evidence block not found for {change['id']}")
            block = matches[0]
            require(evidence["excerpt"] in block["text"], "Excerpt is not verbatim in extracted block")
            require(evidence["heading"] in block["headings"], "Heading does not match evidence context")
            require(evidence["url"] == block["url"], "Evidence URL/anchor does not match resolved source")


def build(verify=False):
    registry = load(ROOT / "data/registry.json")
    changes = apply_overrides(merge_candidates(load(ROOT / "data/changes.json")),
                              load(ROOT / "data/overrides.json"))
    # Reproducible offline builds: derive the publication timestamp from committed
    # inputs, not the current clock. Fetch timestamps still record actual requests.
    timestamps = [s["fetch"].get("checked_at", "") for s in registry]
    generated_at = max(timestamps + [load(ROOT / "data/latest.json").get("verified_at") or ""])
    require(bool(generated_at), "Ingest sources before publication")
    datetime.fromisoformat(generated_at)
    coverage = {
        "english_seeds": len(load(ROOT / "data/sources.json")["seeds"]),
        "registered_sources": len(registry),
        "superseded_url_probes": sum(attempt["disposition"] == "superseded_url_probe"
                                      for source in registry for attempt in source.get("url_history", [])),
        "fetch_status": dict(sorted(Counter(s["fetch"]["status"] for s in registry).items())),
        "processed_source_ids": sorted({e["source_id"] for c in changes for e in c["evidence"]}),
        "candidate_changes": sum(c["review_status"] == "candidate" for c in changes),
        "reviewed_changes": sum(c["review_status"] == "reviewed" for c in changes),
        "note": "Partial candidate sample only. Fetching/extracting a source is not reviewing or fully cataloging it. No results does not mean no upgrade issues.",
    }
    document = {"schema_version": 1, "generated_at": generated_at, "coverage": coverage,
                "sources": registry, "changes": changes,
                "latest": load(ROOT / "data/latest.json"),
                "semantic_search": load(ROOT / "data/semantic-search.json"),
                "clarifications": load(ROOT / "data/clarifications.json"),
                "discoveries": load(ROOT / "data/discoveries.json"),
                "dispositions": load(ROOT / "data/dispositions.json"),
                "glossary": load(ROOT / "data/glossary.json"),
                "archive_navigation": load(ROOT / "data/archive-navigation.json"),
                "archive_unresolved": load(ROOT / "data/source-locations.json")["unresolved"]}
    validate(document)
    if verify:
        verify_evidence(document)
    save(ROOT / "site/data/catalog.json", document)
    print(f"Published {len(changes)} changes ({coverage['reviewed_changes']} reviewed); "
          f"{len(registry)} registered sources. Partial coverage.")
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-evidence", action="store_true", help="Check excerpts, headings and hashes against local source extracts")
    args = parser.parse_args()
    build(args.verify_evidence)


if __name__ == "__main__":
    main()

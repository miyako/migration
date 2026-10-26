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

from .ingest import CACHE, LANGUAGES, ROOT, documentation_route, load, save
from .discover_archive import document_identity
from .semantic import validate_config, publish_index

BUCKETS = [f"v{major}" for major in range(16, 22)] + ["latest"]
STAGES = ["syntax", "compilation", "runtime", "modernization", "unknown"]
CRITICALITIES = ["blocking", "high", "medium", "low", "unknown"]
COMPLEXITIES = ["simple", "moderate", "complex", "unknown"]


def release_key(release):
    """Order base/patch, R-cycle, hotfix and build releases without rewriting provenance."""
    match = re.fullmatch(
        r"(?:4D\s*)?v?(\d+)((?:\.\d+){0,3})(?:\s*R(\d+))?"
        r"(?:\s*HF\s*(\d+))?(?:\s*(?:build\s*(\d+)|\(build\s*(\d+)\)))?",
        release.strip() if isinstance(release, str) else "", re.I)
    if match is None:
        raise ValueError(f"Invalid exact release: {release!r}")
    patches = [int(part) for part in match[2].split(".") if part]
    return (int(match[1]), int(match[3] or 0), *(patches + [0] * (3 - len(patches))),
            int(match[4] or 0), int(match[5] or match[6] or 0))


def bucket(release, current_major=21):
    major, r, *_ = release_key(release)
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
        validate_version_applicability(change)
        result.append(change)
    return result


def group_entities(changes, config):
    """Project explicit feature groups without deleting or reclassifying atomic facts."""
    require(config.get("schema_version") == 1, "Unsupported group schema version")
    for change in changes:
        validate_version_applicability(change)
    by_id = {c["id"]: c for c in changes}
    owners, groups = {}, {}
    compatible = ("threshold", "applies_until", "type", "stage", "criticality", "platforms",
                  "complexity", "review_status")
    for definition in config["groups"]:
        identifier, member_ids = definition["id"], definition["member_ids"]
        require(identifier not in by_id and identifier not in groups, "Group ID must be unique and distinct from atomic IDs")
        require(isinstance(member_ids, list) and len(member_ids) >= 2
                and len(set(member_ids)) == len(member_ids), "A group needs distinct explicit members")
        require(set(member_ids) <= by_id.keys(), "Group references unknown atomic IDs")
        require(not (set(member_ids) & owners.keys()), "Atomic fact cannot belong to multiple entities")
        require(nonempty(definition.get("reason")) and bool(definition.get("conditions")),
                "Group needs an editorial reason and applicability conditions")
        members = [by_id[mid] for mid in member_ids]
        first = members[0]
        require(all(all(member.get(key) == first.get(key) for key in compatible)
                    and member["applicability"]["formats"] == first["applicability"]["formats"]
                    and member["applicability"].get("target_releases") ==
                    first["applicability"].get("target_releases")
                    for member in members), "Group members have incompatible cutoff/status/platform/format metadata")
        require(first.get("complexity", {"level": "unknown"}) == {"level": "unknown"},
                "Group difficulty needs separate evidence; do not infer it from members")
        require(first["review_status"] == "candidate", "Authored groups require their own review, not inherited human review")
        require(set(definition["localizations"]) == set(LANGUAGES)
                and all(nonempty(text.get("action")) and text.get("provenance") == "generated_candidate"
                        for text in definition["localizations"].values()),
                "Group needs complete authored localizations and actions")
        validate_localized_applicability({**definition, "action_basis": definition["reason"]})
        extra_ids = definition.get("evidence_from", [])
        require(set(extra_ids) <= by_id.keys(), "Group evidence references an unknown fact")
        entity = deepcopy(first)
        entity.update(id=identifier, member_ids=list(member_ids), members=deepcopy(members),
                      localizations=deepcopy(definition["localizations"]),
                      action=definition["localizations"]["en"]["action"],
                      action_basis=definition["localizations"]["en"]["action_basis"])
        entity.pop("editorial_override", None)
        entity["applicability"]["conditions"] = list(definition["localizations"]["en"]["conditions"])
        entity["relevance"] = {"status": "conditional", "reason": definition["reason"]}
        entity["confidence"] = min((m["confidence"] for m in members),
                                   key={"low": 0, "medium": 1, "high": 2}.__getitem__)
        entity["identifiers"] = list(dict.fromkeys(
            name for member in members for name in member["identifiers"]))
        for language, text in entity["localizations"].items():
            text.setdefault("identifiers", list(dict.fromkeys(
                name for member in members
                for name in member["localizations"][language].get("identifiers", member["identifiers"]))))
        entity["modules"] = sorted({module for member in members for module in member["modules"]})
        entity["notices"] = list(dict.fromkeys(n for member in members for n in member["notices"]))
        entity["evidence"] = []
        for member in members + [by_id[mid] for mid in extra_ids]:
            for item in member["evidence"]:
                if item not in entity["evidence"]:
                    entity["evidence"].append(deepcopy(item))
        for member_id in member_ids:
            owners[member_id] = identifier
        groups[identifier] = entity
    result, emitted = [], set()
    for change in changes:
        owner = owners.get(change["id"])
        if owner:
            if owner not in emitted:
                result.append(groups[owner])
                emitted.add(owner)
        else:
            result.append({**deepcopy(change), "member_ids": [change["id"]]})
    return result


def require(condition, message):
    if not condition:
        raise ValueError(message)


def url(value):
    return isinstance(value, str) and urlsplit(value).scheme == "https" and bool(urlsplit(value).netloc)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def invariant_identifier(value, identifiers):
    """Only whole technical identifiers may be shared; surrounding prose must be authored."""
    return value in identifiers or bool(re.fullmatch(r"_o_[A-Za-z][A-Za-z0-9_ ]*", value, re.I))


def validate_localized_applicability(change):
    localizations = change.get("localizations")
    require(isinstance(localizations, dict) and set(localizations) == set(LANGUAGES),
            f"Missing localization for {change['id']}")
    english = localizations["en"]
    require(isinstance(english, dict), f"Invalid English localization for {change['id']}")
    identifiers = change.get("identifiers", [])
    for language, text in localizations.items():
        label = f"{change['id']} ({language})"
        require(isinstance(text, dict), f"Invalid localization for {label}")
        conditions = text.get("conditions")
        require(isinstance(conditions, list) and bool(conditions)
                and all(nonempty(condition) for condition in conditions),
                f"Missing localized conditions for {label}")
        require(nonempty(text.get("action")), f"Missing localized action for {label}")
        if "action_basis" in change or "action_basis" in text:
            require(nonempty(text.get("action_basis")), f"Missing localized action basis for {label}")
        if language != "en":
            require(all(condition not in english.get("conditions", [])
                        or invariant_identifier(condition, identifiers) for condition in conditions),
                    f"English fallback is not translated conditions for {label}")
            if "action_basis" in change:
                basis = text["action_basis"]
                require(basis != english.get("action_basis") or invariant_identifier(basis, identifiers),
                        f"English fallback is not a translated action basis for {label}")


def validate_version_applicability(change):
    applicability = change.get("applicability", {})
    if "target_releases" in applicability:
        targets = applicability["target_releases"]
        require(isinstance(targets, list) and bool(targets)
                and all(nonempty(value) for value in targets) and len(set(targets)) == len(targets),
                "Target releases must be distinct exact release strings")
        for target in targets:
            release_key(target)
    threshold = change["threshold"]
    alternatives = threshold.get("alternatives")
    require("alternatives" not in threshold or isinstance(alternatives, list),
            "Threshold alternatives must be an exact release list")
    if threshold["kind"] == "unknown":
        require(threshold["exact"] is None and threshold["bucket"] is None and alternatives is None,
                "Unknown threshold must not invent exact releases or buckets")
        releases = []
    else:
        require(threshold["kind"] in {"introduced", "target_requirement"}, "Invalid threshold kind")
        require(nonempty(threshold["exact"]) and threshold["bucket"] == bucket(threshold["exact"]),
                f"Incorrect bucket for {change['id']}")
        # Alternatives are exact branch cutoffs, not replacement provenance or inferred ranges.
        require(alternatives is None or
                (isinstance(alternatives, list) and bool(alternatives)
                 and all(nonempty(value) for value in alternatives)
                 and len(set(alternatives)) == len(alternatives)
                 and threshold["exact"] in alternatives),
                "Threshold alternatives must be distinct exact releases including the primary exact release")
        releases = [release_key(value) for value in
                    (alternatives if alternatives is not None else [threshold["exact"]])]
    bound = change.get("applies_until")
    if bound is not None:
        require(nonempty(bound), "Invalid applies_until release")
        if bound != "latest":
            until = release_key(bound)
            require(all(release < until for release in releases),
                    "Exclusive applies_until must follow every threshold alternative")


def validate_documentation_version_link(source, sources):
    discovery = source["discovery"]
    parent = next((item for item in sources.values() if item["url"] == discovery.get("parent")), None)
    require(parent is not None and parent["family"] == "documentation-release-notes"
            and parent["language"] == "en" and parent.get("documentation_channel") == "moving-current"
            and parent["fetch"]["status"] == "available"
            and nonempty(discovery.get("parent_sha256"))
            and discovery["parent_sha256"] == parent["fetch"].get("sha256"),
            "Official version discovery needs a checked moving-current English parent hash")
    route = documentation_route(source["url"])
    require(source["language"] == "en" and route["language"] == "en" and route["channel"] == "versioned"
            and discovery.get("label") == route["version"].replace("-R", " R")
            and {"label": discovery.get("label"), "url": source["url"]} in
            parent["fetch"].get("documentation", {}).get("version_links", []),
            "Version URL and release label must be advertised together by their parent")


def validate(document):
    require(document["schema_version"] == 1, "Unsupported schema version")
    sources = {s["id"]: s for s in document["sources"]}
    require(len(sources) == len(document["sources"]), "Duplicate source IDs")
    navigation = document["archive_navigation"]
    require(navigation["schema_version"] == 1, "Unsupported archive navigation schema")
    indexes = {page["url"]: page for page in navigation["pages"]}
    require(len(indexes) == len(navigation["pages"]) <= 24, "Invalid/over-limit archive indexes")
    for unresolved in document["archive_unresolved"]:
        if unresolved["status"] != "not_linked":
            continue
        parent = next((source for source in sources.values() if source["url"] == unresolved["parent"]), None)
        require(parent is not None and parent["family"] == "documentation-release-notes"
                and parent["language"] == "en" and unresolved["parent_sha256"] == parent["fetch"]["sha256"],
                "Unlinked documentation locale needs checked English parent provenance")
        require("url" not in unresolved and "http_status" not in unresolved and
                unresolved["language"] not in unresolved["supported_site_languages"] and
                unresolved["supported_site_languages"] == sorted({
                    item["language"] for item in parent["fetch"]["documentation"]["locale_links"]}),
                "Unlinked locale is discovery metadata, not a guessed URL or HTTP failure")
    for source in sources.values():
        for field in ("id", "family", "publisher", "authority", "edition", "language", "url", "discovery", "fetch"):
            require(field in source, f"Source missing {field}")
        require(source["language"] in LANGUAGES and url(source["url"]), "Invalid source language/URL")
        require(nonempty(source["fetch"]["status"]), "Missing source fetch status")
        if source["family"] == "original-kb-technote":
            from .kb import kb_url
            require(kb_url(source["url"]) and re.fullmatch(r"/assetid=\d+", urlsplit(source["url"]).path)
                    and source["language"] == "en" and source["authority"] == "official_technical_note",
                    "KB citations require an original English KB landing page")
            discovery = source["discovery"]
            require(discovery["method"] == "pinned_summary_index"
                    and discovery.get("repository") == "miyako/4d-tech-notes-summary"
                    and bool(re.fullmatch(r"[a-f0-9]{40}", discovery.get("revision", "")))
                    and re.fullmatch(r"technotes/\d+_[^/]+/meta.json", discovery.get("path", "")),
                    "KB discovery must retain a separate pinned index path")
            if source["fetch"]["status"] == "available":
                pdf = source["kb_document"]
                require(kb_url(pdf["download_url"]) and pdf["language"] == "en"
                        and all(nonempty(pdf.get(k)) for k in
                                ("pdf_path", "byline", "published_on", "displayed_version",
                                 "copyright_observation", "rights"))
                        and all(re.fullmatch(r"[a-f0-9]{64}", pdf.get(k, "")) for k in
                                ("pdf_sha256", "archive_sha256"))
                        and isinstance(pdf["page_count"], int) and pdf["page_count"] > 0,
                        "KB source requires original download, PDF identity and publication provenance")
        if source["family"] == "documentation-release-notes":
            route = documentation_route(source["url"])
            require(route["language"] == source["language"] and route["channel"] == source["documentation_channel"],
                    "Documentation route locale/channel mismatch")
            require(source["authority"] == "official_documentation" and source["host_operator"] == "4D",
                    "Modern documentation must not be classified as the legacy mirror")
            if source["discovery"]["method"] == "official_docs_version_link":
                validate_documentation_version_link(source, sources)
            if source["discovery"]["method"] == "official_docs_hreflang":
                discovery = source["discovery"]
                parent = next((item for item in sources.values() if item["url"] == discovery["parent"]), None)
                require(parent is not None and parent["language"] == "en" and
                        discovery["parent_sha256"] == parent["fetch"]["sha256"],
                        "Official locale discovery needs a checked English parent hash")
                require({"language": source["language"], "url": source["url"]} in
                        parent["fetch"]["documentation"]["locale_links"], "Locale URL is not linked by its parent")
            if source["fetch"]["status"] == "available":
                observed = source["fetch"]["documentation"]
                require(documentation_route(source["resolved_url"]) == route and
                        observed["locale"] == source["language"] and observed["article_scope"] and
                        observed["canonical_url"] == source["resolved_url"] and
                        source["edition"] == observed["version"].replace("-R", " R") and
                        (route["version"] is None or observed["version"] == route["version"]),
                        "Available documentation requires matching observed locale/edition/channel")
                if source["language"] != "en":
                    comparison = source["fetch"]["locale_comparison"]
                    require(comparison["english_content_sha256"] != comparison["localized_content_sha256"],
                            "English fallback cannot be an available translation")
        if source.get("manual"):
            require(nonempty(source["manual"]) and re.fullmatch(r"100-\d+", source.get("manual_document_key", "")),
                    "Manual identity requires a manual-root document key")
            if source["fetch"]["status"] == "available":
                parents = source["fetch"].get("manual_document_urls", [])
                require(bool(parents) and all(url(parent) and document_identity(parent) ==
                                             (source["manual_document_key"], source["language"]) and
                                             urlsplit(parent).path.rsplit("/", 1)[0] ==
                                             urlsplit(source["resolved_url"]).path.rsplit("/", 1)[0]
                                             for parent in parents),
                        "Available manual source requires verified same-edition parent links")
        if source["fetch"].get("content_kind") == "navigation_index":
            require(source["fetch"].get("navigation_entry_count") == source["fetch"]["block_count"],
                    "Navigation entry counts must match the extracted index view")
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
        if source["discovery"]["method"] == "legacy_article_link":
            discovery = source["discovery"]
            parent = sources.get(discovery["parent_source_id"])
            require(parent is not None and parent["language"] == source["language"]
                    and parent["edition"] == source["edition"]
                    and parent["resolved_url"] == discovery["parent"]
                    and parent["fetch"]["sha256"] == discovery["parent_sha256"],
                    "Linked legacy detail requires a checked same-edition, same-language parent")
            require(document_identity(source["url"]) == (discovery["document_key"], source["language"]),
                    "Linked legacy document identity/language mismatch")
            require(urlsplit(source["url"]).netloc == urlsplit(discovery["parent"]).netloc
                    and source["url"].rsplit("/", 1)[0] == discovery["parent"].rsplit("/", 1)[0],
                    "Linked legacy detail must stay on the parent's archive edition route")
        for attempt in source.get("url_history", []):
            require(url(attempt["url"]) and nonempty(attempt["fetch"]["status"])
                    and attempt["disposition"] in {"superseded_url_probe", "superseded_location"},
                    "Historical URL attempt needs URL, recorded status and disposition")
    ids, member_owners = set(), set()
    for change in document["changes"]:
        for field in ("id", "identifiers", "threshold", "applies_until", "platforms", "modules", "type",
                      "criticality", "stage", "relevance", "applicability", "action", "localizations",
                      "evidence", "confidence", "review_status", "notices"):
            require(field in change, f"Change {change.get('id')} missing {field}")
        identifier = change["id"]
        require(bool(re.fullmatch(r"chg-[a-z0-9]+(?:-[a-z0-9]+)*", identifier)), "Invalid stable change ID")
        require(identifier not in ids, f"Duplicate change {identifier}")
        ids.add(identifier)
        if "member_ids" in change:
            member_ids = change["member_ids"]
            require(isinstance(member_ids, list) and bool(member_ids)
                    and all(nonempty(mid) for mid in member_ids)
                    and len(member_ids) == len(set(member_ids))
                    and not (set(member_ids) & member_owners),
                    "Entity membership must be explicit, unique and non-overlapping")
            member_owners.update(member_ids)
            if len(member_ids) > 1:
                members = change.get("members", [])
                require([m["id"] for m in members] == member_ids,
                        "Grouped entity must retain every member's facts in order")
                require(all(all(m[key] == change[key] for key in
                                ("threshold", "applies_until", "type", "stage", "criticality", "platforms", "complexity"))
                            and m["applicability"]["formats"] == change["applicability"]["formats"]
                            and m["applicability"].get("target_releases") ==
                            change["applicability"].get("target_releases")
                            for m in members), "Published group metadata must match every member")
                for member in members:
                    validate_localized_applicability(member)
            else:
                require(member_ids == [identifier], "Ungrouped entity must retain its stable atomic ID")
        validate_version_applicability(change)
        require(change["stage"] in STAGES, "Invalid stage")
        require(change["criticality"] in CRITICALITIES, "Invalid criticality")
        complexity = change.get("complexity", {"level": "unknown"})
        require(isinstance(complexity, dict) and complexity.get("level") in COMPLEXITIES,
                "Invalid remediation complexity")
        if complexity["level"] != "unknown":
            references = complexity.get("evidence_source_ids")
            require(nonempty(complexity.get("basis")) and isinstance(references, list) and bool(references)
                    and all(isinstance(source_id, str) and
                            any(e["source_id"] == source_id for e in change["evidence"])
                            for source_id in references),
                    "Known remediation complexity requires a documented basis and supporting change evidence")
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
        validate_localized_applicability(change)
        for language, text in change["localizations"].items():
            if "identifiers" in text:
                require(isinstance(text["identifiers"], list)
                        and all(nonempty(name) for name in text["identifiers"]),
                        "Localized display identifiers must be an explicit list")
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
            if source["family"] == "original-kb-technote":
                pdf = evidence.get("pdf", {})
                require(evidence["url"] == source["url"] and evidence["source_sha256"] == source["fetch"]["sha256"]
                        and pdf.get("download_url") == source["kb_document"]["download_url"]
                        and pdf.get("sha256") == source["kb_document"]["pdf_sha256"]
                        and pdf.get("path") == source["kb_document"]["pdf_path"]
                        and pdf.get("archive_sha256") == source["kb_document"]["archive_sha256"]
                        and isinstance(pdf.get("page"), int)
                        and 1 <= pdf["page"] <= source["kb_document"]["page_count"]
                        and f"(PDF p. {pdf['page']})" in evidence["heading"],
                        "KB evidence must distinguish landing citation from exact PDF page provenance")
        require(isinstance(change["notices"], list), "Invalid notices")
    atomic_ids = {member_id for change in document["changes"] for member_id in change.get("member_ids", [change["id"]])}
    clarifications = {c["id"]: c for c in document["clarifications"]}
    require(len(clarifications) == len(document["clarifications"]), "Duplicate clarification IDs")
    for item in clarifications.values():
        require(item["status"] in {"pending", "resolved", "superseded"}, "Invalid clarification status")
        require(nonempty(item["title"]) and nonempty(item["disposition"]) and bool(item["evidence"]),
                "Clarification needs evidence and disposition")
        require(set(item["change_ids"]) <= ids | atomic_ids, "Unknown affected change")
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
    validate_config(semantic)
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
    for names in document["glossary"].get("command_names", []):
        require(nonempty(names.get("en")) and nonempty(names.get("fr")),
                "Command-name mapping requires official English and French names")
        require(len(names["evidence"]) == 2, "Command-name mapping needs bilingual evidence")
        for language, evidence in zip(("en", "fr"), names["evidence"]):
            source = sources.get(evidence["source_id"])
            require(source is not None and source["language"] == language
                    and names[language] in evidence["excerpt"] + "\n" + evidence["heading"],
                    "Command-name mapping must be evidenced in the actual source language")
            require(len(evidence["excerpt"]) <= 420
                    and all(nonempty(evidence.get(key)) for key in
                            ("heading", "excerpt", "block_id", "source_sha256"))
                    and url(evidence["url"]), "Invalid command-name evidence provenance")


def verify_evidence(document):
    sources = {s["id"]: s for s in document["sources"]}
    kb_blocks = {}
    for source in sources.values():
        if source["family"] != "original-kb-technote" or source["fetch"]["status"] != "available":
            continue
        from .kb import verify_cached_document
        kb_blocks[source["id"]] = verify_cached_document(source)
    for source in sources.values():
        if source["discovery"]["method"] != "legacy_article_link":
            continue
        parent_id = source["discovery"]["parent_source_id"]
        path = CACHE / "extracts" / (parent_id + ".json")
        require(path.exists(), f"Fetch {parent_id} before linked-detail verification")
        require(any(link["url"] == source["url"] for link in load(path)["links"]),
                "Legacy detail URL is not actually linked by its recorded parent")
    evidence_owners = document["changes"] + [
        {"id": f"command-name:{names['en']}", "evidence": names["evidence"]}
        for names in document.get("glossary", {}).get("command_names", [])]
    for change in evidence_owners:
        for evidence in change["evidence"]:
            source = sources[evidence["source_id"]]
            require(source["fetch"]["status"] == "available", "Cannot verify unavailable evidence")
            require(source["fetch"]["sha256"] == evidence["source_sha256"], "Source changed; review evidence before publishing")
            path = CACHE / "extracts" / (source["id"] + ".json")
            require(path.exists(), f"Fetch {source['id']} before live evidence verification")
            matches = [b for b in load(path)["blocks"] if b["id"] == evidence["block_id"]]
            require(len(matches) == 1, f"Evidence block not found for {change['id']}")
            block = matches[0]
            if source["id"] in kb_blocks:
                actual = next((b for b in kb_blocks[source["id"]]
                               if b["id"] == evidence["block_id"]), None)
                require(actual == block and evidence["pdf"]["page"] == block["page"],
                        "KB evidence does not match the hashed original PDF page")
            require(evidence["excerpt"] in block["text"], "Excerpt is not verbatim in extracted block")
            require(evidence["heading"] in block["headings"], "Heading does not match evidence context")
            require(evidence["url"] == block["url"], "Evidence URL/anchor does not match resolved source")


def catalog_document(verify=False):
    registry = load(ROOT / "data/registry.json")
    atomic = apply_overrides(merge_candidates(load(ROOT / "data/changes.json")),
                             load(ROOT / "data/overrides.json"))
    if verify:
        verify_evidence({"sources": registry, "changes": atomic})
    changes = group_entities(atomic, load(ROOT / "data/groups.json"))
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
        "extraction_surfaces": dict(sorted(Counter(s["fetch"].get("content_kind", "unknown") for s in registry).items())),
        "processed_source_ids": sorted({e["source_id"] for c in changes for e in c["evidence"]}),
        "candidate_changes": sum(c["review_status"] == "candidate" for c in changes),
        "reviewed_changes": sum(c["review_status"] == "reviewed" for c in changes),
        "atomic_changes": len(atomic),
        "atomic_candidate_changes": sum(c["review_status"] == "candidate" for c in atomic),
        "visible_entities": len(changes),
        "grouped_entities": sum(len(c["member_ids"]) > 1 for c in changes),
        "modern_documentation_sources": sum(s["family"] == "documentation-release-notes" for s in registry),
        "modern_unlinked_locales": sum(item["status"] == "not_linked" for item in
                                      load(ROOT / "data/source-locations.json")["unresolved"]),
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
    validate({**document, "changes": atomic})
    validate(document)
    if verify:
        verify_evidence(document)
    return document


def build(verify=False):
    document = catalog_document(verify)
    publish_index(document, ROOT / "data/search", ROOT / "site/data/search")
    save(ROOT / "site/data/catalog.json", document)
    coverage = document["coverage"]
    print(f"Published {len(document['changes'])} entities from {coverage['atomic_changes']} atomic facts "
          f"({coverage['reviewed_changes']} reviewed); {len(document['sources'])} registered sources. Partial coverage.")
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-evidence", action="store_true", help="Check excerpts, headings and hashes against local source extracts")
    args = parser.parse_args()
    build(args.verify_evidence)


if __name__ == "__main__":
    main()

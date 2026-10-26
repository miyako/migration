"""Offline validation of the opt-in model contract and precomputed search assets."""
import hashlib
import json
import math
import re
from pathlib import Path
import shutil
import struct

LANGUAGES = ("en", "fr", "de", "es", "ja")
CONTRACT = ("model", "revision", "runtime", "precision", "dimensions", "max_tokens",
            "query_prefix", "document_prefix", "pooling", "normalization", "artifacts_sha256")


def validate_config(config):
    if config.get("status") == "unavailable" and config.get("model") is None:
        return
    if not (config.get("status") == "opt-in"
            and config.get("model") == "onnx-community/embeddinggemma-2-ONNX"
            and config.get("revision") == "daa72c51243991dfcaf9f9137d2c573d8f7790c0"
            and config.get("dimensions") == 768 and config.get("precision") == "q4"
            and config.get("normalization") == "l2" and config.get("backend") == "webgpu"
            and config.get("max_tokens") == 512
            and config.get("query_prefix") == "task: search result | query: "
            and config.get("document_prefix") == "title: {one_line} | text: {paragraph}\\n{identifiers}\\n{action}"
            and config.get("pooling") == "exported sentence_embedding: attention-mask mean pooling"
            and config.get("runtime") == {"transformers": "4.3.1",
                                        "onnxruntime": "1.31.0-dev.20260914-8d85527a0"}
            and isinstance(config.get("artifacts_sha256"), dict)
            and set(config["artifacts_sha256"]) == {"config.json", "tokenizer.json", "tokenizer_config.json",
                                                    "onnx/model_q4.onnx", "onnx/model_q4.onnx_data"}
            and all(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value)
                    for value in config["artifacts_sha256"].values())
            and 0 < config.get("threshold", 0) < 1):
        raise ValueError("Invalid semantic model contract")


def corpus_rows(catalog, language):
    rows = []
    for entity in catalog["changes"]:
        for fact in entity.get("members") or [entity]:
            text = fact["localizations"][language]
            identifiers = text.get("identifiers", fact.get("identifiers", []))
            rows.append({"id": fact["id"], "entity_id": entity["id"],
                         "text": f'title: {text["one_line"]} | text: {text["paragraph"]}\n'
                                 + " · ".join(identifiers) + "\n" + text["action"]})
    return sorted(rows, key=lambda row: row["id"])


def validate_index(catalog, directory):
    directory = Path(directory)
    config = catalog["semantic_search"]
    validate_config(config)
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("schema_version") != 1 or set(manifest["languages"]) != set(LANGUAGES):
        raise ValueError("Invalid semantic index schema/locales")
    if any(manifest.get(key) != config.get(key) for key in CONTRACT):
        raise ValueError("Semantic index/model configuration mismatch; rebuild the index")
    if manifest.get("upstream_revision") != config["candidate"]["upstream_revision"]:
        raise ValueError("Semantic upstream revision mismatch")
    for language in LANGUAGES:
        entry = manifest["languages"][language]
        rows = corpus_rows(catalog, language)
        fingerprint = hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        if entry["ids"] != [row["id"] for row in rows] or entry["corpus_sha256"] != fingerprint:
            raise ValueError(f"Stale semantic corpus for {language}; run npm run build:search-index")
        if entry["file"] != f"{language}.f32":
            raise ValueError("Invalid semantic vector filename")
        content = (directory / entry["file"]).read_bytes()
        dimensions = config["dimensions"]
        if len(content) != entry["bytes"] or len(content) != len(rows) * dimensions * 4:
            raise ValueError("Invalid semantic vector byte length")
        if hashlib.sha256(content).hexdigest() != entry["vectors_sha256"]:
            raise ValueError("Semantic vector checksum mismatch")
        values = struct.unpack(f"<{len(content) // 4}f", content)
        for offset in range(0, len(values), dimensions):
            vector = values[offset:offset + dimensions]
            if not all(math.isfinite(value) for value in vector) or abs(math.hypot(*vector) - 1) > 1e-5:
                raise ValueError("Invalid semantic vector normalization")
    return manifest


def publish_index(catalog, source, output):
    validate_index(catalog, source)
    Path(output).mkdir(parents=True, exist_ok=True)
    for name in ("manifest.json", *(f"{language}.f32" for language in LANGUAGES)):
        shutil.copyfile(Path(source) / name, Path(output) / name)

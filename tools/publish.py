"""Build a content-addressed, release-coherent static Pages artifact."""
import argparse
import hashlib
import json
from pathlib import Path

from tools.catalog import build
from tools.ingest import ROOT


def publish(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output == source or source in output.parents or output in source.parents:
        raise ValueError("Publication output must be separate from source")
    files = {path.relative_to(source): path.read_bytes()
             for path in sorted(source.rglob("*"))
             if path.is_file() and path.suffix in {".html", ".mjs", ".css", ".svg", ".json", ".wasm", ".f32", ".txt"}
             and not path.name.endswith(".test.mjs")}
    for name in ("index.html", "app.mjs", "logic.mjs", "styles.css", "4d.svg", "data/catalog.json"):
        if Path(name) not in files:
            raise ValueError(f"Missing required publication file: {name}")
    # Frame both paths and contents, so every runtime change creates a new namespace.
    digest = hashlib.sha256()
    for path, content in files.items():
        for part in (path.as_posix().encode(), content):
            digest.update(len(part).to_bytes(8, "big"))
            digest.update(part)
    release = Path("assets") / digest.hexdigest()
    html = files.pop(Path("index.html")).decode("utf-8")
    for name in ("app.mjs", "styles.css", "4d.svg"):
        original = f"./{name}"
        if original not in html:
            raise ValueError(f"Missing expected index reference: {original}")
        html = html.replace(original, f"./{release.as_posix()}/{name}")
    for path, content in files.items():
        target = output / release / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    output.mkdir(parents=True, exist_ok=True)
    (output / "index.html").write_text(html, encoding="utf-8")
    return release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "_site")
    args = parser.parse_args()
    catalog = build()
    runtime = ROOT / "site/search-runtime"
    if not (runtime / "versions.json").is_file():
        raise ValueError("Missing search runtime; run npm ci && npm run build:search-runtime")
    if json.loads((runtime / "versions.json").read_text()) != catalog["semantic_search"]["runtime"]:
        raise ValueError("Search runtime version mismatch; run npm ci && npm run build:search-runtime")
    for name in ("transformers.mjs", "ort-wasm-simd-threaded.jsep.mjs",
                 "ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.asyncify.mjs",
                 "ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.jspi.mjs",
                 "ort-wasm-simd-threaded.jspi.wasm", "LICENSE-transformers.txt", "LICENSE-tokenizers.txt",
                 "LICENSE-jinja.txt", "LICENSE-onnxruntime.txt"):
        if not (runtime / name).is_file():
            raise ValueError(f"Missing search runtime asset {name}; run npm run build:search-runtime")
    release = publish(ROOT / "site", args.output)
    print(f"Published coherent release: {release}")


if __name__ == "__main__":
    main()

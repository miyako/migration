"""Build a content-addressed, release-coherent static Pages artifact."""
import argparse
import hashlib
from pathlib import Path

from tools.catalog import build
from tools.ingest import ROOT


def publish(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output == source or source in output.parents or output in source.parents:
        raise ValueError("Publication output must be separate from source")
    files = {path.relative_to(source): path.read_bytes()
             for path in sorted(source.rglob("*"))
             if path.is_file() and path.suffix in {".html", ".mjs", ".css", ".svg", ".json"}
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
    build()
    release = publish(ROOT / "site", args.output)
    print(f"Published coherent release: {release}")


if __name__ == "__main__":
    main()

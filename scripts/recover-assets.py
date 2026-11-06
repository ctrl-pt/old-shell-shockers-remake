"""Recover the original May 2019 browser assets with explicit source provenance.

Run from the repository root: python scripts/recover-assets.py
The May CDX inventory and original client must already exist in research/.
Existing valid assets are retained. No generated replacement art or sounds are used.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import pathlib
import re
import threading
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MANIFEST = ROOT / "research/assets-manifest.json"
ARCHIVE = json.loads((ROOT / "research/archive-paths.json").read_text(encoding="utf8"))
LEGACY_TREE = json.loads((ROOT / "research/legacyshell-tree.json").read_text(encoding="utf8"))
TREE = LEGACY_TREE["tree"]
LEGACY_REVISION = LEGACY_TREE["sha"]
LEGACY_FILES = {x["path"] for x in TREE if x["type"] == "blob"}
CLIENT = (ROOT / "archive/client/shellshock.min.js").read_text(encoding="utf8")
INDEX = (ROOT / "archive/index-2019-05-19.html").read_text(encoding="utf8")
LOCK = threading.Lock()
RECORDS = json.loads(MANIFEST.read_text(encoding="utf8")) if MANIFEST.exists() else {}
EXPLICIT = {
    "img/logo.png": "https://web.archive.org/web/20190219223619id_/https://shellshock.io/img/logo.png?v=1",
    "includes/stylesheet.css": "https://web.archive.org/web/20190219223619id_/https://shellshock.io/includes/stylesheet.css?1550472677",
    "includes/game.css": "https://web.archive.org/web/20190519200726id_/https://shellshock.io/includes/game.css?1557782271",
}
FONT_REVISIONS = {
    "nunito": "933df38730df8e7a99d5ba1cf5071b26b7894910",  # 2017-02-17
    "sigmarone": "b7f0cc9e1bf34f771d90dff4a8e603e3dba59bb6",  # 2016-12-02
}


def fetch(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "ShellShockers-Preservation/1.0"})
    with urllib.request.urlopen(req, timeout=28) as response:
        return response.read(), response.url


def valid(path: str, data: bytes) -> bool:
    if not data or data.lstrip().lower().startswith((b"<!doctype html", b"<html")):
        return False
    if path.endswith(".babylon"):
        try:
            model = json.loads(data)
            return isinstance(model, dict) and "meshes" in model
        except (ValueError, UnicodeError):
            return False
    if path.endswith(".png"):
        return data.startswith(b"\x89PNG")
    if path.endswith((".jpg", ".jpeg")):
        return data.startswith(b"\xff\xd8")
    if path.endswith(".gif"):
        return data.startswith(b"GIF8")
    if path.endswith(".mp3"):
        return data.startswith(b"ID3") or data[0] == 255
    return True


def candidates(path: str):
    if path in EXPLICIT:
        yield EXPLICIT[path], "wayback-original-2019"
    if path.startswith("fonts/"):
        name = pathlib.PurePosixPath(path).name
        family = "nunito" if name.startswith("Nunito-") else "sigmarone"
        yield f"https://raw.githubusercontent.com/google/fonts/{FONT_REVISIONS[family]}/ofl/{family}/{name}", "google-fonts-commit-before-2019-05-13"
        return
    rows = ARCHIVE.get("/" + path, [])
    # URLs whose compressed length is just an error page are less useful.
    best = sorted(rows, key=lambda row: (-int(row[3]), abs(int(row[0][:8]) - 20190517)))
    seen = set()
    for row in best[:4]:
        for scheme in ["http", "https"]:
            url = f"{scheme}://web.archive.org/web/{row[0]}id_/{row[1]}"
            if url not in seen:
                seen.add(url)
                yield url, "wayback-may-2019"
    # Models and the new weapons must be sourced from their recorded May captures.
    if path.endswith(".babylon") or path.startswith(("sound/m24/", "sound/smg/")):
        return
    yield "https://web.archive.org/web/20190517000000id_/https://shellshock.io/" + urllib.parse.quote(path, safe="/"), "wayback-nearest-2019-05-17"
    mapped = "server-client/src/client-imgs/" + path if path.startswith("img/") else "server-client/src/client-static/" + path
    if mapped in LEGACY_FILES:
        yield "https://raw.githubusercontent.com/onlypuppy7/LegacyShell/" + LEGACY_REVISION + "/" + urllib.parse.quote(mapped, safe="/"), "legacyshell-original-0.17-assets-fallback"


def recover(path: str):
    target = PUBLIC / path
    if target.exists() and valid(path, target.read_bytes()) and RECORDS.get(path, {}).get("bytes"):
        return path, "cached", target.stat().st_size
    errors = []
    for url, label in candidates(path):
        try:
            data, final_url = fetch(url)
            if not valid(path, data):
                errors.append(f"{url}: invalid asset body")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            record = {"source_url": url, "resolved_url": final_url, "source_kind": label, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            with LOCK:
                RECORDS[path] = record
                MANIFEST.write_text(json.dumps(RECORDS, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
            return path, label, len(data)
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    with LOCK:
        RECORDS[path] = {"status": "unrecovered", "errors": errors}
        MANIFEST.write_text(json.dumps(RECORDS, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    return path, "FAILED", 0


def run(paths):
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(recover, path) for path in sorted(set(paths))]
        for future in concurrent.futures.as_completed(futures):
            print(json.dumps(future.result()), flush=True)


def main():
    paths = {path.lstrip("/") for path in ARCHIVE if path.endswith(".babylon")}
    paths.update(re.findall(r"img/[a-zA-Z0-9_/. -]+\.(?:png|jpg|gif)", INDEX))
    paths.update(re.findall(r'["\'](sound/[^"\']+\.mp3)["\']', CLIENT))
    paths.update(f"sound/death/scream{i}.mp3" for i in range(1, 11))
    paths.update(["includes/stylesheet.css", "includes/game.css", "img/stamps.png", "img/grenadeIcon.png", "img/particles.png", "img/speechBubble01.png", "img/ico_padlock.png"])
    paths.update("fonts/" + name for name in ["Nunito-Regular.ttf", "Nunito-SemiBold.ttf", "Nunito-Bold.ttf", "Nunito-Black.ttf", "SigmarOne-Regular.ttf"])
    for skybox in set(re.findall(r'skybox:"([^"]+)"', CLIENT)):
        paths.update(f"img/skyboxes/{skybox}/skybox_{side}.jpg" for side in ["px", "py", "pz", "nx", "ny", "nz"])
    run(paths)
    # Follow texture names in recovered Babylon models rather than guessing them.
    textures = set()
    def scan(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key.endswith("Texture") and isinstance(value, dict) and isinstance(value.get("name"), str):
                    name = value["name"]
                    if name and not name.startswith(("data:", "http")):
                        textures.add("models/" + name.replace("\\", "/"))
                scan(value)
        elif isinstance(obj, list):
            for value in obj:
                scan(value)
    for model in (PUBLIC / "models").glob("*.babylon"):
        scan(json.loads(model.read_text(encoding="utf8")))
    run(textures)
    print(json.dumps({"recovered": sum(v.get("bytes", 0) > 0 for v in RECORDS.values()), "unrecovered": [k for k, v in RECORDS.items() if v.get("status") == "unrecovered"]}), flush=True)


if __name__ == "__main__":
    main()

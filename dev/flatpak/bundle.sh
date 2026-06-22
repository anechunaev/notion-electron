#!/bin/bash
# Build a single-file `.flatpak` bundle locally, the artifact the self-hosted
# repo server imports via `flatpak build-import-bundle`. For local testing only —
# CI builds the bundle straight from the committed manifest (see build.yml).
#
# Unlike the committed manifest (which pulls the app from a git tag so CI can
# build the exact tagged commit), this builds the WORKING TREE: it rewrites the
# `main` git source into a `dir` source. That needs no commit/push and keeps
# package-lock.json in sync with the generated-sources.json we regenerate below,
# which is what avoids the offline `npm install` failing with ENOTCACHED.
set -euo pipefail

cd "$(dirname "$0")"

ARCH="$(flatpak --default-arch)"
OUT="${1:-out/notion-electron-${ARCH}.flatpak}"
APP_ID="io.github.anechunaev.notion-electron"
MANIFEST="${APP_ID}.local.yaml"

flatpak-node-generator npm ../../package-lock.json

python3 - "${APP_ID}.yaml" "$MANIFEST" <<'PY'
import sys, yaml

src, dst = sys.argv[1], sys.argv[2]
skip = [".git", "node_modules", "dist", "out",
        "dev/flatpak/.flatpak-builder", "dev/flatpak/_repo",
        "dev/flatpak/build", "dev/flatpak/out"]

with open(src) as f:
    manifest = yaml.safe_load(f)

for module in manifest["modules"]:
    if not isinstance(module, dict):
        continue
    for i, source in enumerate(module.get("sources", [])):
        if isinstance(source, dict) and source.get("dest") == "main":
            module["sources"][i] = {"type": "dir", "path": "../..", "dest": "main", "skip": skip}

with open(dst, "w") as f:
    yaml.safe_dump(manifest, f, default_flow_style=False, sort_keys=False)
PY

flatpak-builder --user --install-deps-from=flathub --repo=_repo \
	--force-clean --disable-rofiles-fuse --arch="$ARCH" \
	build "$MANIFEST"

mkdir -p "$(dirname "$OUT")"
flatpak build-bundle --arch="$ARCH" _repo "$OUT" "$APP_ID"

echo "Built $OUT"

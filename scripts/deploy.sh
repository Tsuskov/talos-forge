#!/bin/sh
# Veröffentlicht web/ als gh-pages-Branch (GitHub Pages).
# Symlinks (die .gguf-Modelle) werden zu echten Dateien aufgelöst; die von
# wasm-pack generierte pkg/.gitignore ("*") bleibt draußen, sonst fehlte pkg/.
set -eu
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

rsync -aL --exclude .gitignore web/ "$tmp/"
touch "$tmp/.nojekyll" # kein Jekyll-Build, nur statische Dateien

git -C "$tmp" init -q -b gh-pages
git -C "$tmp" add -A
git -C "$tmp" commit -qm "deploy $(git rev-parse --short HEAD) $(date +%Y-%m-%d)"
git -C "$tmp" push -qf "$(git remote get-url origin)" gh-pages

echo "gh-pages aktualisiert: $(du -sh "$tmp" | cut -f1) veröffentlicht"

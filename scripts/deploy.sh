#!/bin/sh
# Veröffentlicht web/ als gh-pages-Branch (GitHub Pages) — inkrementell:
# der bestehende gh-pages-Stand wird flach geclont und nur das Delta gepusht.
# (Der frühere Force-Push einer frischen History schob jedes Mal ~212 MB
# Modelle+Index durchs Netz und scheiterte gern mit HTTP 408.)
# Symlinks (die .gguf-Modelle, der Index) werden zu echten Dateien aufgelöst;
# die von wasm-pack generierte pkg/.gitignore ("*") bleibt draußen.
set -eu
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

origin=$(git remote get-url origin)
if git ls-remote --exit-code --heads "$origin" gh-pages >/dev/null 2>&1; then
    git clone -q --depth 1 --branch gh-pages "$origin" "$tmp"
else
    git -C "$tmp" init -q -b gh-pages
    git -C "$tmp" remote add origin "$origin"
fi

rsync -aL --delete --exclude .git --exclude .gitignore web/ "$tmp/"
touch "$tmp/.nojekyll" # kein Jekyll-Build, nur statische Dateien

git -C "$tmp" add -A
if git -C "$tmp" diff --cached --quiet; then
    echo "gh-pages unverändert: nichts zu deployen"
    exit 0
fi
git -C "$tmp" commit -qm "deploy $(git rev-parse --short HEAD) $(date +%Y-%m-%d)"
git -C "$tmp" push -q origin gh-pages

echo "gh-pages aktualisiert: $(git -C "$tmp" show --stat --format= HEAD | tail -1)"

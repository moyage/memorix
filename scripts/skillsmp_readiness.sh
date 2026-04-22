#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(SKILL.md README.md README_zh.md LICENSE package.json)
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[ERROR] Missing required file: $f"
    exit 1
  fi
done

echo "[INFO] Checking SKILL frontmatter..."
if ! head -n 20 SKILL.md | rg -n '^---$|^name:|^description:' >/dev/null; then
  echo "[ERROR] SKILL.md frontmatter is missing required fields."
  exit 1
fi

echo "[INFO] Checking repository metadata..."
repo_url="$(node -e 'const p=require("./package.json");console.log((p.repository&&p.repository.url)||"")')"
if [[ -z "$repo_url" ]]; then
  echo "[ERROR] package.json repository.url is empty."
  exit 1
fi

echo "[INFO] Checking version and changelog consistency..."
version="$(node -e 'console.log(require("./package.json").version)')"
if ! rg -n "$version" CHANGELOG.md >/dev/null; then
  echo "[WARN] package version $version not found in CHANGELOG.md"
fi

echo "[INFO] Checking minimal quality signals..."
if ! rg -n 'context|memory|compaction|governance|openclaw' README.md >/dev/null; then
  echo "[WARN] README.md lacks core discovery keywords."
fi

echo "[INFO] SkillsMP indexing hint: ensure GitHub topics include 'claude-skills' or 'claude-code-skill'."
echo "[INFO] This topic check is manual (set in GitHub repo settings)."

echo "[OK] SkillsMP readiness checks completed."

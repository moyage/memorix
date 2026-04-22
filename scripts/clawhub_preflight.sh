#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

required_cmds=(node npm git rg)
missing=0

for cmd in "${required_cmds[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[ERROR] Missing required command: $cmd"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

if ! command -v clawhub >/dev/null 2>&1; then
  echo "[WARN] clawhub CLI not found. Publish step will fail unless CLAWHUB_CLI is configured."
fi

required_files=(SKILL.md README.md README_zh.md CHANGELOG.md package.json)
for f in "${required_files[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[ERROR] Missing required file: $f"
    exit 1
  fi
done

echo "[INFO] Running sensitive data checks..."
# Secret-like assignments/prefixes, while avoiding generic words like "token budget".
if rg -n -i --glob '!node_modules/**' --glob '!dist/**' --glob '!.git/**' \
  '(ghp_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|BEGIN[[:space:]]+RSA[[:space:]]+PRIVATE[[:space:]]+KEY|BEGIN[[:space:]]+OPENSSH[[:space:]]+PRIVATE[[:space:]]+KEY|(?:api[_-]?key|secret|password|token)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_\\-]{12,})' .; then
  echo "[ERROR] Potential secret detected. Please clean before publish."
  exit 1
fi

echo "[INFO] Preflight checks passed."

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

WORKSPACE_DIR="${1:-}"
DB_PATH="${MEMORIX_DB_PATH:-$ROOT_DIR/memorix.db}"

warn=0

echo "[INFO] Memorix upgrade preflight"
echo "[INFO] repo=$ROOT_DIR"
echo "[INFO] db=$DB_PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] node not found"
  exit 1
fi

node_major="$(node -e 'console.log(Number(process.versions.node.split(".")[0]))')"
if [[ "$node_major" -lt 18 ]]; then
  echo "[ERROR] Node.js >=18 required, current=$(node -v)"
  exit 1
fi

echo "[INFO] node=$(node -v)"

if [[ ! -f "$DB_PATH" ]]; then
  echo "[WARN] DB file not found at $DB_PATH (fresh install or custom path?)"
  warn=1
fi

required=(SKILL.md README.md README_zh.md CHANGELOG.md package.json src/server.js src/schema.js)
for f in "${required[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[ERROR] missing required file: $f"
    exit 1
  fi
done

if [[ -n "$WORKSPACE_DIR" ]]; then
  if [[ ! -d "$WORKSPACE_DIR" ]]; then
    echo "[ERROR] workspace dir not found: $WORKSPACE_DIR"
    exit 1
  fi
  if [[ -L "$WORKSPACE_DIR/skills/memorix" ]]; then
    echo "[WARN] $WORKSPACE_DIR/skills/memorix is symlink; OpenClaw may reject escape path"
    warn=1
  fi
fi

if ! rg -n 'MEMORIX_TOOL_PROFILE|MEMORIX_PREDICATE_WHITELIST_MODE' README.md >/dev/null; then
  echo "[WARN] expected runtime config docs not found in README.md"
  warn=1
fi

if [[ "$warn" -eq 0 ]]; then
  echo "[OK] Preflight passed"
else
  echo "[WARN] Preflight completed with warnings"
fi

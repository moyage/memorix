#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ROOT="${MEMORIX_BACKUP_DIR:-$ROOT_DIR/.memorix-upgrade/backups}"
DB_PATH="${MEMORIX_DB_PATH:-$ROOT_DIR/memorix.db}"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$TS"
mkdir -p "$DEST"

manifest="$DEST/manifest.txt"

if [[ -f "$DB_PATH" ]]; then
  cp "$DB_PATH" "$DEST/memorix.db"
  echo "db=$DB_PATH" >> "$manifest"
else
  echo "db_missing=$DB_PATH" >> "$manifest"
fi

for f in package.json README.md README_zh.md SKILL.md CHANGELOG.md; do
  if [[ -f "$f" ]]; then
    cp "$f" "$DEST/$f"
  fi
done

echo "timestamp=$TS" >> "$manifest"
echo "repo=$ROOT_DIR" >> "$manifest"

echo "[OK] Backup created: $DEST"

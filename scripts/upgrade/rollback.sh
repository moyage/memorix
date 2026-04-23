#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ROOT="${MEMORIX_BACKUP_DIR:-$ROOT_DIR/.memorix-upgrade/backups}"
DB_PATH="${MEMORIX_DB_PATH:-$ROOT_DIR/memorix.db}"
TARGET="${1:-latest}"   # latest or timestamp dir name

if [[ ! -d "$BACKUP_ROOT" ]]; then
  echo "[ERROR] backup root not found: $BACKUP_ROOT"
  exit 1
fi

if [[ "$TARGET" == "latest" ]]; then
  TARGET_DIR="$(ls -1 "$BACKUP_ROOT" | sort | tail -n 1)"
  if [[ -z "$TARGET_DIR" ]]; then
    echo "[ERROR] no backups found"
    exit 1
  fi
  TARGET="$TARGET_DIR"
fi

SRC="$BACKUP_ROOT/$TARGET"
if [[ ! -d "$SRC" ]]; then
  echo "[ERROR] backup not found: $SRC"
  exit 1
fi

if [[ -f "$SRC/memorix.db" ]]; then
  cp "$SRC/memorix.db" "$DB_PATH"
  echo "[INFO] restored db -> $DB_PATH"
else
  echo "[WARN] no memorix.db in backup"
fi

for f in package.json README.md README_zh.md SKILL.md CHANGELOG.md; do
  if [[ -f "$SRC/$f" ]]; then
    cp "$SRC/$f" "$ROOT_DIR/$f"
    echo "[INFO] restored $f"
  fi
done

echo "[OK] Rollback completed from backup: $SRC"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_DIR="${1:-}"
SKILL_NAME="${2:-memorix}"
MATERIALIZED_SRC="${3:-}"

if [[ -z "$WORKSPACE_DIR" ]]; then
  echo "Usage: $0 <openclaw-workspace-path> [skill-name]"
  exit 1
fi

if [[ ! -d "$WORKSPACE_DIR" ]]; then
  echo "[ERROR] Workspace path does not exist: $WORKSPACE_DIR"
  exit 1
fi

TARGET_DIR="$WORKSPACE_DIR/skills/$SKILL_NAME"
mkdir -p "$TARGET_DIR"

if [[ -n "$MATERIALIZED_SRC" ]]; then
  PACKAGE_DIR="$MATERIALIZED_SRC"
else
  TMP_BASE="${ROOT_DIR}/.release/openclaw-install"
  PACKAGE_DIR="${TMP_BASE}/${SKILL_NAME}"
  mkdir -p "$TMP_BASE"
  echo "[INFO] Materializing minimal skill package to: $PACKAGE_DIR"
  bash "$ROOT_DIR/scripts/openclaw_materialize_skill_package.sh" "$PACKAGE_DIR"
fi

if [[ ! -d "$PACKAGE_DIR" ]]; then
  echo "[ERROR] Materialized package not found: $PACKAGE_DIR"
  exit 1
fi

echo "[INFO] Installing materialized skill package by COPY (no symlink): $TARGET_DIR"
rsync -a --delete "$PACKAGE_DIR/" "$TARGET_DIR/"

echo "[OK] Skill package installed to workspace root-safe path."
echo "[NEXT] If OpenClaw mcp.servers is protected, paste config snippet manually:"
echo "       npm run openclaw:mcp-snippet -- \"$WORKSPACE_DIR\" \"$SKILL_NAME\""

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_DIR="${1:-}"
SKILL_NAME="${2:-memorix}"

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

echo "[INFO] Installing skill by COPY (no symlink): $TARGET_DIR"

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'memorix.db' \
  --exclude '*.tgz' \
  --exclude '.DS_Store' \
  --exclude 'dist/*.map' \
  "$ROOT_DIR/" "$TARGET_DIR/"

echo "[OK] Skill copied to workspace root-safe path."
echo "[NEXT] If OpenClaw mcp.servers is protected, paste config snippet manually:"
echo "       npm run openclaw:mcp-snippet"

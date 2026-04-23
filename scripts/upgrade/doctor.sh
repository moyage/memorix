#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-check}"          # check | fix
WORKSPACE_DIR="${2:-}"
TARGET_NAME="${3:-memorix}"

if [[ "$MODE" != "check" && "$MODE" != "fix" ]]; then
  echo "Usage: $0 [check|fix] [openclaw-workspace-path] [skill-name]"
  exit 1
fi

echo "[INFO] Upgrade doctor mode=$MODE"

bash ./scripts/upgrade/preflight.sh "$WORKSPACE_DIR"

echo "[INFO] Recommended MCP snippet (manual paste for protected mcp.servers):"
if [[ -n "$WORKSPACE_DIR" ]]; then
  bash ./scripts/openclaw_emit_mcp_snippet.sh "$WORKSPACE_DIR" "$TARGET_NAME"
else
  bash ./scripts/openclaw_emit_mcp_snippet.sh
fi

echo "[INFO] Recommended allowlists:"
bash ./scripts/openclaw_emit_allowlists.sh

if [[ "$MODE" == "fix" ]]; then
  if [[ -z "$WORKSPACE_DIR" ]]; then
    echo "[ERROR] fix mode requires workspace path"
    exit 1
  fi
  echo "[INFO] Applying safe fixes: copy install into workspace/skills"
  bash ./scripts/openclaw_install_workspace_skill.sh "$WORKSPACE_DIR" "$TARGET_NAME"
  echo "[OK] Doctor fix completed (manual mcp.servers paste still required if path is protected)"
else
  echo "[OK] Doctor check completed"
fi

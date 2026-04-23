#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${1:-}"
SKILL_NAME="${2:-memorix}"
DB_PATH_OVERRIDE="${3:-}"

if [[ -z "$WORKSPACE_DIR" ]]; then
  echo "Usage: $0 <openclaw-workspace-path> [skill-name] [db-path-override]"
  exit 1
fi

SERVER_PATH="$WORKSPACE_DIR/skills/$SKILL_NAME/dist/server.js"
DB_PATH="${DB_PATH_OVERRIDE:-$WORKSPACE_DIR/skills/$SKILL_NAME/memorix.db}"

if [[ ! -f "$SERVER_PATH" ]]; then
  echo "[ERROR] Server entry not found: $SERVER_PATH"
  echo "[HINT] Run: npm run openclaw:install -- \"$WORKSPACE_DIR\" \"$SKILL_NAME\""
  exit 1
fi

VALUE_JSON="$(cat <<JSON
{"command":"node","args":["$SERVER_PATH"],"env":{"MEMORIX_DB_PATH":"$DB_PATH","MEMORIX_TOOL_PROFILE":"auto"}}
JSON
)"

echo "[INFO] Setting MCP server via OpenClaw CLI: $SKILL_NAME"
openclaw mcp set "$SKILL_NAME" "$VALUE_JSON"

echo "[OK] MCP server configured: $SKILL_NAME"
openclaw mcp show "$SKILL_NAME" || true

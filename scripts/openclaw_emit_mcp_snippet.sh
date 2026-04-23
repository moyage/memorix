#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${1:-<workspace-path>}"
SKILL_NAME="${2:-memorix}"
DB_PATH_OVERRIDE="${3:-}"

SERVER_PATH="${WORKSPACE_DIR}/skills/${SKILL_NAME}/dist/server.js"
DB_PATH="${DB_PATH_OVERRIDE:-${WORKSPACE_DIR}/skills/${SKILL_NAME}/memorix.db}"

cat <<JSON
{
  "mcp.servers.${SKILL_NAME}": {
    "command": "node",
    "args": ["${SERVER_PATH}"],
    "env": {
      "MEMORIX_DB_PATH": "${DB_PATH}",
      "MEMORIX_TOOL_PROFILE": "auto"
    }
  }
}
JSON

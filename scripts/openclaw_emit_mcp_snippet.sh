#!/usr/bin/env bash
set -euo pipefail

SERVER_PATH="${1:-/Users/mlabs/Programs/memorix/dist/server.js}"
DB_PATH="${2:-/Users/mlabs/Programs/memorix/memorix.db}"

cat <<JSON
{
  "mcp.servers.memorix": {
    "command": "node",
    "args": ["${SERVER_PATH}"],
    "env": {
      "MEMORIX_DB_PATH": "${DB_PATH}",
      "MEMORIX_TOOL_PROFILE": "auto"
    }
  }
}
JSON

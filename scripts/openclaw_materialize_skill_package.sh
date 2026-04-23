#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/.release/openclaw-skill/memorix}"

mkdir -p "$OUT_DIR"

# Build first so runtime entrypoint exists.
node "$ROOT_DIR/build.js" >/dev/null

# Materialize a minimal OpenClaw skill folder (entity in-root, no symlink).
cp "$ROOT_DIR/SKILL.md" "$OUT_DIR/SKILL.md"
cp "$ROOT_DIR/README.md" "$OUT_DIR/README.md"
cp "$ROOT_DIR/README_zh.md" "$OUT_DIR/README_zh.md"
cp "$ROOT_DIR/CHANGELOG.md" "$OUT_DIR/CHANGELOG.md"
cp "$ROOT_DIR/LICENSE" "$OUT_DIR/LICENSE"
mkdir -p "$OUT_DIR/dist"
cp "$ROOT_DIR/dist/server.js" "$OUT_DIR/dist/server.js"

cat > "$OUT_DIR/package.json" <<JSON
{
  "name": "memorix-skill",
  "version": "$(node -e 'console.log(require("'"$ROOT_DIR"'/package.json").version)')",
  "private": true,
  "description": "OpenClaw-ready Memorix skill package (materialized copy)",
  "openclaw": {
    "skillName": "memorix",
    "runtime": "mcp-server",
    "entry": "dist/server.js"
  }
}
JSON

cat > "$OUT_DIR/openclaw.mcp.example.json" <<JSON
{
  "mcp.servers.memorix": {
    "command": "node",
    "args": ["$OUT_DIR/dist/server.js"],
    "env": {
      "MEMORIX_DB_PATH": "$OUT_DIR/memorix.db",
      "MEMORIX_TOOL_PROFILE": "auto"
    }
  }
}
JSON

echo "[OK] OpenClaw skill package materialized: $OUT_DIR"
echo "[NOTE] This prepares a standard skill entity directory, but does NOT bypass protected mcp.servers policy."
echo "[NEXT] Copy this folder into <workspace>/skills/memorix (实体目录，非 symlink)"

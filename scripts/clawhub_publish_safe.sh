#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SKILL_PATH="${SKILL_PATH:-.}"
CLAWHUB_CLI="${CLAWHUB_CLI:-clawhub}"
SLUG="${CLAWHUB_SLUG:-memorix}"
NAME="${CLAWHUB_NAME:-Memorix}"
VERSION="${CLAWHUB_VERSION:-}"
CHANGELOG="${CLAWHUB_CHANGELOG:-Production release}"
TAGS_CSV="${CLAWHUB_TAGS:-memory,context-compaction,openclaw,mcp,long-session,sqlite,fts5,governance}"
DRY_RUN="${CLAWHUB_DRY_RUN:-0}"

if [[ -z "$VERSION" ]]; then
  VERSION="$(node -e 'console.log(require("./package.json").version)')"
fi

bash ./scripts/clawhub_preflight.sh
bash ./scripts/clawhub_run_security_cases.sh

if ! command -v "$CLAWHUB_CLI" >/dev/null 2>&1; then
  echo "[ERROR] Cannot find ClawHub CLI: $CLAWHUB_CLI"
  exit 1
fi

declare -a CMD
CMD=("$CLAWHUB_CLI" publish "$SKILL_PATH" --slug "$SLUG" --name "$NAME" --version "$VERSION" --changelog "$CHANGELOG" --tags "$TAGS_CSV")

echo "[INFO] Publish command prepared: ${CMD[*]}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[INFO] Dry run enabled. Skip publish."
  exit 0
fi

echo "[INFO] Checking login state..."
"$CLAWHUB_CLI" whoami

"${CMD[@]}"

echo "[INFO] Verifying remote skill page..."
"$CLAWHUB_CLI" inspect "$SLUG"

echo "[OK] Publish completed: https://clawhub.ai/skills/$SLUG"

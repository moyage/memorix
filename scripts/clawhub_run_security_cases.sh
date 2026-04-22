#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[SEC] Case A1/A2: secret-like assignments in publish payload"
if rg -n -i \
  --glob 'SKILL.md' \
  --glob 'README*.md' \
  --glob 'src/**' \
  --glob 'scripts/**' \
  --glob 'package.json' \
  '(ghp_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|BEGIN[[:space:]]+RSA[[:space:]]+PRIVATE[[:space:]]+KEY|BEGIN[[:space:]]+OPENSSH[[:space:]]+PRIVATE[[:space:]]+KEY|(?:api[_-]?key|secret|password|token)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9_\\-]{12,})' .; then
  echo "[FAIL] Sensitive secret pattern found."
  exit 1
fi

echo "[SEC] Case A2: local absolute path leakage in runtime files"
if rg -n \
  --glob 'src/**' \
  --glob 'scripts/**' \
  --glob '!scripts/clawhub_run_security_cases.sh' \
  --glob 'SKILL.md' \
  --glob 'README*.md' \
  '(/Users/|/home/|C:\\\\Users\\\\)' .; then
  echo "[FAIL] Local absolute path found in runtime-facing files."
  exit 1
fi

echo "[SEC] Case B1: block remote pipe execution"
if rg -n --glob 'scripts/**' --glob '!scripts/clawhub_run_security_cases.sh' '(curl[^\n]*\|[^\n]*bash|wget[^\n]*\|[^\n]*sh)' .; then
  echo "[FAIL] Dangerous remote pipe execution pattern found."
  exit 1
fi

echo "[SEC] Case B2: block risky destructive patterns"
if rg -n --glob 'scripts/**' --glob '!scripts/clawhub_run_security_cases.sh' '(rm[[:space:]]+-rf[[:space:]]+/|sudo[[:space:]])' .; then
  echo "[FAIL] Destructive or elevated command pattern found in scripts."
  exit 1
fi

echo "[SEC] Case C1/C2: build/test and version existence"
node -e 'const p=require("./package.json"); if(!p.version){process.exit(1)}; console.log("version="+p.version)'
npm run build >/dev/null
npm run test >/dev/null

echo "[PASS] Security cases completed successfully."

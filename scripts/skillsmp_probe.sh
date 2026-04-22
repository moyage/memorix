#!/usr/bin/env bash
set -euo pipefail

QUERY="${1:-memorix}"
OWNER_REPO="${2:-moyage/memorix}"
API_URL="https://skillsmp.com/api/v1/skills/search?q=${QUERY}&page=1&limit=20"

echo "[INFO] Querying SkillsMP API: $API_URL"
json="$(curl -fsSL "$API_URL")"

if command -v jq >/dev/null 2>&1; then
  echo "$json" | jq '{json_type: type, success, total: .data.pagination.total, page: .data.pagination.page, limit: .data.pagination.limit}'
  if echo "$json" | jq -e --arg repo "$OWNER_REPO" '
    (.data.skills // [])[]?
    | select(
        ((.repo // "") == $repo)
        or ((.repo_url // "") | contains($repo))
        or ((.githubUrl // "") | contains($repo))
        or ((.repository // "") | contains($repo))
      )
  ' >/dev/null; then
    echo "[OK] Found candidate listing for $OWNER_REPO"
  else
    echo "[WARN] No listing found for $OWNER_REPO in first page results"
    echo "$json" | jq -r '(.data.skills // [])[:5][] | "- " + (.author // "?") + " | " + (.name // "?") + " | " + (.githubUrl // .repository // "")'
  fi
else
  node -e '
const data=JSON.parse(process.argv[1]);
const repo=process.argv[2];
const skills=Array.isArray(data?.data?.skills)?data.data.skills:[];
const found=skills.some(s=>
  String(s.repo||"").includes(repo) ||
  String(s.repo_url||"").includes(repo) ||
  String(s.githubUrl||"").includes(repo) ||
  String(s.repository||"").includes(repo)
);
console.log(JSON.stringify({
  success:data.success,
  total:data?.data?.pagination?.total ?? null,
  page:data?.data?.pagination?.page ?? null,
  limit:data?.data?.pagination?.limit ?? null,
  found
},null,2));
if(!found) process.exitCode=2;
' "$json" "$OWNER_REPO" || true
  echo "[INFO] Install jq for richer output if needed."
fi

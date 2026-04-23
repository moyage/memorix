#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRY_PATH="${MEMORIX_FLEET_REGISTRY:-$ROOT_DIR/.memorix-fleet/agents.json}"

usage() {
  cat <<USAGE
Usage:
  $0 add <agent_id> <workspace_path> [role]
  $0 remove <agent_id>
  $0 list
  $0 reconcile

Env:
  MEMORIX_FLEET_REGISTRY   Override registry path (default: $REGISTRY_PATH)

Notes:
  - add: installs memorix skill package into workspace, configures MCP server, stores registry entry
  - remove: removes registry entry and tries 'openclaw mcp unset <server_name>'
  - reconcile: reapplies install + mcp set for all registered agents
USAGE
}

ensure_registry() {
  local dir
  dir="$(dirname "$REGISTRY_PATH")"
  mkdir -p "$dir"
  if [[ ! -f "$REGISTRY_PATH" ]]; then
    echo '[]' > "$REGISTRY_PATH"
  fi
}

registry_upsert() {
  local agent_id="$1"
  local workspace_path="$2"
  local role="$3"
  local server_name="$4"
  local db_path="$5"

  ensure_registry
  node -e '
const fs=require("fs");
const p=process.argv[1];
const id=process.argv[2];
const ws=process.argv[3];
const role=process.argv[4];
const server=process.argv[5];
const db=process.argv[6];
const now=new Date().toISOString();
let arr=[];
try{arr=JSON.parse(fs.readFileSync(p,"utf8")); if(!Array.isArray(arr)) arr=[];}catch{arr=[];}
const next=arr.filter(x=>x.agent_id!==id);
next.push({agent_id:id,workspace_path:ws,role,server_name:server,db_path:db,updated_at:now});
next.sort((a,b)=>String(a.agent_id).localeCompare(String(b.agent_id)));
fs.writeFileSync(p, JSON.stringify(next,null,2));
' "$REGISTRY_PATH" "$agent_id" "$workspace_path" "$role" "$server_name" "$db_path"
}

registry_remove() {
  local agent_id="$1"
  ensure_registry
  node -e '
const fs=require("fs");
const p=process.argv[1];
const id=process.argv[2];
let arr=[];
try{arr=JSON.parse(fs.readFileSync(p,"utf8")); if(!Array.isArray(arr)) arr=[];}catch{arr=[];}
arr=arr.filter(x=>x.agent_id!==id);
fs.writeFileSync(p, JSON.stringify(arr,null,2));
' "$REGISTRY_PATH" "$agent_id"
}

registry_get_field() {
  local agent_id="$1"
  local field="$2"
  ensure_registry
  node -e '
const fs=require("fs");
const p=process.argv[1];
const id=process.argv[2];
const f=process.argv[3];
let arr=[];
try{arr=JSON.parse(fs.readFileSync(p,"utf8")); if(!Array.isArray(arr)) arr=[];}catch{arr=[];}
const item=arr.find(x=>x.agent_id===id);
if(!item || item[f]===undefined || item[f]===null){process.exit(2);} 
process.stdout.write(String(item[f]));
' "$REGISTRY_PATH" "$agent_id" "$field"
}

cmd_add() {
  local agent_id="${1:-}"
  local workspace_path="${2:-}"
  local role="${3:-omoc}"
  if [[ -z "$agent_id" || -z "$workspace_path" ]]; then
    usage
    exit 1
  fi

  local skill_name="memorix"
  local server_name="memorix-${agent_id}"
  local db_path="$workspace_path/skills/$skill_name/memorix-${agent_id}.db"

  echo "[INFO] add agent_id=$agent_id role=$role workspace=$workspace_path"
  bash "$ROOT_DIR/scripts/openclaw_install_workspace_skill.sh" "$workspace_path" "$skill_name"
  bash "$ROOT_DIR/scripts/openclaw_mcp_set_server.sh" "$workspace_path" "$skill_name" "$db_path" "$server_name"

  registry_upsert "$agent_id" "$workspace_path" "$role" "$server_name" "$db_path"
  echo "[OK] fleet add completed"
  echo "[INFO] Suggested allowlist role=$role (copy from output below)"
  bash "$ROOT_DIR/scripts/openclaw_emit_allowlists.sh"
}

cmd_remove() {
  local agent_id="${1:-}"
  if [[ -z "$agent_id" ]]; then
    usage
    exit 1
  fi

  local server_name
  if server_name="$(registry_get_field "$agent_id" "server_name" 2>/dev/null)"; then
    echo "[INFO] unsetting mcp server: $server_name"
    openclaw mcp unset "$server_name" || echo "[WARN] failed to unset mcp server (check permissions/protected config)"
  else
    echo "[WARN] agent not found in registry: $agent_id"
  fi

  registry_remove "$agent_id"
  echo "[OK] removed agent from registry: $agent_id"
}

cmd_list() {
  ensure_registry
  echo "[INFO] registry: $REGISTRY_PATH"
  node -e '
const fs=require("fs");
const p=process.argv[1];
let arr=[];
try{arr=JSON.parse(fs.readFileSync(p,"utf8")); if(!Array.isArray(arr)) arr=[];}catch{arr=[];}
if(arr.length===0){console.log("(empty)"); process.exit(0);} 
for(const x of arr){
  console.log(`${x.agent_id}\t${x.role}\t${x.server_name}\t${x.workspace_path}`);
}
' "$REGISTRY_PATH"
}

cmd_reconcile() {
  ensure_registry
  local count
  count="$(node -e 'const fs=require("fs");const p=process.argv[1];let a=[];try{a=JSON.parse(fs.readFileSync(p,"utf8")); if(!Array.isArray(a)) a=[];}catch{a=[];}process.stdout.write(String(a.length));' "$REGISTRY_PATH")"
  if [[ "$count" == "0" ]]; then
    echo "[INFO] no agents in registry"
    exit 0
  fi

  node -e '
const fs=require("fs");
const p=process.argv[1];
let arr=[];
try{arr=JSON.parse(fs.readFileSync(p,"utf8")); if(!Array.isArray(arr)) arr=[];}catch{arr=[];}
for(const x of arr){
  const fields=[x.agent_id,x.workspace_path,x.role,x.server_name,x.db_path];
  console.log(fields.join("\t"));
}
' "$REGISTRY_PATH" | while IFS=$'\t' read -r agent_id workspace_path role server_name db_path; do
    echo "[INFO] reconcile agent_id=$agent_id"
    bash "$ROOT_DIR/scripts/openclaw_install_workspace_skill.sh" "$workspace_path" memorix
    bash "$ROOT_DIR/scripts/openclaw_mcp_set_server.sh" "$workspace_path" memorix "$db_path" "$server_name"
    registry_upsert "$agent_id" "$workspace_path" "$role" "$server_name" "$db_path"
  done

  echo "[OK] fleet reconcile completed"
}

cmd="${1:-}"
case "$cmd" in
  add)
    shift
    cmd_add "$@"
    ;;
  remove)
    shift
    cmd_remove "$@"
    ;;
  list)
    cmd_list
    ;;
  reconcile)
    cmd_reconcile
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "[ERROR] unknown command: $cmd"
    usage
    exit 1
    ;;
esac

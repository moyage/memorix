#!/usr/bin/env bash
set -euo pipefail

cat <<'JSON'
{
  "omoc_allow_tools": [
    "memorix_store_fact",
    "memorix_store_facts",
    "memorix_search_fts",
    "memorix_invalidate_fact",
    "memorix_query_history",
    "memorix_trace_relations",
    "memorix_auto_memorize",
    "memorix_get_context_pack",
    "memorix_import_markdown",
    "memorix_export_markdown",
    "memorix_get_predicate_policies"
  ],
  "hermes_allow_tools": [
    "memorix_search_fts",
    "memorix_query_history",
    "memorix_trace_relations",
    "memorix_get_context_pack",
    "memorix_export_markdown",
    "memorix_get_predicate_policies",
    "memorix_set_predicate_policy",
    "memorix_detect_contradictions",
    "memorix_resolve_contradiction",
    "memorix_rollback_resolution",
    "memorix_rank_promotion_candidates",
    "memorix_get_health_report",
    "memorix_run_maintenance_sweep",
    "memorix_recommend_compaction",
    "memorix_compact_context_now",
    "memorix_autotune_compaction_params",
    "memorix_run_governance_cycle",
    "memorix_get_governance_run",
    "memorix_check_consistency"
  ]
}
JSON

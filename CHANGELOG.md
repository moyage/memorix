# Changelog

## 2.1.0 - 2026-04-21

### Added
- `memorix_get_context_pack` for compact, reinjectable high-signal memory context.
- `memorix_import_markdown` and `memorix_export_markdown` for OpenClaw markdown memory interop.
- Predicate policy registry:
  - `memorix_get_predicate_policies`
  - `memorix_set_predicate_policy`
- Contradiction operations:
  - `memorix_detect_contradictions`
  - `memorix_resolve_contradiction`
- Deterministic promotion candidate ranking:
  - `memorix_rank_promotion_candidates`
- Operations and maintenance tools:
  - `memorix_get_health_report`
  - `memorix_run_maintenance_sweep`
  - `memorix_recommend_compaction`
  - `memorix_compact_context_now`
  - `memorix_autotune_compaction_params`
  - `memorix_run_governance_cycle`
  - `memorix_rollback_resolution`
  - `memorix_check_consistency`
  - `memorix_get_governance_run`
- Context pack enhancements:
  - token-budget-aware trimming
  - incremental compaction via `since_valid_from`
  - cursor-based deterministic pagination via `cursor`
  - contradiction-priority ranking option
  - tokenizer upgrade: prefer `js-tiktoken` when available, fallback to heuristic estimate
- Quality scoring (`quality_score`) on retrieval outputs.
- Migration v2: `predicate_policies` table for durable policy overrides.
- Migration v3: `compaction_events` table for compaction telemetry and auto-tuning.
- Migration v4: `contradiction_resolutions` table for rollbackable resolution history.
- Migration v5: `governance_runs` table for idempotent governance execution and recovery.

### Improved
- Write path now supports stronger anti-drift behavior:
  - deduplication of active exact facts
  - optional replacement policy (`replace_existing`)
  - default single-value predicate replacement support
- CLI viewer options aligned with README (`--format`, `--stats`, `--tree` alias).
- Expanded tests for query building, context pack behavior, predicate policies, contradiction detection, and promotion scoring.

### Fixed
- FTS query parameter ordering issue when `context_tags` are present.
- UUID generation replaced with `crypto.randomUUID()`.
- Input validation hardened to reject blank strings and normalize limits.

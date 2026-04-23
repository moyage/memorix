---
name: memorix
description: Use when long-running agent sessions risk context explosion, memory drift, or unreliable recall, and durable searchable memory with automatic compaction/governance is needed.
version: 2.1.0
metadata:
  openclaw:
    requires:
      env:
        - MEMORIX_DB_PATH
      bins:
        - node
    homepage: https://github.com/moyage/memorix
---

# Memorix Skill Specification

## Overview

**Memorix** is a standard memory skill for AI agent systems. It provides persistent, searchable, time-aware memory storage through temporal triples (Subject-Predicate-Object) with full-text search capabilities.

This document defines the complete integration interface for AI agents consuming the Memorix skill.

---

## When to Use This Skill

**USE Memorix when:**
- You need to remember facts across multiple conversation turns
- You want to store user preferences, environment details, or project context
- You need to search historical information quickly
- You want to track how facts change over time
- You need to extract structured data from unstructured text

**DO NOT USE when:**
- You need real-time collaborative memory (use a shared database instead)
- You need complex graph analytics beyond 3-hop traversal
- You need to store binary data or large files

---

## Activation

### Trigger Conditions

This skill should be automatically activated when:
1. The user mentions needing to "remember" something for later
2. You detect important facts worth persisting (preferences, decisions, context)
3. You're asked to recall previously discussed information
4. You need to store outcomes from a sub-task or tool execution

### Skill Discovery

Memorix exposes itself as an MCP (Model Context Protocol) server. Available tools are discovered via:

```json
// Request
tools/list

// Response includes 24 memory tools
```

---

## Tool Reference

### 1. `memorix_store_fact`

Store a single temporal triple into memory.

**Input Schema:**
```json
{
  "subject": "string (required) - Entity being described",
  "predicate": "string (required) - Relationship or action",
  "object": "string (required) - Target or value",
  "context_tags": "string (optional) - Comma-separated tags for filtering",
  "source": "string (optional) - Origin or context path",
  "replace_existing": "boolean (optional) - Invalidate active facts with same subject+predicate before insert"
}
```

**Few-Shot Examples:**
- ✅ Good: `(Apple, launch_plan, iPhone 16)` — specific, actionable
- ❌ Bad: `(Apple, plans to release, a phone)` — vague, non-specific
- ✅ Good: `(User, prefers, dark_mode)` — clear preference
- ❌ Bad: `(User, likes, things)` — ambiguous object

**Output:**
```json
{
  "success": true,
  "id": "uuid-of-stored-fact",
  "inserted": true,
  "deduplicated": false,
  "invalidated": 0
}
```

---

### 2. `memorix_store_facts`

Batch store multiple temporal triples in a single transaction.

**Input Schema:**
```json
{
  "facts": [
    {
      "subject": "string (required)",
      "predicate": "string (required)",
      "object": "string (required)",
      "context_tags": "string (optional)",
      "source": "string (optional)",
      "replace_existing": "boolean (optional)"
    }
  ],
  "replace_existing": "boolean (optional) - default policy for all facts in this batch"
}
```

**Output:**
```json
{
  "success": true,
  "count": 42,
  "inserted": 40,
  "deduplicated": 2,
  "invalidated": 5
}
```

---

### 3. `memorix_search_fts`

Search memory using FTS5 full-text search.

**Input Schema:**
```json
{
  "query": "string (required) - Search string (supports FTS5 syntax with * for prefix)",
  "context_tags": "string (optional) - Filter by tags (comma-separated)",
  "limit": "integer (optional, default: 10) - Max results"
}
```

**FTS5 Query Syntax:**
- `"exact phrase"` - Match exact phrase
- `prefix*` - Prefix matching (e.g., `dark*` matches "dark_mode")
- `term1 term2` - Matches containing both terms
- `term1 OR term2` - Matches containing either term

**Few-Shot Examples:**
- Query: `"iPhone"` → Matches `(Apple, launch_plan, iPhone 16)`
- Query: `"dark*"` → Matches `(User, prefers, dark_mode)` via stemming
- Query: `"Apple"` + context_tags="product" → Filtered results

**Output:**
```json
[
  {
    "id": "uuid",
    "subject": "Apple",
    "predicate": "launch_plan",
    "object": "iPhone 16",
    "context_tags": "product,mobile",
    "source": "meeting_notes.md",
    "valid_from": "2026-01-15T10:30:00Z",
    "quality_score": 0.87
  }
]
```

---

### 4. `memorix_invalidate_fact`

Mark a fact as no longer valid without deleting history.

**Input Schema:**
```json
{
  "id": "string (required) - UUID of the fact to invalidate"
}
```

**Behavior:** Sets `valid_to` to current timestamp. The fact remains in history but won't appear in current-state searches.

**Output:**
```json
{
  "success": true,
  "invalidated": true
}
```

---

### 5. `memorix_query_history`

Query past state of the knowledge graph at a specific point in time.

**Input Schema:**
```json
{
  "valid_to": "string (required) - ISO timestamp to query",
  "subject": "string (optional) - Filter by subject",
  "limit": "integer (optional, default: 50) - Max results"
}
```

**Use Cases:**
- Reconstructing state at a past timestamp
- Audit trails
- Rollback analysis

**Output:** Array of facts that were active at the specified time.

---

### 6. `memorix_trace_relations`

Graph traversal using Recursive CTEs up to 3 hops.

**Input Schema:**
```json
{
  "start_subject": "string (required) - Starting entity",
  "predicate_filter": "string (optional) - Only follow specific predicates",
  "max_hops": "integer (optional, default: 3, max: 3) - Traversal depth",
  "limit": "integer (optional, default: 100) - Max results"
}
```

**Example:**
- Facts: `(A, knows, B)`, `(B, knows, C)`, `(C, works_at, D)`
- Input: `start_subject="A"`, `max_hops=3`
- Output: `[(A, knows, B), (B, knows, C), (C, works_at, D)]`

**Output:**
```json
[
  {
    "subject": "A",
    "predicate": "knows",
    "object": "B",
    "hop": 1
  }
]
```

---

### 7. `memorix_auto_memorize`

Automatically extract subject-predicate-object triples from long text.

**Input Schema:**
```json
{
  "text": "string (required) - Unstructured text to analyze",
  "context_tags": "string (optional) - Tags for all extracted facts",
  "source": "string (optional) - Origin of the text",
  "replace_existing": "boolean (optional) - Invalidate active facts with same subject+predicate before insert"
}
```

**Extraction Patterns:**
- "X is/was Y" → `(X, is, Y)`
- "X has Y" → `(X, has, Y)`
- "X prefers/likes Y" → `(X, prefers, Y)`
- "X uses Y" → `(X, uses, Y)`
- "X works at Y" → `(X, works_at, Y)`
- "X wants Y" → `(X, wants, Y)`
- "X knows Y" → `(X, knows, Y)`
- "X lives in Y" → `(X, lives_in, Y)`

**Example:**
- Input: `"Alice is a software engineer. She prefers dark mode. She uses VS Code."`
- Extracted: `[(Alice, is, software engineer), (Alice, prefers, dark mode), (Alice, uses, VS Code)]`

**Output:**
```json
{
  "success": true,
  "extracted": 3,
  "stored": 3,
  "deduplicated": 0,
  "invalidated": 0,
  "triples": [
    {"subject": "Alice", "predicate": "is", "object": "software engineer"}
  ]
}
```

---

### 8. `memorix_get_context_pack`

Build a compact memory context pack for reinjection into constrained context windows.

**Input Schema:**
```json
{
  "query": "string (optional) - FTS query for scoped retrieval",
  "subject": "string (optional) - Restrict to a single subject",
  "context_tags": "string (optional) - Tag filter",
  "limit": "integer (optional, default: 20) - Retrieved rows before compaction",
  "per_subject_limit": "integer (optional, default: 4) - Max facts per subject in compact output",
  "token_budget": "integer (optional) - Approximate output token budget",
  "since_valid_from": "string (optional) - Incremental lower bound timestamp",
  "cursor": "object|string (optional) - deterministic pagination cursor from previous response",
  "prioritize_contradictions": "boolean (optional) - Boost contradiction groups in ranking"
}
```

**Output:**
```json
{
  "success": true,
  "input_count": 12,
  "grouped_subjects": 4,
  "lines": 4,
  "text": "- Alice: prefers=dark mode; uses=VS Code\n- ProjectX: status=in_progress",
  "trimmed": false,
  "facts": [
    {"subject":"Alice","predicate":"prefers","object":"dark mode","quality_score":0.91}
  ]
}
```

---

### 9. `memorix_import_markdown`

Import OpenClaw-style markdown memory content into Memorix.

**Input Schema:**
```json
{
  "text": "string (optional) - Raw markdown content",
  "source_path": "string (optional) - Local markdown file path",
  "context_tags": "string (optional) - Tags for imported facts",
  "source": "string (optional) - Source override",
  "replace_existing": "boolean (optional) - Replacement policy for mutable predicates"
}
```

**Output:**
```json
{
  "success": true,
  "imported": 24,
  "inserted": 20,
  "deduplicated": 4,
  "invalidated": 3
}
```

---

### 10. `memorix_export_markdown`

Export active facts as markdown for OpenClaw memory workflows.

**Input Schema:**
```json
{
  "subject": "string (optional) - Filter by subject",
  "context_tags": "string (optional) - Filter by tags",
  "limit": "integer (optional, default: 100)",
  "mode": "string (optional) - memory (grouped) or daily (chronological)"
}
```

**Output:**
```json
{
  "success": true,
  "mode": "memory",
  "count": 12,
  "markdown": "- Alice: prefers=dark mode; uses=VS Code"
}
```

---

### 11. `memorix_get_predicate_policies`

Read effective predicate policies.

**Input Schema:**
```json
{
  "predicate": "string (optional) - Read one predicate policy"
}
```

**Output:**
```json
{
  "success": true,
  "count": 4,
  "policies": [
    {"predicate":"status","mode":"single","source":"default"}
  ]
}
```

---

### 12. `memorix_set_predicate_policy`

Set predicate policy for drift control.

**Input Schema:**
```json
{
  "predicate": "string (required)",
  "mode": "string (required) - single or multi"
}
```

**Output:**
```json
{
  "success": true,
  "predicate": "status",
  "mode": "single"
}
```

---

### 13. `memorix_detect_contradictions`

Detect active contradictions for predicates configured as single-value.

**Input Schema:**
```json
{
  "subject": "string (optional)",
  "predicate": "string (optional)",
  "limit": "integer (optional, default: 100)"
}
```

**Output:**
```json
{
  "success": true,
  "count": 1,
  "contradictions": [
    {"subject":"Alice","predicate":"status","object_count":2,"fact_count":2}
  ]
}
```

---

### 14. `memorix_resolve_contradiction`

Resolve one contradiction by keeping one active fact and invalidating others.

**Input Schema:**
```json
{
  "subject": "string (required)",
  "predicate": "string (required)",
  "keep_object": "string (optional)",
  "keep_latest": "boolean (optional, default: true)"
}
```

**Output:**
```json
{
  "success": true,
  "resolved": true,
  "resolution_id": "uuid",
  "kept_fact_id": "uuid",
  "invalidated": 1
}
```

---

### 15. `memorix_rollback_resolution`

Rollback a previous contradiction resolution.

**Input Schema:**
```json
{
  "resolution_id": "string (required)"
}
```

**Output:**
```json
{
  "success": true,
  "rolled_back": true,
  "reactivated": 2
}
```

---

### 16. `memorix_rank_promotion_candidates`

Rank deterministic promotion candidates for durable-memory workflows.

**Input Schema:**
```json
{
  "since_days": "integer (optional, default: 30)",
  "min_occurrences": "integer (optional, default: 1)",
  "limit": "integer (optional, default: 50)"
}
```

**Output:**
```json
{
  "success": true,
  "count": 3,
  "candidates": [
    {"subject":"ProjectX","predicate":"status","object":"in_progress","promotion_score":0.82}
  ]
}
```

---

### 17. `memorix_get_health_report`

Return health metrics for long-running memory operations.

**Input Schema:**
```json
{
  "stale_days": "integer (optional, default: 180)"
}
```

**Output:**
```json
{
  "success": true,
  "active_facts": 120,
  "invalidated_facts": 42,
  "contradiction_groups": 3,
  "stale_active_facts": 17
}
```

---

### 18. `memorix_run_maintenance_sweep`

Run contradiction maintenance with dry-run/apply semantics.
Strategy selection is automatic and inferred from current memory health signals.

**Input Schema:**
```json
{
  "dry_run": "boolean (optional, default: true)",
  "limit": "integer (optional, default: 50)",
  "subject": "string (optional)",
  "predicate": "string (optional)"
}
```

**Output:**
```json
{
  "success": true,
  "dry_run": true,
  "planned_actions": 2,
  "actions": []
}
```

---

### 19. `memorix_recommend_compaction`

Recommend whether proactive compaction should run now.

**Input Schema:**
```json
{
  "current_context_tokens": "integer (optional)",
  "token_threshold": "integer (optional, default: 6000)",
  "stale_days": "integer (optional, default: 180)",
  "contradiction_threshold": "integer (optional, default: 1)"
}
```

**Output:**
```json
{
  "success": true,
  "recommend_compaction": true,
  "reasons": ["context_tokens_ge_6000"],
  "suggested_context_pack_args": {"token_budget":500,"prioritize_contradictions":true}
}
```

---

### 20. `memorix_compact_context_now`

One-shot compaction pipeline that performs recommendation, compaction, and telemetry recording.

**Input Schema:**
```json
{
  "current_context_tokens": "integer (optional)",
  "token_threshold": "integer (optional, default: 6000)",
  "query": "string (optional)",
  "subject": "string (optional)",
  "context_tags": "string (optional)",
  "since_valid_from": "string (optional)",
  "prioritize_contradictions": "boolean (optional, default: true)",
  "token_budget": "integer (optional, default: 500)",
  "per_subject_limit": "integer (optional, default: 4)",
  "limit": "integer (optional, default: 20)",
  "force": "boolean (optional)"
}
```

**Output:**
```json
{
  "success": true,
  "compacted": true,
  "compression_ratio": 0.52,
  "avg_quality_score": 0.81,
  "text": "- ProjectX: status=in_progress"
}
```

---

### 21. `memorix_autotune_compaction_params`

Auto-tune compaction defaults from recent telemetry.

**Input Schema:**
```json
{
  "window": "integer (optional, default: 30)"
}
```

**Output:**
```json
{
  "success": true,
  "token_budget": 520,
  "per_subject_limit": 4,
  "avg_compression_ratio": 0.61
}
```

---

### 22. `memorix_run_governance_cycle`

Run a unified governance cycle for compaction and contradiction maintenance.
Maintenance strategy selection is automatic and does not require user input.

**Input Schema:**
```json
{
  "dry_run": "boolean (optional, default: true)",
  "force_compaction": "boolean (optional)",
  "run_maintenance": "boolean (optional, default: true)",
  "current_context_tokens": "integer (optional)",
  "token_threshold": "integer (optional, default: 6000)",
  "token_budget": "integer (optional)",
  "per_subject_limit": "integer (optional)",
  "limit": "integer (optional, default: 20)",
  "since_valid_from": "string (optional)",
  "prioritize_contradictions": "boolean (optional, default: true)"
}
```

**Output:**
```json
{
  "success": true,
  "dry_run": true,
  "compaction": {"compacted":true},
  "maintenance": {"planned_actions":2}
}
```

---

### 23. `memorix_check_consistency`

Verify active-memory consistency and return repair hints.

**Input Schema:**
```json
{
  "subject": "string (optional)",
  "predicate": "string (optional)"
}
```

**Output:**
```json
{
  "success": true,
  "consistency_ok": false,
  "contradiction_groups": 1,
  "contradiction_repairs": [{"subject":"Alice","predicate":"status"}]
}
```

---

### 24. `memorix_get_governance_run`

Read governance run status by run id or idempotency key.

**Input Schema:**
```json
{
  "run_id": "string (optional)",
  "idempotency_key": "string (optional)"
}
```

**Output:**
```json
{
  "success": true,
  "found": true,
  "run": {"status":"completed","output_payload":{}}
}
```

---

## Best Practices

### 1. Store Specific, Not Vague

**❌ Bad:**
```json
{
  "subject": "User",
  "predicate": "likes",
  "object": "things"
}
```

**✅ Good:**
```json
{
  "subject": "User",
  "predicate": "prefers",
  "object": "TypeScript over JavaScript"
}
```

### 2. Use Context Tags for Organization

Tag facts by category for easier retrieval:
- `user_preference` - User settings and likes
- `project_config` - Project-specific configuration
- `decision` - Architectural or design decisions
- `bug_fix` - Known issues and fixes
- `environment` - OS, tools, versions

### 3. Batch When Possible

Use `memorix_store_facts` (batch) instead of multiple `memorix_store_fact` calls for better performance.

### 4. Prefer Auto-Memorize for Logs

When processing long text (meeting notes, command output), use `memorix_auto_memorize` to extract facts automatically rather than manual extraction.

### 5. Invalidate, Don't Delete

When a fact becomes outdated, use `memorix_invalidate_fact` to preserve audit history rather than ignoring it.

### 6. Use Context Pack Before Long Answers

When session context is large, call `memorix_get_context_pack` first and inject only the returned compact lines into reasoning context.

### 7. Use `replace_existing` for Mutable Facts

For mutable fields (status, location, preference toggles), pass `replace_existing=true` to avoid contradictory active facts.

### 8. Prefer Higher `quality_score` Facts

When multiple candidate facts are returned, prioritize higher `quality_score` values before composing final answers.

---

## Error Handling

All tools return JSON with error information on failure:

```json
{
  "isError": true,
  "error": "Human-readable error message",
  "message": "Technical details (if available)"
}
```

**Common Errors:**
- Missing required fields
- Invalid FTS5 query syntax
- Database locked (concurrent access)
- Text too long (max 10,000 chars per field)

**Retry Strategy:**
- FTS5 syntax errors: Sanitize query (remove unmatched quotes, backslashes)
- Database locked: Wait briefly and retry
- Validation errors: Fix input and retry

---

## Fallback Behavior

**If Memorix is unavailable:**
1. Log the error but don't crash
2. Continue operating without persistent memory
3. Inform the user that memory features are temporarily disabled

**If search returns no results:**
1. Try broader search terms
2. Check if facts were stored with different tags
3. Consider using `memorix_query_history` to check past states

**If auto-memorize extracts no triples:**
1. The text may not contain recognizable patterns
2. Try rephrasing or summarizing the text first
3. Fall back to manual `memorix_store_fact` calls

---

## Schema Constraints

- **Max field length:** 10,000 characters
- **Max query length:** 5,000 characters
- **Max hops in traversal:** 3
- **Default limit (search):** 10 results
- **Default limit (history):** 50 results
- **Max limit (traversal):** 100 results

---

## Integration Example

```javascript
// Example: Agent remembering user preferences

// 1. Store a preference
await callTool("memorix_store_fact", {
  subject: "User",
  predicate: "prefers",
  object: "dark mode interface",
  context_tags: "ui_preference,theme"
});

// 2. Later, search for it
const results = await callTool("memorix_search_fts", {
  query: "User prefers",
  context_tags: "ui_preference"
});

// 3. Process sub-agent output
const subAgentOutput = "The API now uses GraphQL instead of REST...";
await callTool("memorix_auto_memorize", {
  text: subAgentOutput,
  context_tags: "architecture_change",
  source: "api_refactoring_task"
});

// 4. Trace relationships
const related = await callTool("memorix_trace_relations", {
  start_subject: "API",
  predicate_filter: "uses",
  max_hops: 2
});
```

---

## Version

- **Skill Version:** 2.1.0
- **MCP Protocol:** 2.0.0-alpha.2
- **Database Schema:** 5.0

---

## See Also

- [README.md](./README.md) - Human-facing documentation
- Architecture details in source comments

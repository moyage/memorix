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

// Response includes 7 memory tools
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
  "source": "string (optional) - Origin or context path"
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
  "id": "uuid-of-stored-fact"
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
      "source": "string (optional)"
    }
  ]
}
```

**Output:**
```json
{
  "success": true,
  "count": 42
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
    "valid_from": "2026-01-15T10:30:00Z"
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
  "source": "string (optional) - Origin of the text"
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
  "triples": [
    {"subject": "Alice", "predicate": "is", "object": "software engineer"}
  ]
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

- **Skill Version:** 2.0.0
- **MCP Protocol:** 2.0.0-alpha.2
- **Database Schema:** 2.0

---

## See Also

- [README.md](./README.md) - Human-facing documentation
- Architecture details in source comments

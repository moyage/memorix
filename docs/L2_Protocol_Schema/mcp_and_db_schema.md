# Protocol & Database Schema (V2)

> **Version**: 2.0 (Industrial-Grade)
> **Last Updated**: 2026-04-08

Memorix V2 uses a dual-table structure to support Temporal Triples, Full Text Search, and Graph Traversal with industrial-grade SQLite performance.

---

## SQLite Schema

### Database Initialization (V2)

Before using the database, execute these PRAGMAs on every connection for WAL mode and optimized synchronous settings:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

---

### 1. Core Facts Table (Temporal Triples)

```sql
CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    context_tags TEXT,
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_to DATETIME DEFAULT NULL,
    source TEXT
);
```

**Schema Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT | UUID primary key |
| `subject` | TEXT | Entity being described |
| `predicate` | relationship or action |
| `object` | TEXT | Target or value |
| `context_tags` | TEXT | Comma-separated tags for contextual filtering (V2新增) |
| `valid_from` | DATETIME | Timestamp when fact became active |
| `valid_to` | DATETIME | Timestamp when fact was invalidated (NULL = currently valid) |
| `source` | TEXT | Context or file path origin |

### 2. FTS5 Virtual Table (V2)

```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
    subject, 
    predicate, 
    object, 
    context_tags,
    source, 
    tokenize='porter',
    content='facts', 
    content_rowid='rowid'
);
```

**V2 Changes:**
- Added `context_tags` column for tagged filtering
- Added `tokenize='porter'` for Porter stemmer tokenization (improves fuzzy recall and stemming)
- Content sync maintained via triggers

### 3. Synchronization Triggers

SQLite triggers automatically sync the `facts` and `facts_fts` tables on INSERT, UPDATE, and DELETE operations to ensure the FTS5 index is always strictly current.

---

## MCP Server Interface (JSON-RPC 2.0)

The server dispatches the following core tools:

### `memorix_store_fact`

Stores a single temporal triple into the database.
- **Arguments**:
  - `subject` (string): The entity being described.
  - `predicate` (string): The relationship or action.
  - `object` (string): The target or value.
  - `context_tags` (string, optional): Comma-separated tags for context.
  - `source` (string, optional): Context or file path origin.
- **Behavior**: Inserts into `facts`, automatically sets `valid_from` to the current time.
- **Few-Shot Examples**:
  - **Good**: `(Apple, launch_plan, iPhone 16)` — specific, actionable
  - **Bad**: `(Apple, plans to release, a phone)` — vague, non-specific
  - **Good**: `(User, prefers, dark_mode)` — clear preference
  - **Bad**: `(User, likes, things)` — ambiguous object
  - **Good**: `(Project, status, in_progress)` — precise state

---

### `memorix_store_facts`

Batch stores multiple temporal triples into the database in a single transaction.
- **Arguments**:
  - `facts` (array of objects): Array of fact objects, each containing:
    - `subject` (string): The entity being described.
    - `predicate` (string): The relationship or action.
    - `object` (string): The target or value.
    - `context_tags` (string, optional): Comma-separated tags.
    - `source` (string, optional): Context or file path origin.
- **Behavior**: Batch inserts all facts within a single transaction, setting `valid_from` to current time for each.
- **Use Case**: Efficient bulk import of knowledge triples.

---

### `memorix_search_fts`

Extremely fast text search over memory state.
- **Arguments**:
  - `query` (string): The search string (supports FTS5 syntax including prefix matching with `*`).
  - `context_tags` (string, optional): Filter by specific context tags (comma-separated).
  - `limit` (integer, default: 10): Max results.
- **Behavior**: Queries `facts_fts` joining on active `facts` (where `valid_to` IS NULL).
- **Few-Shot Examples**:
  - **Query**: `"iPhone"` → Matches `(Apple, launch_plan, iPhone 16)`
  - **Query**: `"dark*"` → Matches `(User, prefers, dark_mode)` via stemming
  - **Query**: `"Apple" context_tags="product"` → Filters by tag

---

### `memorix_invalidate_fact`

Marks a fact as no longer valid without deleting its history.
- **Arguments**:
  - `id` (string): The UUID of the fact.
- **Behavior**: Sets `valid_to` to `CURRENT_TIMESTAMP`, effectively removing it from current state lookups while preserving audit history.

---

### `memorix_query_history`

Queries past state of the knowledge graph using temporal timestamps.
- **Arguments**:
  - `valid_to` (string): The timestamp to query. Returns facts that were valid at this point in time (i.e., `valid_from <= valid_to` AND (`valid_to IS NULL` OR `valid_to > valid_to`).
  - `subject` (string, optional): Filter by subject.
  - `limit` (integer, default: 50): Max results.
- **Behavior**: Returns historical facts that were active at the specified point in time.
- **Use Case**: Reconstructing state at a past timestamp, audit trails, rollback analysis.

---

### `memorix_trace_relations`

Graph traversal using Recursive CTEs up to 3 hops.
- **Arguments**:
  - `start_subject` (string): The starting entity.
  - `predicate_filter` (string, optional): Only follow edges matching this predicate.
  - `max_hops` (integer, default: 3, max: 3): Maximum traversal depth.
  - `limit` (integer, default: 100): Max results.
- **Behavior**: Performs recursive CTE traversal to find connected entities up to 3 hops away.
- **Use Case**: Finding indirect relationships, chain-of-thought tracing, dependency analysis.
- **Example**:
  - Query: `(A, knows, B)`, `(B, knows, C)`, `(C, works_at, D)`
  - Input: `start_subject="A"`, `max_hops=3`
  - Output: `[(A, knows, B), (B, knows, C), (C, works_at, D)]`

---

## Performance Notes

- Use **WAL mode** (`journal_mode = WAL`) for concurrent reads during writes
- Use **NORMAL synchronous** for balanced durability vs. speed
- FTS5 with **Porter stemmer** improves recall for partial/fuzzy matches
- Batch inserts via `memorix_store_facts` are significantly faster than individual calls
- Graph traversal limited to 3 hops to prevent runaway queries

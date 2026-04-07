# Protocol & Database Schema

## SQLite FTS5 Schema

Memorix uses a dual-table structure to support both Temporal Triples and Full Text Search.

### 1. Core Facts Table (Temporal Triples)
```sql
CREATE TABLE facts (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_to DATETIME DEFAULT NULL,
    source TEXT
);
```

### 2. FTS5 Virtual Table
```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
    subject, 
    predicate, 
    object, 
    source, 
    content='facts', 
    content_rowid='rowid'
);
```

### 3. Synchronization Triggers
SQLite triggers will automatically sync the `facts` and `facts_fts` tables on INSERT, UPDATE, and DELETE operations to ensure the FTS5 index is always strictly current.

---

## MCP Server Interface (JSON-RPC 2.0)

The server dispatches the following core tools:

### `memorix_store_fact`
Stores a new temporal triple into the database.
- **Arguments**:
  - `subject` (string): The entity being described.
  - `predicate` (string): The relationship or action.
  - `object` (string): The target or value.
  - `source` (string, optional): Context or file path origin.
- **Behavior**: Inserts into `facts`, automatically sets `valid_from` to the current time.

### `memorix_search_fts`
Extremely fast text search over memory state.
- **Arguments**:
  - `query` (string): The search string (supports FTS5 syntax).
  - `limit` (integer, default: 10): Max results.
- **Behavior**: Queries `facts_fts` joining on active `facts` (where `valid_to` IS NULL).

### `memorix_invalidate_fact`
Marks a fact as no longer valid without deleting its history.
- **Arguments**:
  - `id` (string): The UUID of the fact.
- **Behavior**: Sets `valid_to` to `CURRENT_TIMESTAMP`, effectively removing it from current state lookups while preserving audit history.

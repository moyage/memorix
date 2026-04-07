# Memorix Architecture Overview

Memorix is designed as a minimalist, high-speed memory layer for AI agents, extracting the best concepts from standard knowledge graphs while explicitly rejecting heavyweight components like vector databases and dense UI layers.

## Core Components

### 1. Storage Layer: SQLite FTS5
- **Why SQLite?**: Portability and speed. It runs locally with the agent without managing separate daemon processes.
- **Why FTS5?**: Full-Text Search 5 allows us to query trajectory logs and factual triples via fast string matching. We strictly reject Vector DBs (e.g., ChromaDB) due to their high memory overhead and Python extension requirements.

### 2. Data Model: Temporal Triples
Extracted from the `mempalace` architecture, we store knowledge in dynamic Subject-Predicate-Object triples.
- Every triple has a `valid_from` and `valid_to` boundary.
- When a fact changes (e.g., an agent updates a file or changes a configuration), the old triple is invalidated (`valid_to = CURRENT_TIMESTAMP`) rather than deleted, preserving perfect audit history.
- We explicitly reject the `mempalace` spatial metaphors ("Palaces", "Wings", "Rooms") as unnecessary complexity in favor of flat, highly indexed triples.

### 3. Transport Layer: MCP (Model Context Protocol)
- Implements strict JSON-RPC 2.0 for tool discovery and execution.
- The `mcp_server` layer acts as a direct bridge routing AI tool calls (`memorix_store_fact`, `memorix_search_fts`, `memorix_invalidate_fact`) to localized SQLite transactions.

## System Flow

1. **AI Agent** -> Dispatches tool call via MCP interface.
2. **MCP Dispatcher** -> Parses JSON-RPC, validates arguments natively.
3. **SQLite Engine** -> Executes INSERT or FTS5 MATCH queries against the local DB file.
4. **AI Agent** <- Receives extremely low-latency text responses containing relevant triples.

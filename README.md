# Memorix

[![Skill](https://img.shields.io/badge/Skill-Memory-blue.svg)](#)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](#)
[![FTS5](https://img.shields.io/badge/SQLite-FTS5-blue.svg)](#)

**Memorix** is a zero-dependency, high-performance Long-Term Memory Skill for AI Agent systems. It provides persistent, searchable, and time-aware memory storage via the Model Context Protocol (MCP).

## Overview

Memorix solves **Context Erosion** in long-running AI tasks. Instead of filling the context window with raw execution logs, agents can extract and store semantic facts (temporal triples) into a persistent database. This allows raw logs to slide out of the context window without causing "agent amnesia".

## Architecture

```
┌─────────────────┐     MCP (stdio)     ┌──────────────────┐
│   AI Agent      │ ◄─────────────────► │   Memorix        │
│   (Any MCP      │   JSON-RPC 2.0      │   MCP Server     │
│   Client)       │                     │                  │
└─────────────────┘                     └────────┬─────────┘
                                                  │
                                                  ▼
                                        ┌──────────────────┐
                                        │   SQLite + FTS5  │
                                        │   (WAL Mode)     │
                                        └──────────────────┘
```

### Key Components

- **Storage**: SQLite with Write-Ahead Logging (WAL) for high performance
- **Schema**: Temporal Triples `(Subject, Predicate, Object) + Context Tags`
- **Retrieval**: Native `FTS5` (Full-Text Search) with Porter stemming
- **Protocol**: Standard MCP Server via stdio transport

## Installation

### Prerequisites

- Node.js >= 18.0.0
- SQLite3 with FTS5 extension (included in `better-sqlite3`)

### Install from npm

```bash
npm install -g memorix
```

### Or install from source

```bash
git clone <repository-url>
cd memorix
npm install
npm run build
```

## Usage

### As an MCP Server

Start the MCP server for integration with AI agents:

```bash
npm start
# or
node dist/server.js
```

The server communicates via stdio using the Model Context Protocol.

### Human Review Tool

Inspect the memory database with human-readable output:

```bash
# View all facts as ASCII table
npm run view -- --format table

# View as tree structure
npm run view -- --format tree

# View statistics
npm run view -- --stats
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORIX_DB_PATH` | `./memorix.db` | Path to SQLite database file |

### Database Schema

Memorix uses a temporal triple store with the following schema:

```sql
CREATE TABLE facts (
    id TEXT PRIMARY KEY,           -- UUID
    subject TEXT NOT NULL,         -- Entity being described
    predicate TEXT NOT NULL,       -- Relationship/action
    object TEXT NOT NULL,          -- Target/value
    context_tags TEXT,             -- Comma-separated tags
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_to DATETIME DEFAULT NULL, -- NULL = currently valid
    source TEXT                    -- Origin/context path
);
```

### FTS5 Virtual Table

Full-text search is enabled via a virtual table:

```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
    subject, predicate, object, context_tags, source,
    tokenize='porter',
    content='facts',
    content_rowid='rowid'
);
```

## Available MCP Tools

When integrated as an MCP server, Memorix provides the following tools:

| Tool | Description |
|------|-------------|
| `memorix_store_fact` | Store a single temporal triple |
| `memorix_store_facts` | Batch store multiple triples |
| `memorix_search_fts` | Full-text search with FTS5 |
| `memorix_invalidate_fact` | Soft-delete a fact (preserves history) |
| `memorix_query_history` | Query historical state at a specific time |
| `memorix_trace_relations` | Graph traversal up to 3 hops |
| `memorix_auto_memorize` | Auto-extract triples from unstructured text |

See [SKILL.md](./SKILL.md) for complete AI integration documentation.

## Project Structure

```
memorix/
├── src/
│   ├── server.js          # MCP server implementation
│   └── schema.js          # Database schema & migrations
├── scripts/
│   └── view-db.js         # CLI database viewer
├── dist/                  # Built output
├── build.js               # Esbuild configuration
├── package.json
├── LICENSE
├── README.md              # This file (for humans)
└── SKILL.md               # AI integration guide
```

## Building

```bash
npm run build
```

This bundles the source code using esbuild for distribution.

## Features

- **Semantic Temporal Triples**: Forces structured fact storage, reducing retrieval hallucination
- **Auto-Memorize**: NLP-based extraction from unstructured text
- **Time-Aware**: Historical queries and audit trails via temporal validity
- **Graph Traversal**: Follow relationships up to 3 hops using recursive CTEs
- **Safe Migrations**: Non-destructive schema upgrades
- **Visual Observability**: CLI tool for human review of memory states

## Performance

- WAL mode enables concurrent reads during writes
- FTS5 with Porter stemmer for fuzzy matching
- Millisecond query latency (no vector database overhead)
- Batch inserts for efficient bulk operations

## License

MIT License - see [LICENSE](./LICENSE) file.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

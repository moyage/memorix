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

# View statistics only
npm run view -- --stats

# Backward-compatible alias for tree mode
npm run view -- --tree
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORIX_DB_PATH` | `./memorix.db` | Path to SQLite database file |
| `MEMORIX_TOOL_PROFILE` | `full` | Tool exposure profile: `full`, `omoc`, `hermes`, or `auto` |
| `MEMORIX_AUTO_PROFILE_WINDOW` | `6` | Sliding window size for auto profile inference |
| `MEMORIX_AUTO_PROFILE_MIN_CALLS` | `3` | Minimum observed calls before auto profile lock |
| `MEMORIX_AGENT_ID/NAME/ROLE` | _(unset)_ | Optional identity hints for immediate auto profile matching |
| `MEMORIX_CLIENT_NAME/TITLE` | _(unset)_ | Optional client hints for immediate auto profile matching |
| `MEMORIX_ALLOWED_TOOLS` | _(unset)_ | Explicit comma-separated allowlist override |
| `MEMORIX_PREDICATE_ALIASES` | built-in aliases | Extra alias map, format: `likes:prefers,works for:works_at` |
| `MEMORIX_PREDICATE_WHITELIST` | _(unset)_ | Comma-separated allowed predicates |
| `MEMORIX_PREDICATE_WHITELIST_MODE` | `warn` | `off`, `warn`, or `enforce` |

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
| `memorix_get_context_pack` | Build compact, high-signal memory packs for long sessions |
| `memorix_import_markdown` | Import OpenClaw-style markdown memory into Memorix |
| `memorix_export_markdown` | Export active memory to markdown for OpenClaw workflows |
| `memorix_get_predicate_policies` | Inspect effective single/multi predicate policies |
| `memorix_set_predicate_policy` | Set mutable predicate policy (`single`/`multi`) |
| `memorix_detect_contradictions` | Detect active contradictions for single-value predicates |
| `memorix_resolve_contradiction` | Resolve contradictions by keeping one active fact |
| `memorix_rollback_resolution` | Roll back a prior contradiction resolution |
| `memorix_rank_promotion_candidates` | Rank deterministic promotion candidates for durable memory |
| `memorix_get_health_report` | Return memory health metrics for long-running sessions |
| `memorix_run_maintenance_sweep` | Run contradiction maintenance with dry-run/apply modes |
| `memorix_recommend_compaction` | Recommend when to proactively run context compaction |
| `memorix_compact_context_now` | One-shot recommend→compact→telemetry context compaction pipeline |
| `memorix_autotune_compaction_params` | Auto-tune compaction defaults from telemetry history |
| `memorix_run_governance_cycle` | Run combined compaction + maintenance governance cycle |
| `memorix_check_consistency` | Verify post-operation memory consistency and repair hints |
| `memorix_get_governance_run` | Inspect governance run status/results by run id or idempotency key |

See [SKILL.md](./SKILL.md) for complete AI integration documentation.

## Project Structure

```
memorix/
├── src/
│   ├── server.js          # MCP server implementation
│   └── schema.js          # Database schema & migrations
├── scripts/
│   └── view-db.js         # CLI database viewer
├── docs/
│   └── REDESIGN_AND_MARKET_COMPARISON.md
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

## ClawHub Release Workflow

Use the built-in scripts to run a safety-gated ClawHub release flow:

```bash
# Preflight + security + build/test verification
npm run clawhub:verify

# Publish (requires clawhub CLI login)
npm run clawhub:publish
```

Optional environment variables for publish:

- `CLAWHUB_SLUG` (default: `memorix`)
- `CLAWHUB_NAME` (default: `Memorix`)
- `CLAWHUB_VERSION` (default: package version)
- `CLAWHUB_CHANGELOG`
- `CLAWHUB_TAGS` (comma-separated)
- `CLAWHUB_DRY_RUN=1` (print command without publishing)

## SkillsMP Listing Workflow

SkillsMP indexes public GitHub skill repositories automatically, so the key is to keep repository metadata and skill files high quality.

```bash
# Validate listing readiness
npm run skillsmp:readiness

# Probe SkillsMP index (query + owner/repo check)
npm run skillsmp:probe -- memorix moyage/memorix
```

## OpenClaw Local Integration (Protected Config Compatible)

This is a **workspace-compatible integration flow**, not the full standard `openclaw skills install <slug>` path.
The remaining blocker is protected `mcp.servers` policy (manual paste still required when protected).

```bash
# 0) Materialize a minimal standard skill folder (entity directory)
npm run openclaw:materialize

# 1) Install materialized package into workspace/skills (no symlink)
npm run openclaw:install -- /ABS/PATH/TO/openclaw-workspace memorix

# 2) Emit manual mcp.servers snippet (points to workspace skill entity path)
npm run openclaw:mcp-snippet -- /ABS/PATH/TO/openclaw-workspace memorix

# 3) Emit OMOC/Hermes tool allowlists
npm run openclaw:allowlists
```

Detailed guide: [docs/OPENCLAW_LOCAL_INTEGRATION_ZH.md](./docs/OPENCLAW_LOCAL_INTEGRATION_ZH.md)
Standard package spec: [docs/OPENCLAW_STANDARD_SKILL_PACKAGE_SPEC_ZH.md](./docs/OPENCLAW_STANDARD_SKILL_PACKAGE_SPEC_ZH.md)

## Upgrade Safety Workflow

```bash
# 1) Preflight + backup before upgrade
npm run upgrade:preflight
npm run upgrade:backup

# 2) Diagnose compatibility issues
npm run upgrade:doctor

# 3) Roll back to latest backup if needed
npm run upgrade:rollback
```

## Features

- **Semantic Temporal Triples**: Forces structured fact storage, reducing retrieval hallucination
- **Auto-Memorize**: NLP-based extraction from unstructured text
- **Context Pack**: Compresses active memory into compact, reinjectable context lines
- **Time-Aware**: Historical queries and audit trails via temporal validity
- **Graph Traversal**: Follow relationships up to 3 hops using recursive CTEs
- **Deduplicated Writes**: Avoids active duplicate triples and supports optional replacement mode
- **Predicate Policy Registry**: Mutable predicates can use latest-truth replacement semantics
- **Quality Scoring**: Retrieval outputs include quality scores for ranking and selection
- **Markdown Interop**: Import/export pipelines for OpenClaw memory file workflows
- **Contradiction Operations**: Built-in detect/resolve tools for single-value predicate conflicts
- **Promotion Pipeline Primitive**: Candidate ranking for durable-memory promotion workflows
- **Operations Health + Sweep**: Built-in health metrics and maintenance sweep for long-term stability
- **Proactive Compaction Advice**: Recommendation endpoint for context-pressure-triggered compaction
- **Closed-Loop Compaction**: One-shot compaction pipeline plus telemetry-based auto-tuning
- **Governance Cycle**: Unified dry-run/apply job for compaction and contradiction maintenance
- **Automatic Strategy Selection**: No user-facing strategy tiers; maintenance policy is inferred automatically
- **Consistency Checks**: Built-in verification pass for post-repair and post-rollback integrity
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

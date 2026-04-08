# ADR-001: Memorix V2 Schema Upgrade

**Date**: 2026-04-08
**Status**: Accepted
**Author**: Hermes (Protocol Update)

## Context

The Memorix V1 schema lacks several industrial-grade features required for production AI agent workloads:
- No support for contextual tagging/filtering of facts
- No Porter stemmer tokenization for fuzzy/partial matching
- No historical query capability
- No graph traversal for relationship tracing
- No batch insertion for bulk imports

## Decision

Upgrade to V2 schema with the following changes:

1. **Add `context_tags` field** - Enables filtering facts by semantic tags (e.g., "product", "user", "project")
2. **Enable Porter stemmer** - Improves FTS5 recall via linguistic stemming (dark* matches dark_mode)
3. **Add batch insert tool** - `memorix_store_facts` for efficient bulk imports
4. **Add history query tool** - `memorix_query_history` for temporal reconstruction
5. **Add graph traversal tool** - `memorix_trace_relations` using Recursive CTE up to 3 hops

## Expected Impact

- **Positive**: Better query flexibility, improved recall, bulk import efficiency
- **Migration**: Old database must be dropped and recreated (handled automatically)
- **Breaking**: Version bumps to 2.0.0

## Resolution

Schema updated in `src/schema.js` and MCP tools updated in `src/server.js` per V2 specification.

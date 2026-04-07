# Memorix: Vision & Strategy

## Vision
Memorix is the definitive open-source AI Long-Term Memory System. Built for absolute speed, efficiency, and zero-dependency portability, Memorix provides robust long-term and procedural memory for autonomous agents. It drops bloated vector embeddings in favor of extremely fast, lightweight SQLite FTS5 for semantic and trajectory retrieval.

## Key Concepts
- **SQLite FTS5**: Blazing fast, embedded full-text search with zero external database dependencies.
- **Temporal Triples**: Adapting the best patterns from `mempalace`, facts are stored as Subject-Predicate-Object relations with `valid_from` and `valid_to` timestamps. This allows the memory to evolve and invalidate past truths autonomously.
- **MCP Native**: Exposes standard JSON-RPC 2.0 endpoints for seamless integration into any AI tool-calling stack.

## [NON-GOALS]
To maintain strict adherence to our Complexity Budget, Memorix explicitly rejects:
- **No Vector DBs**: ChromaDB, Pinecone, or FAISS are strictly forbidden. We rely exclusively on SQLite FTS5.
- **No UI Platforms**: Memorix is a headless protocol/engine, not a web application.
- **No Heavy Frameworks**: No Express, no FastAPI bloat. Minimal dependencies only.
- **No Over-Engineered Ontologies**: We reject complex graph models (e.g., "Palaces", "Wings", "Rooms") in favor of flat, highly indexed Temporal Triples.

## Definition of Done (DoD)
- SQLite schema initialized with Temporal Triples and FTS5 triggers.
- MCP JSON-RPC 2.0 Server implemented and tested.
- Core operations (`store`, `search`, `invalidate`) returning sub-100ms response times.
- Zero usage of rejected technologies (vector DBs, HTTP frameworks).

# Memorix

[![Model Context Protocol](https://img.shields.io/badge/MCP-Native-green.svg)](#)
[![FTS5](https://img.shields.io/badge/SQLite-FTS5-blue.svg)](#)

[中文文档 (Chinese)](README_zh.md)

**Memorix** is a zero-dependency, high-performance Long-Term Memory System designed specifically for Autonomous AI Agents. It provides persistent, searchable, and time-aware memory storage via the Model Context Protocol (MCP).

## 🎯 The Problem It Solves (First Principles)
AI Agents suffer from **Context Erosion**. In long-running tasks, filling the context window with raw execution logs or lengthy chat histories leads to hallucination and loss of early architectural decisions. 
Memorix solves this through **Context Dehydration**: it allows agents to asynchronously extract and store semantic facts (triples) into a persistent database, letting the raw logs slide out of the context window without causing "agent amnesia".

## 🏗 Architecture
- **Storage**: SQLite with Write-Ahead Logging (WAL).
- **Schema**: Temporal Triples `(Subject, Predicate, Object) + Context Tags`.
- **Retrieval**: Native `FTS5` (Full-Text Search) with Porter stemming triggers. Millisecond latency with zero vector-database (e.g., Chroma, Qdrant) overhead.
- **Protocol**: Standard MCP Server (`@modelcontextprotocol/server`) via stdio.

## 🚀 Features
1. **Semantic Temporal Triples**: Forces AI to store facts in a strict structure, reducing retrieval hallucination.
2. **Auto-Memorize (`memorix_auto_memorize`)**: Agents can feed raw, unstructured text to the MCP tool. Memorix internally parses and extracts the triples automatically, reducing the cognitive load/token output of the LLM.
3. **Safe Migrations**: `PRAGMA user_version` manages schema upgrades non-destructively.
4. **Visual Observability**: Includes a `npm run view` CLI tool to print ASCII tables of current memory states, bridging the gap between Agent data and Human review.

## 💻 Use Cases
- **Multi-Session Continuity**: Remembering user preferences, OS environment quirks, or project-specific linting rules across separate chat sessions.
- **Dehydrating Sub-Agent Logs**: An orchestrator agent delegates a task to a coder agent. Instead of reading the coder's 500-line output, it uses `memorix_auto_memorize` to store the architectural outcomes and discards the rest.

## 🛠 Usage (For AI & Humans)

### Installation & Execution
```bash
npm install -g memorix
# Start as MCP Server
npm run mcp
# Human Review Tool
npm run view -- --format table
```

### AI Integration (MCP Tools)
- `memorix_store_fact`: Precise, manual insertion of `(S, P, O)`.
- `memorix_auto_memorize`: NLP-based extraction from long texts.
- `memorix_search_fts`: Fast keyword retrieval of historical context.

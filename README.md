# Memorix

AI Long-Term Memory System for OpenClaw MCP servers.

## Features

- **SQLite FTS5 Full-Text Search**: Fast, scalable memory retrieval
- **Temporal Triples**: Semantic relationship tracking with timestamps
- **MCP Server**: Native Model Context Protocol integration
- **Zero-Dependency Philosophy**: Minimal runtime dependencies

## Installation

```bash
npm install memorix
```

## Quick Start

```bash
npm start
```

The MCP server will start on stdio by default.

## OpenClaw Integration

Install as an OpenClaw skill:

```bash
npm link
# Then configure in OpenClaw's openclaw.json
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dbPath` | string | `memorix.db` | SQLite database path |
| `maxMemoryItems` | number | `10000` | Maximum memory items |

## Architecture

See [docs/L3_Engineering/skill_packaging.md](./docs/L3_Engineering/skill_packaging.md) for technical design.

## License

MIT License - see [LICENSE](./LICENSE) file.
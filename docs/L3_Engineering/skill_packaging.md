# Memorix Skill Packaging Specification

## Overview

This document defines the design specification for packaging Memorix as a standard OpenClaw Skill and preparing it for open-source release. It covers the `package.json` modifications required to add the OpenClaw manifest and the open-source file structure.

## 1. OpenClaw Manifest Field

### 1.1 Target: `package.json`

The `package.json` must include an `"openclaw"` manifest field to enable:
- 1-click installation via OpenClaw skill marketplace
- Automatic MCP server registration
- Skill metadata (name, displayName, category, permissions)

### 1.2 Implementation

Add the following `"openclaw"` object to `package.json`:

```json
{
  "name": "memorix",
  "version": "1.0.0",
  "description": "AI Long-Term Memory System with SQLite FTS5",
  "main": "src/server.js",
  "type": "commonjs",
  "scripts": {
    "start": "node src/server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["mcp", "memory", "fts5", "sqlite"],
  "author": "OpenClaw Labs Team",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/openclaw-labs/memorix.git"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0-alpha.2",
    "better-sqlite3": "^12.8.0"
  },
  "openclaw": {
    "skillName": "memorix",
    "displayName": "Memorix - AI Long-Term Memory",
    "description": "AI-powered long-term memory system with SQLite FTS5 full-text search and Temporal Triples for semantic relationship tracking. Enables persistent, searchable memory for AI agents.",
    "category": "memory",
    "entryPoint": "src/server.js",
    "mcpServers": {
      "memorix": {
        "command": "node",
        "args": ["${__dirname}/src/server.js"],
        "env": {}
      }
    },
    "permissions": [
      "filesystem"
    ],
    "config": {
      "dbPath": {
        "type": "string",
        "description": "Path to SQLite database file",
        "default": "memorix.db",
        "required": false
      },
      "maxMemoryItems": {
        "type": "number",
        "description": "Maximum number of memory items to store",
        "default": 10000,
        "required": false
      }
    }
  }
}
```

### 1.3 Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `skillName` | string | Unique identifier for the skill (lowercase, hyphenated) |
| `displayName` | string | Human-readable name for UI display |
| `description` | string | Brief description of skill capabilities |
| `category` | string | Skill category (memory, search, data-collection, etc.) |
| `entryPoint` | string | Path to main entry file |
| `mcpServers` | object | MCP server configuration (command, args, env) |
| `permissions` | array | Required permissions (filesystem, network, etc.) |
| `config` | object | User-configurable options with defaults |

---

## 2. Open-Source File Structure

### 2.1 Required Files

The following files must be added to the project root:

```
memorix/
├── README.md           # Project documentation
├── LICENSE             # Open-source license
├── CONTRIBUTING.md     # Contribution guidelines
├── CHANGELOG.md        # Version history
├── src/
│   ├── server.js       # Main MCP server entry point
│   └── schema.js       # Database schema
├── docs/               # Existing documentation
├── memorix.db          # Default database file (gitignored)
├── package.json        # With openclaw manifest
└── .gitignore          # Excludes node_modules, *.db, etc.
```

### 2.2 README.md Template

```markdown
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
```

### 2.3 LICENSE File

Use MIT License for maximum compatibility:

```text
MIT License

Copyright (c) 2026 OpenClaw Labs Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. V2 Cognitive Guardrails Compliance

### 3.1 Requirements

| Guardrail | Compliance |
|-----------|------------|
| No heavy frameworks | ✅ Uses raw `@modelcontextprotocol/server` and `better-sqlite3` |
| Zero-dependency philosophy | ✅ Only 2 runtime dependencies |
| Single responsibility | ✅ MCP server for memory only |
| Minimal configuration | ✅ 2 config options with sensible defaults |

### 3.2 Notes

- No build step required (plain Node.js with CommonJS)
- Database stored locally (SQLite, no external services)
- No network dependencies by default

---

## 4. Migration from Manual Configuration

### 4.1 Current State

Currently, Memorix requires manual patching of OpenClaw's `openclaw.json`:
```json
{
  "mcpServers": {
    "memorix": {
      "command": "node",
      "args": ["${workspace}/memorix/src/server.js"]
    }
  }
}
```

### 4.2 Target State

With the OpenClaw manifest:
- Skill auto-discovers via `npm link` or marketplace
- MCP server auto-registered via `mcpServers` config
- No manual patching required

---

## 5. Implementation Checklist

- [ ] Add `"openclaw"` field to `package.json`
- [ ] Create `README.md` with usage documentation
- [ ] Create `LICENSE` file (MIT)
- [ ] Create `CONTRIBUTING.md` guidelines
- [ ] Update `.gitignore` to exclude `*.db` and `node_modules/`
- [ ] Test skill installation via `npm link`
- [ ] Verify MCP server auto-registration

---

## References

- OpenClaw Skill Format: `skills/xsearch/package.json`
- OpenClaw Tools Format: `skills/curvature-search/package.json`
- Memorix Architecture: `docs/L2_Protocol_Schema/mcp_and_db_schema.md`

# Memorix

[![Skill](https://img.shields.io/badge/Skill-Memory-blue.svg)](#)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](#)
[![FTS5](https://img.shields.io/badge/SQLite-FTS5-blue.svg)](#)

**Memorix** 是专为 AI Agent 系统设计的高性能、零外部依赖的长时记忆（Long-Term Memory）技能。它通过模型上下文协议（MCP, Model Context Protocol）提供持久化、可搜索且带有时间感知的记忆存储能力。

## 概览

Memorix 旨在解决长期运行的 AI 任务中常见的**上下文侵蚀（Context Erosion）**问题。与其让原始的执行日志填满并挤占宝贵的上下文窗口，智能体（Agent）可以提取语义事实（基于时间的三元组）并将其存入持久化数据库中。这使得原始日志可以安全地滑出上下文窗口，而不会导致智能体“失忆”。

## 架构

```
┌─────────────────┐     MCP (stdio)     ┌──────────────────┐
│   AI Agent      │ ◄─────────────────► │   Memorix        │
│   (任意 MCP      │   JSON-RPC 2.0      │   MCP 服务器       │
│   客户端)        │                     │                  │
└─────────────────┘                     └────────┬─────────┘
                                                  │
                                                  ▼
                                        ┌──────────────────┐
                                        │   SQLite + FTS5  │
                                        │   (WAL 模式)      │
                                        └──────────────────┘
```

### 核心组件

- **存储层**: 采用 SQLite 和 Write-Ahead Logging (WAL) 模式以保证高性能并发。
- **数据结构**: 时间感知的语义三元组 `(主语, 谓语, 宾语) + 上下文标签`。
- **检索层**: 原生集成 `FTS5` (全文检索) 支持，内置 Porter 词干提取。
- **协议层**: 基于标准 MCP Server (stdio 传输)。

## 安装

### 运行环境要求

- Node.js >= 18.0.0
- SQLite3 (包含 FTS5 扩展，通过 `better-sqlite3` 内置集成)

### 从源码安装

```bash
git clone <repository-url>
cd memorix
npm install
npm run build
```

## 使用方法

### 作为 MCP 服务器运行

启动 MCP 服务器，以便与 AI 智能体集成：

```bash
npm start
# 或直接运行构建产物
node dist/server.js
```

服务器将通过标准输入/输出 (stdio) 与 MCP 客户端通信。

### 人类复盘与查看工具

自带命令行可视化工具，方便人类开发者审查数据库内的事实：

```bash
# 以 ASCII 表格形式查看所有事实
npm run view -- --format table

# 以树状图形式查看上下文关系
npm run view -- --format tree

# 查看记忆库统计信息
npm run view -- --stats
```

## 配置指南

### 环境变量

| 变量名 | 默认值 | 描述 |
|----------|---------|-------------|
| `MEMORIX_DB_PATH` | `./memorix.db` | SQLite 数据库文件存放路径 |

### 数据库 Schema

Memorix 采用时间感知的语义三元组架构：

```sql
CREATE TABLE facts (
    id TEXT PRIMARY KEY,           -- UUID
    subject TEXT NOT NULL,         -- 描述的实体/主语
    predicate TEXT NOT NULL,       -- 关系或动作/谓语
    object TEXT NOT NULL,          -- 目标或值/宾语
    context_tags TEXT,             -- 逗号分隔的上下文标签
    valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_to DATETIME DEFAULT NULL, -- NULL 表示当前有效
    source TEXT                    -- 知识来源/路径
);
```

### FTS5 虚拟表

全文搜索通过创建虚拟表实现：

```sql
CREATE VIRTUAL TABLE facts_fts USING fts5(
    subject, predicate, object, context_tags, source,
    tokenize='porter',
    content='facts',
    content_rowid='rowid'
);
```

## 可用的 MCP 工具 (Tools)

作为 MCP 服务器接入后，Memorix 提供以下工具供 AI 调用：

| 工具名 | 功能描述 |
|------|-------------|
| `memorix_store_fact` | 存储单条时间感知三元组 |
| `memorix_store_facts` | 批量存储多条三元组 |
| `memorix_search_fts` | 基于 FTS5 的全文搜索 |
| `memorix_invalidate_fact` | 软删除某条事实 (保留历史痕迹) |
| `memorix_query_history` | 查询特定时间点的历史状态 |
| `memorix_trace_relations` | 图遍历追踪关联关系 (最高 3 级跳) |
| `memorix_auto_memorize` | 从非结构化文本中自动抽取并存储三元组 |

完整的 AI 交互指南请参考 [SKILL.md](./SKILL.md)。

## 项目结构

```
memorix/
├── src/
│   ├── server.js          # MCP 服务器核心实现
│   └── schema.js          # 数据库架构与迁移脚本
├── scripts/
│   └── view-db.js         # 命令行数据库查看器
├── dist/                  # 构建产物目录
├── build.js               # Esbuild 配置文件
├── package.json
├── LICENSE
├── README.md              # 英文文档
├── README_zh.md           # 中文文档
└── SKILL.md               # 专供 AI 读取的技能集成指南
```

## 特性亮点

- **语义时间三元组**: 强制智能体采用结构化事实存储，大幅降低检索时产生的幻觉。
- **自动记忆 (Auto-Memorize)**: 集成轻量级 NLP 逻辑，可直接从非结构化长文本提取事实。
- **时间感知 (Time-Aware)**: 支持带时间戳的历史状态回溯查询及数据审计轨迹。
- **图网络遍历 (Graph Traversal)**: 借助递归 CTE 支持长达 3 级的图关系路径探索。
- **无损迁移 (Safe Migrations)**: 数据库结构升级不破坏现有事实记录。
- **可视化可观测性**: 配备了 CLI 工具方便人类随时审查智能体的“记忆库”。

## 性能

- WAL 模式支持写入时的高并发读取。
- 内置 FTS5 及 Porter 词干提取器，支持高效的模糊匹配。
- 毫秒级查询延迟（相比引入沉重的向量数据库，开销极低）。
- 支持批量插入优化。

## 许可证

MIT License - 详情见 [LICENSE](./LICENSE) 文件。

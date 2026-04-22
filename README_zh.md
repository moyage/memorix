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

# 仅查看记忆库统计信息
npm run view -- --stats

# 兼容旧参数（等价于 --format tree）
npm run view -- --tree
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
| `memorix_get_context_pack` | 为长会话构建高信号、可回注的紧凑上下文包 |
| `memorix_import_markdown` | 将 OpenClaw 风格 Markdown 记忆导入 Memorix |
| `memorix_export_markdown` | 将活跃记忆导出为 OpenClaw 兼容 Markdown |
| `memorix_get_predicate_policies` | 查看当前单值/多值谓词策略 |
| `memorix_set_predicate_policy` | 设置谓词策略（`single`/`multi`） |
| `memorix_detect_contradictions` | 检测单值谓词上的活跃冲突 |
| `memorix_resolve_contradiction` | 通过保留一个事实来解决冲突 |
| `memorix_rollback_resolution` | 回滚一次历史冲突修复操作 |
| `memorix_rank_promotion_candidates` | 为 Durable Memory 晋升流程提供候选排序 |
| `memorix_get_health_report` | 返回长周期运行所需的记忆健康指标 |
| `memorix_run_maintenance_sweep` | 以 dry-run/apply 模式执行冲突维护扫库 |
| `memorix_recommend_compaction` | 给出是否应主动执行上下文压缩的建议 |
| `memorix_compact_context_now` | 一键执行“建议→压缩→落库指标”闭环压缩流程 |
| `memorix_autotune_compaction_params` | 基于历史压缩指标自动调参 |
| `memorix_run_governance_cycle` | 统一执行压缩与冲突维护的治理周期任务 |
| `memorix_check_consistency` | 校验修复/回滚后的记忆一致性并给出修复建议 |
| `memorix_get_governance_run` | 通过 run id 或幂等键查看治理任务状态与结果 |

完整的 AI 交互指南请参考 [SKILL.md](./SKILL.md)。

## 项目结构

```
memorix/
├── src/
│   ├── server.js          # MCP 服务器核心实现
│   └── schema.js          # 数据库架构与迁移脚本
├── scripts/
│   └── view-db.js         # 命令行数据库查看器
├── docs/
│   └── REDESIGN_AND_MARKET_COMPARISON.md
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
- **上下文打包 (Context Pack)**: 将活跃记忆压缩成短行上下文，便于受限上下文窗口回注。
- **时间感知 (Time-Aware)**: 支持带时间戳的历史状态回溯查询及数据审计轨迹。
- **图网络遍历 (Graph Traversal)**: 借助递归 CTE 支持长达 3 级的图关系路径探索。
- **去重写入 (Deduplicated Writes)**: 自动避免活跃重复三元组，并支持可选替换写入模式。
- **谓词策略注册 (Predicate Policy Registry)**: 可变谓词可启用“最新事实优先”的替换语义。
- **质量评分 (Quality Scoring)**: 检索结果包含质量分，便于 Agent 做优先级选择。
- **Markdown 互操作 (Markdown Interop)**: 支持与 OpenClaw 记忆文件工作流导入导出。
- **冲突治理 (Contradiction Operations)**: 内置冲突检测与修复工具，面向单值谓词场景。
- **晋升管线原语 (Promotion Pipeline Primitive)**: 提供可重复的候选排序，支持稳定晋升到长期记忆。
- **运维健康与扫库 (Operations Health + Sweep)**: 内置健康指标与维护扫库能力，保障长期稳定。
- **主动压缩建议 (Proactive Compaction Advice)**: 根据上下文压力和健康指标给出压缩建议。
- **压缩闭环 (Closed-Loop Compaction)**: 一键压缩管线 + 基于遥测指标的自动调参。
- **治理周期 (Governance Cycle)**: 提供 dry-run/apply 一体化治理作业能力。
- **自动策略选择 (Automatic Strategy Selection)**: 不向用户暴露策略档位，系统自动推断维护策略。
- **一致性校验 (Consistency Checks)**: 内置操作后完整性校验，支持回滚后验证。
- **无损迁移 (Safe Migrations)**: 数据库结构升级不破坏现有事实记录。
- **可视化可观测性**: 配备了 CLI 工具方便人类随时审查智能体的“记忆库”。

## 性能

- WAL 模式支持写入时的高并发读取。
- 内置 FTS5 及 Porter 词干提取器，支持高效的模糊匹配。
- 毫秒级查询延迟（相比引入沉重的向量数据库，开销极低）。
- 支持批量插入优化。

## 许可证

MIT License - 详情见 [LICENSE](./LICENSE) 文件。

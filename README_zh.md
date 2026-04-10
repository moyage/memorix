# Memorix

[![Model Context Protocol](https://img.shields.io/badge/MCP-Native-green.svg)](#)
[![FTS5](https://img.shields.io/badge/SQLite-FTS5-blue.svg)](#)

[English Documentation](README.md)

**Memorix** 是一个专为自主 AI 智能体（Autonomous Agents）设计的零依赖、高性能长期记忆系统。它基于 Model Context Protocol (MCP) 提供持久化、可全文检索且具备时间感知能力的记忆存储。

## 🎯 解决的本质问题 (第一性原理)
AI 智能体在长时任务中面临严重的**上下文侵蚀（Context Erosion）**。如果将原始执行日志或长对话强行塞入上下文窗口，会导致大模型出现幻觉并遗忘早期的架构决策。
Memorix 通过**上下文脱水（Context Dehydration）**解决此问题：它允许智能体异步提取语义事实（三元组）并存入持久化数据库。这样，冗长的原始日志可以自然滑出上下文窗口，而智能体不会“失忆”。

## 🏗 架构设计
- **存储引擎**: 启用 WAL 模式的 SQLite。
- **数据结构**: 时间三元组 `(Subject, Predicate, Object) + Context Tags`。
- **检索机制**: 纯原生的 `FTS5` 全文本检索（带 Porter 词干提取触发器）。提供毫秒级响应，完全抛弃了笨重的向量数据库（如 ChromaDB）带来的部署负担。
- **通信协议**: 原生支持 MCP Server 协议 (`@modelcontextprotocol/server`)。

## 🚀 核心特性
1. **语义时间三元组**: 强制 AI 以严格结构存储事实，极大降低检索时的幻觉匹配。
2. **自动记忆提取 (`memorix_auto_memorize`)**: 智能体只需将大段非结构化文本扔给该 MCP 工具，系统会在底层自动提取三元组并落库，大幅降低大模型的推理和 Token 输出压力。
3. **无损数据迁移**: 通过 `PRAGMA user_version` 实现数据库表结构的平滑升级，告别暴力的表重建。
4. **终端可视化**: 提供 `npm run view` 命令行工具，通过 ASCII 表格直观展示记忆图谱，实现“机器写，人类看”的观测闭环。

## 💻 典型业务场景
- **跨会话连续性**: 记住用户的偏好、操作系统环境变量或特定项目的编译规则。
- **子智能体日志脱水**: 调度者 Agent 将任务委派给编码 Agent。调度者无需阅读 500 行的原始输出，直接调用 `memorix_auto_memorize` 将架构改动固化为事实，随后丢弃无用日志。

## 🛠 使用指南 (面向 AI 与人类)

### 安装与启动
```bash
npm install -g memorix
# 作为 MCP Server 启动
npm run mcp
# 人类审查数据库
npm run view -- --format table
```

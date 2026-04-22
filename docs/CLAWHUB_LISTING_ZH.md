# Memorix ClawHub 上架素材（中文）

更新时间：2026-04-22

## 1) 标题（推荐用第一条）

1. Memorix：长周期 Agent 的上下文压缩与持久记忆标准 Skill（推荐）
2. Memorix：OpenClaw 长会话防失忆引擎（SQLite + FTS5）
3. Memorix：零外部依赖的 Agent 记忆治理与上下文压缩

## 2) 一句话介绍（Short Description）

Memorix 为 OpenClaw 等 Agent 提供“自动压缩 + 可审计持久记忆 + 冲突治理”，在长周期会话中显著降低上下文爆炸与记忆丢失风险。

## 3) 详情介绍（Long Description）

Memorix 是一个标准化、零外部服务依赖的记忆 Skill，专门解决复杂任务和长周期持续会话中的三类核心问题：

- 上下文窗口被日志与中间过程挤爆
- 任务跨阶段后关键信息回忆不稳定
- 记忆更新后出现冲突、漂移与“伪一致”

Memorix 基于 `SQLite + FTS5 + 时间三元组`，提供可落地的治理闭环：

- 主动上下文压缩建议：在风险上升前触发压缩，而不是等爆炸后补救
- 一键压缩执行管线：recommend -> compact -> telemetry 的闭环
- 冲突检测与修复：支持 single/multi 谓词策略和回滚
- 自动策略推断：不向用户暴露复杂档位，系统按健康度和历史表现自适应
- 一致性校验：治理操作后自动进行一致性检查

相较同类方案，Memorix 的优势是：

- 低依赖、稳定易落地：不强依赖 Redis/Qdrant/Ollama 等外部组件
- 强审计：`valid_from/valid_to` 全量可追溯
- 高可控：支持 dry-run / apply 与幂等键
- 易接入：标准 MCP 工具接口，可直接纳入现有 Agent 流程

## 4) 关键词 / 标签（建议 8-12 个）

- memory
- context-compaction
- openclaw
- mcp
- long-session
- governance
- contradiction-resolution
- sqlite
- fts5
- persistence
- agent-reliability
- skill

## 5) 分类建议

- Primary: Memory
- Secondary: Productivity / Agent Ops

## 6) 冲榜定位（Top 3）

- 定位语："不是又一个记忆插件，而是长会话可靠性治理层"
- 差异化："自动策略推断 + 治理闭环 + 回滚可审计"
- 关键词策略：覆盖 "context", "memory", "openclaw", "compaction", "long-session"

## 7) 发布后 14 天行动清单

1. D1: 发布 v2.1.0，完善首屏描述和 3 条可复制示例。
2. D2-D3: 根据用户反馈补充 FAQ（尤其是“何时触发压缩”）。
3. D4-D7: 发 v2.1.1（文档与默认阈值微调）。
4. D8-D14: 发 v2.2.0（加入更多可解释的健康指标输出）。

## 8) 建议用的发布参数

- slug: `memorix`
- display name: `Memorix`
- version: 与 `package.json` 一致（当前 2.1.0）
- changelog: `Production release: adaptive compaction + governance + safety hardening`

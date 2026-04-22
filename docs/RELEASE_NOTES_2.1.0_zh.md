# Memorix v2.1.0 发布说明（中文）

发布日期：2026-04-21

## 版本定位

v2.1.0 是面向长周期 Agent 会话的重设计迭代版本，重点解决：

- 上下文爆炸导致的 token 成本失控
- 记忆漂移与重复写入导致的事实冲突
- 长期运行后的记忆健康退化与不可观测
- 与 OpenClaw 工作流互操作不足

## 核心新增能力

### 1) 上下文压缩与回注

- 新增 `memorix_get_context_pack`
- 输出高信号紧凑文本，支持 query/subject/tag 过滤和每主题上限
- 适用于 compaction 后的快速上下文恢复

### 2) 策略化写入与反漂移

- `replace_existing` 已接入单条/批量/自动抽取写入链路
- 默认去重活跃完全重复事实
- 新增“单值谓词”策略（如 `status`/`state`/`location` 等）支持“最新事实优先”

### 3) 质量评分与晋升候选

- 检索结果新增 `quality_score`
- 新增 `memorix_rank_promotion_candidates`，输出可重复的晋升候选排序（`promotion_score`）

### 4) 冲突治理与运维

- 新增冲突工具：
  - `memorix_detect_contradictions`
  - `memorix_resolve_contradiction`
- 新增运维工具：
  - `memorix_get_health_report`
  - `memorix_run_maintenance_sweep`（支持 `dry_run`）

### 5) OpenClaw Markdown 互操作

- `memorix_import_markdown`
- `memorix_export_markdown`
- 可在结构化记忆与 OpenClaw 文件记忆工作流之间双向衔接

## 数据层升级

- Migration v2：新增 `predicate_policies` 表
- 支持谓词策略持久化，避免重启后策略丢失

## 工具总览（v2.1.0）

1. `memorix_store_fact`
2. `memorix_store_facts`
3. `memorix_search_fts`
4. `memorix_invalidate_fact`
5. `memorix_query_history`
6. `memorix_trace_relations`
7. `memorix_auto_memorize`
8. `memorix_get_context_pack`
9. `memorix_import_markdown`
10. `memorix_export_markdown`
11. `memorix_get_predicate_policies`
12. `memorix_set_predicate_policy`
13. `memorix_detect_contradictions`
14. `memorix_resolve_contradiction`
15. `memorix_rank_promotion_candidates`
16. `memorix_get_health_report`
17. `memorix_run_maintenance_sweep`

## 验证结论

- `npm run build` 通过
- `npm run test` 通过
- 当前测试覆盖：12 个核心用例（查询构造、评分、冲突、策略、解析与选择逻辑）

## 升级建议

- 升级后先执行一次 `memorix_get_health_report`
- 对关键可变谓词明确设置策略（`single`/`multi`）
- 先以 `dry_run` 方式执行 `memorix_run_maintenance_sweep`，确认无误再 apply

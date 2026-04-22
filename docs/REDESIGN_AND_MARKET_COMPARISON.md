# Memorix 重设计与 OpenClaw 市场对比

日期：2026-04-21

## 1) 问题定义

Memorix 正在重设计为标准化 Skill，目标是缓解以下核心问题：

- 长周期 Agent 会话中的上下文爆炸
- 压缩/裁剪后记忆漂移与丢失
- 反复回放原始日志造成的 token 浪费
- 多步骤工作流中的召回质量不稳定

目标适配范围包含 OpenClaw 及同类 Agent 运行时。

## 2) 当前迭代升级（已在本仓库实现）

### A. 上下文压缩 API

- 新增 `memorix_get_context_pack`
- 从活跃事实中输出分组后的高信号紧凑文本
- 支持 query/tag/subject 过滤与每个 subject 的上限控制

价值：在受限上下文窗口里提供确定性的记忆摘要，避免重放大体积原始记忆内容。

### B. 写入路径的漂移与重复控制

- `memorix_store_fact` 支持 `replace_existing`
- `memorix_store_facts` 支持批量级 `replace_existing`
- `memorix_auto_memorize` 支持 `replace_existing`
- 默认对“活跃且完全相同”的事实去重

价值：抑制活跃记忆膨胀，并允许调用方对可变谓词采用“最新事实优先”的策略。

### C. 稳定性与可测试性

- 增加工具函数级别测试（`node --test`）
- 导出核心构建函数，支持可重复的回归验证

### D. 策略注册与冲突治理

- 新增谓词策略注册工具（读取/设置 single vs multi）
- 新增冲突检测与冲突修复工具（针对单值谓词）
- 新增晋升候选排序工具（deterministic promotion candidates）

## 3) OpenClaw 官方基线（必须兼容）

根据 OpenClaw 官方文档：

- 记忆事实来源是磁盘 Markdown 文件（`MEMORY.md`、`memory/YYYY-MM-DD.md`、可选 `DREAMS.md`）
- 默认记忆工具是 `memory-core` 提供的 `memory_search` + `memory_get`
- Compaction 前会自动 memory flush，减少上下文丢失
- ClawHub 是官方注册中心，`openclaw skills search/install/update` 安装到工作区 `skills/`

对 Memorix 的含义：

- Memorix 应作为“结构化记忆侧车”，而不是替代核心 Markdown 记忆模型
- 需要与 compaction 安全流程协同（紧凑上下文包 + 明确的晋升策略）

## 4) ClawHub 同类 Skill 快照（市场定位）

在 ClawHub 上，记忆类能力大致可分为：

- 纯指令型文件记忆整理（简单易装，但检索质量有限）
- 本地数据库 + embedding 的混合记忆（召回更强，但依赖更多）
- 多层记忆栈（Markdown + 向量 + 图），运维复杂度更高
- 面向安全/审计的记忆扫描器

常见权衡：

- 能力越丰富，通常越依赖额外运行时/服务（如 Redis/Qdrant/Ollama/Python）
- 部分条目存在元数据与依赖声明不一致，或安全扫描提示风险
- Skill 行为过于隐式、边界不清时，Agent 稳定性会下降

Memorix 的差异化方向：

- 确定性、零外部服务核心（`SQLite + FTS5`）
- 可审计的时间三元组模型
- 专为长会话 token 预算设计的 context pack 原语
- 通过可选替换策略控制漂移，避免一刀切语义

## 5) 重设计路线图（建议）

### 阶段 1（当前）

- 稳定紧凑检索与写入语义
- 在 SKILL 协议中明确策略参数
- 提供查询构建与上下文压缩的基线测试

### 阶段 2

- 增加谓词策略注册表（单值 vs 多值）
- 增加记忆质量评分（置信度、新鲜度、来源可靠性）
- 增加确定性“晋升管线”（从噪声事件到 durable facts）

### 阶段 3

- 增加可选混合检索适配层（向量后端作为插件，而非硬依赖）
- 增加矛盾检测与修复工具链
- 增加与 OpenClaw Markdown 记忆文件互操作的导入导出管线

## 6) 对比矩阵（高层）

| 维度 | OpenClaw 内建记忆 | ClawHub 典型记忆 Skill | Memorix（本次重设计） |
|---|---|---|---|
| 主存储 | Markdown 文件 | 不固定（markdown/DB/混合） | SQLite 时间三元组 |
| 检索方式 | memory_search/memory_get | 不固定，常见语义优先 | FTS5 + context pack |
| 长会话 token 控制 | 依赖 runtime 的 flush + compaction | 各 Skill 差异较大 | 显式 `memorix_get_context_pack` |
| 历史可审计性 | 主要依赖文件历史 | 不固定 | 原生 `valid_from/valid_to` |
| 依赖复杂度 | 低到中 | 低到高 | 低（零外部服务） |
| 更新策略控制 | 以行为约定为主 | 不固定 | 显式 `replace_existing` |

## 7) 参考链接

官方文档：

- OpenClaw Memory Overview: https://docs.openclaw.ai/concepts/memory
- OpenClaw Skills: https://docs.openclaw.ai/tools/skills
- OpenClaw ClawHub docs: https://docs.openclaw.ai/tools/clawhub
- OpenClaw CLI skills: https://docs.openclaw.ai/cli/skills

ClawHub 条目（用于市场快照示例）：

- https://clawhub.ai/skills/memory
- https://clawhub.ai/atlaspa/openclaw-memory
- https://clawhub.ai/fatcatMaoFei/openclaw-enhanced-memory
- https://clawhub.ai/jakebot-ops/persistent-memory
- https://clawhub.ai/skills/openclaw-advanced-memory

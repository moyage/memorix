# Memorix 多 Sub-Agent Fleet 管理指南（OpenClaw）

更新时间：2026-04-23

## 目标

把“新增/删除 sub-agent”从手工操作变成标准命令：

- 自动安装 skill 实体目录（workspace/skills/memorix）
- 自动注册独立 MCP server 名称（避免互相覆盖）
- 默认每个 sub-agent 独立 DB（降低串扰）

## 新增能力

```bash
npm run openclaw:fleet -- add <agent_id> <workspace_path> [role]
npm run openclaw:fleet -- list
npm run openclaw:fleet -- reconcile
npm run openclaw:fleet -- remove <agent_id>
```

## 默认策略

- skill 名：`memorix`
- mcp server 名：`memorix-<agent_id>`
- DB 路径：`<workspace>/skills/memorix/memorix-<agent_id>.db`
- 角色：默认 `omoc`（可填 `hermes`）

## 工作机制

### add

1. materialize + install skill 到该 agent workspace
2. `openclaw mcp set` 注册 `memorix-<agent_id>`
3. 写入 fleet registry：`.memorix-fleet/agents.json`

### remove

1. 从 registry 删除 agent
2. 尝试 `openclaw mcp unset memorix-<agent_id>`

### reconcile

对 registry 中所有 agent 重新执行 install + mcp set，用于配置漂移修复。

## 注意事项

- 若 `openclaw mcp set/unset` 报 `EPERM`，说明当前执行环境无权写 `~/.openclaw/openclaw.json`。
- 这种情况下请在可写配置的终端执行，或回退到 snippet 手工粘贴。

## 推荐实践

- 执行型 agent 用 `omoc` allowlist
- 审查/治理型 agent 用 `hermes` allowlist
- 周期运行 `reconcile` 防止长期漂移

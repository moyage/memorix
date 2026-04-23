# OpenClaw 集成当前状态（安装 vs 可用）

更新时间：2026-04-23

## 结论

- `openclaw skills check` 识别到 memorix：说明 skill 实体安装路径已正确。
- 若显示 `Missing requirements: MEMORIX_DB_PATH`：历史版本 frontmatter 把 DB 路径声明成了硬依赖。
- 自本版本起，`MEMORIX_DB_PATH` 已降级为可选（默认使用 skill 目录内 `memorix.db`）。

## 从“已安装”到“可调用”还需两步

1. Skill 实体目录就位（已完成）
2. MCP server 接线（必须）

## 推荐操作（优先 CLI 接线）

```bash
# 1) 安装实体 skill 包到 workspace
npm run openclaw:install -- /ABS/PATH/TO/openclaw-workspace memorix

# 2) 用 OpenClaw CLI 直接注册 mcp.servers（尽量避免手工粘贴）
npm run openclaw:mcp-set -- /ABS/PATH/TO/openclaw-workspace memorix
```

若出现 `EPERM`/`operation not permitted`，说明当前执行上下文无权写入 `~/.openclaw/openclaw.json`，需在允许写该配置的终端环境执行。

若你的环境仍受保护路径策略影响导致 `openclaw mcp set` 失败，再退回：

```bash
npm run openclaw:mcp-snippet -- /ABS/PATH/TO/openclaw-workspace memorix
```

并手工粘贴。

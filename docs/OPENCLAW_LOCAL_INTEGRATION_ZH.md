# OpenClaw 本地个人域接入指南（处理 protected path + skills root 限制）

更新时间：2026-04-23

## 背景

当 OpenClaw skills loader 拒绝 `workspace/skills` 之外的 symlink 时，`~/Programs/memorix` 不能直接被扫描为 skill。正确做法：

1. 将 skill 实体复制到工作区 `skills/` 内（非符号链接）
2. 将 Memorix 作为 MCP server 注册到 `mcp.servers`
3. 在 agent 路由层配置 tool allowlist（OMOC/Hermes 分流）

> 注意：本流程是“工作区兼容集成方案”，不是 `openclaw skills install <slug>` 的标准市场安装闭环。

## 1) 复制安装到 workspace/skills（绕过 symlink 限制）

可先物化最小标准 skill 包：

```bash
npm run openclaw:materialize
```

```bash
npm run openclaw:install -- /ABS/PATH/TO/your-openclaw-workspace memorix
```

## 2) 生成 MCP servers 配置片段（手工粘贴）

> 注：若 `mcp.servers` 是 protected path，需手工在允许入口粘贴。

```bash
npm run openclaw:mcp-snippet -- /ABS/PATH/TO/your-openclaw-workspace memorix
```

可额外指定 DB 路径（第三参数）：

```bash
npm run openclaw:mcp-snippet -- /ABS/PATH/TO/your-openclaw-workspace memorix /ABS/PATH/TO/memorix.db
```

## 3) 生成 Agent 工具白名单（OMOC/Hermes）

```bash
npm run openclaw:allowlists
```

将输出 JSON 填到 OpenClaw agent 的 `allow_tools`。

## 4) 推荐运行时策略

```json
{
  "MEMORIX_TOOL_PROFILE": "auto",
  "MEMORIX_PREDICATE_WHITELIST_MODE": "warn"
}
```

生产环境建议：

- 将 `MEMORIX_PREDICATE_WHITELIST_MODE` 改为 `enforce`
- 补充 `MEMORIX_PREDICATE_WHITELIST`

## 5) 快速连通性验证

```bash
node /Users/mlabs/Programs/memorix/dist/server.js
```

如果 OpenClaw 已接入成功，应能在 agent 工具列表看到允许的 memorix tool 子集。

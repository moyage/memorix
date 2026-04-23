# Memorix 升级保障手册（老用户）

更新时间：2026-04-23

## 升级前（必须）

```bash
npm run upgrade:preflight
npm run upgrade:backup
```

如需连同 OpenClaw 工作区一起检查：

```bash
npm run upgrade:preflight -- /ABS/PATH/TO/openclaw-workspace
```

## 升级医生（检查或自动修复）

仅检查：

```bash
npm run upgrade:doctor
```

自动修复（会复制安装到 workspace/skills，避免 symlink 问题）：

```bash
npm run upgrade:doctor -- fix /ABS/PATH/TO/openclaw-workspace memorix
```

## 升级后回滚

回滚到最近一次备份：

```bash
npm run upgrade:rollback
```

回滚到指定时间点：

```bash
npm run upgrade:rollback -- 20260423-210000
```

## 说明

- `upgrade:doctor` 无法绕过 OpenClaw 受保护配置路径（如 `mcp.servers`）。
- 遇到 protected path 场景，请执行：

```bash
npm run openclaw:mcp-snippet
```

并手工粘贴到你可修改的 OpenClaw 配置入口。

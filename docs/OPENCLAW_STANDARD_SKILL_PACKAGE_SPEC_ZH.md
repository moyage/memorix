# Memorix 适配 OpenClaw 标准 Skill 安装的最小合规规范

更新时间：2026-04-23

## 先澄清一个关键点

基于 OpenClaw 官方技能文档，Skill 的最小单位是“技能目录 + `SKILL.md`（带 frontmatter）”，并不等同于 OpenClaw 插件（plugin）。

- Skill：AgentSkills 目录形态，`SKILL.md` 为核心
- Plugin：需要 `openclaw.plugin.json`，是另一套机制

因此，Memorix 当前应优先走 Skill 包合规，而不是强制按 Plugin 清单改造。

## 当前边界（必须明确）

当前迭代完成了“标准 skill 目录合规”和“实体内聚运行路径”，但尚未打通：

- `openclaw skills install memorix`（ClawHub 发布闭环）
- protected `mcp.servers` 场景下的全自动注册

也就是说：当前是**标准目录 + 手工配置补位**，不是市场标准安装全自动闭环。

## 最小合规目录（用于 workspace/skills/memorix）

```text
memorix/
  SKILL.md
  README.md
  README_zh.md
  CHANGELOG.md
  LICENSE
  dist/server.js
  package.json                # 可选元数据（非强制）
  openclaw.mcp.example.json   # 手工配置参考
```

注意：必须是实体目录，不能是指向 root 外部路径的 symlink。

## SKILL frontmatter 建议（已落地）

- `name`
- `description`
- `version`
- `metadata.openclaw.requires.env`
- `metadata.openclaw.requires.bins`
- `metadata.openclaw.homepage`

说明：`MEMORIX_DB_PATH` 当前为可选运行时变量，不再作为硬性 skill requirement。

## 安装与物化流程（本仓库）

1. 物化标准 skill 包：

```bash
npm run openclaw:materialize
```

默认输出：

```text
.release/openclaw-skill/memorix
```

2. 复制到 OpenClaw workspace（或直接用 install 脚本）：

```bash
cp -R ./.release/openclaw-skill/memorix /ABS/PATH/TO/workspace/skills/memorix
```

或：

```bash
npm run openclaw:install -- /ABS/PATH/TO/workspace memorix
```

3. 若 `mcp.servers` 是 protected path，先输出片段后手工粘贴：

```bash
npm run openclaw:mcp-set -- /ABS/PATH/TO/workspace memorix
```

如 CLI 接线被策略拦截，再回退：

```bash
npm run openclaw:mcp-snippet -- /ABS/PATH/TO/workspace memorix
```

4. 生成 OMOC/Hermes allowlist：

```bash
npm run openclaw:allowlists
```

## ClawHub 标准安装路径

如要实现真正的标准命令：

```bash
openclaw skills install memorix
```

则仍需要发布到 ClawHub 并通过其扫描与版本流程。

## 参考（官方）

- https://docs.openclaw.ai/tools/skills
- https://docs.openclaw.ai/cli/skills
- https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md

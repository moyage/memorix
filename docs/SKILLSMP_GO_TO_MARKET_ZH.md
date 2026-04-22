# SkillsMP 上架与冲榜执行指南（Memorix）

更新时间：2026-04-22

## 结论先说

SkillsMP 不是手动发布型市场。它会从公开 GitHub 仓库自动抓取并同步 Skill（含 `SKILL.md` 与仓库元数据）。

这意味着“上架动作”本质上是：

1. 把仓库做成可被高质量识别的标准 Skill 形态
2. 提升 GitHub 侧质量与活跃信号（Stars/Forks/更新频率）
3. 持续检查是否已被收录并修正索引信号

## 当前项目已具备的基础

- 根目录有标准 `SKILL.md`
- 文档齐全（README 中英、CHANGELOG）
- 具备构建与测试流程
- 已补齐仓库 `repository.url`
- 已加入 `skillsmp` 专用预检/探测脚本

## 推荐执行流程

1. 本地质量预检

```bash
npm run skillsmp:readiness
```

2. 推送最新代码到 GitHub（默认主分支）

```bash
git push origin main
```

3. 探测是否已被 SkillsMP 收录

```bash
npm run skillsmp:probe -- memorix moyage/memorix
```

4. 设置 GitHub Topics（必须）
- `claude-skills` 或 `claude-code-skill`（官方 FAQ 建议）

5. 若未收录，继续增强可发现性后等待同步窗口
- 保持每周小版本更新
- 增加英文示例与真实使用案例
- 在 README 首屏突出核心关键词：`memory`, `context compaction`, `openclaw`, `long-session`

## Top 3 实战建议（30天）

1. 周更节奏：每 5-7 天一次小版本（含可见改进）
2. 首屏价值表达：把“自动压缩 + 记忆治理 + 可回滚”放在首段
3. 示例驱动：至少 3 个可复制的生产场景（长会话、冲突修复、治理周期）
4. 稳定优先：保持测试全绿，避免“功能多但不稳”
5. 社区信号：发布后邀请真实用户留星与反馈，优先提升 GitHub 侧权重

## 备注

- 如果 SkillsMP 后续开放人工提交入口，再补充 `skillsmp_publish_safe.sh` 即可。
- 当前阶段最有效杠杆是 GitHub 仓库质量和活跃度，而不是平台内手动参数。

## 参考

- https://skillsmp.com/docs/faq
- https://skillsmp.com/docs/api
- https://skillsmp.com/about

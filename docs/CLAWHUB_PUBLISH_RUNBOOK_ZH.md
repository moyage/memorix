# ClawHub 发布执行手册（ZH）

## 0) 先决条件

- 已安装 `clawhub` CLI
- 已完成登录：`clawhub login` 或 `clawhub login --no-browser --token <token>`

## 1) 发布前验收

```bash
npm run clawhub:verify
```

## 2) Dry Run（推荐先跑）

```bash
CLAWHUB_DRY_RUN=1 npm run clawhub:publish
```

## 3) 正式发布

```bash
CLAWHUB_SLUG=memorix \
CLAWHUB_NAME="Memorix" \
CLAWHUB_CHANGELOG="Production release: adaptive compaction + governance + safety hardening" \
npm run clawhub:publish
```

## 4) 发布后复核

```bash
clawhub inspect memorix
```

并检查页面：

- https://clawhub.ai/skills/memorix

## 5) 常见阻塞

1. `Not logged in`：先执行 `clawhub login`
2. 浏览器回调失败：改用 token 登录
3. 网络失败：确认代理/网络策略允许访问 `clawhub.ai`

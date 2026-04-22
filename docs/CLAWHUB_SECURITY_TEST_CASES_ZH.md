# ClawHub 上架安全测试用例（Memorix）

更新时间：2026-04-22

## 测试目标

确保发布包满足“最小权限、无敏感信息、行为可解释、依赖声明一致”。

## A. 敏感信息泄露

1. Case A1: 扫描 Token/Key/Secret
- 目的：防止硬编码凭据进入发布包
- 检查：`clawhub:security` 中的凭据正则扫描
- 通过标准：无命中

2. Case A2: 本地绝对路径泄露
- 目的：防止泄露用户名/机器目录
- 检查：扫描 `/Users/`, `/home/`, `C:\\Users\\`
- 通过标准：无命中

## B. 危险执行链

3. Case B1: 阻断 `curl|bash`、`wget|sh`
- 目的：防止引导用户执行远程不透明脚本
- 检查：脚本目录 grep
- 通过标准：无命中

4. Case B2: 阻断隐式高危命令
- 目的：避免未声明的破坏性操作
- 检查：发布脚本不允许 `rm -rf /`、`sudo` 等模式
- 通过标准：无命中

## C. 依赖与声明一致性

5. Case C1: 运行时依赖可验证
- 目的：避免“文档说无需依赖，运行时却缺工具”
- 检查：`clawhub:preflight` 对 node/npm/clawhub 工具检查
- 通过标准：依赖检查通过

6. Case C2: 版本一致
- 目的：避免 `package.json` 与发布版本不一致
- 检查：发布脚本读取并校验版本参数
- 通过标准：一致

## D. 功能完整性回归

7. Case D1: build/test 必须通过
- 命令：`npm run build && npm run test`
- 通过标准：均通过

8. Case D2: 关键文档存在
- 检查：`SKILL.md`, `README.md`, `README_zh.md`, `CHANGELOG.md`
- 通过标准：文件齐全

## E. 发布后复核

9. Case E1: 远端 inspect 可见
- 命令：`clawhub inspect memorix`
- 通过标准：返回最新版本

10. Case E2: 页面与元数据一致
- 目的：确认标题/描述/标签与本地发布参数一致
- 通过标准：人工复核通过

## 建议执行顺序

1. `npm run clawhub:verify`
2. `npm run clawhub:publish`（含安全预检）
3. `clawhub inspect memorix`

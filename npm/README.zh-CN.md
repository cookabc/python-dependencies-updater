# NPM 依赖更新器

[English](README.md) · **简体中文**

在 `package.json` 里直接显示版本提示并一键升级，同时标出破坏性变更，状态栏给出汇总。

[![Marketplace Version](https://vsmarketplacebadges.dev/version/cookabc.npm-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/cookabc.npm-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.npm-dependencies-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/cookabc/npm-dependencies-updater/actions/workflows/ci.yml/badge.svg)](https://github.com/cookabc/npm-dependencies-updater/actions/workflows/ci.yml)

## 功能

- **版本检测** — 扫描 `package.json`，按注册表实际状态显示每个依赖的版本情况。
- **风险分析** — 补丁与次要版本标为安全，主要版本单独标出，不混在安全更新里默认推荐。
- **一键更新** — 点 CodeLens 就地更新单个依赖。
- **批量更新** — 状态栏与命令面板可一次更新全部安全包，遇到主要版本先要确认。
- **识别 peerDependencies** — 会显示 peer 范围，但排除在「全部更新」之外，因为它表达的是宿主兼容窗口，不是一个锁定值。
- **可重试的检查失败** — 失败的查询会短暂负缓存，按需重试，不会每次滚动都重新打注册表。
- **智能缓存** — 注册表响应进缓存，编辑和滚动都不走网络。
- **作用域注册表** — 私有作用域可以各自配置注册表地址与令牌。
- **精确改写** — 更新落在依赖当前所在位置；复合范围保留上界，`OR` 范围只升第一个备选。
- **十种语言** — 界面文案通过 `package.nls.*.json` 本地化。

## 安装

```bash
code --install-extension cookabc.npm-dependencies-updater
```

或在扩展视图（Ctrl+Shift+X）里搜索「NPM Dependencies Updater」。

## 使用

1. 打开任意 `package.json`。
2. 每个依赖显示自己的状态：
   - `✓ Up to date` — 已经是最新版本。
   - `$(sync~spin) Checking...` — 正在查询注册表。
   - `$(arrow-up) Update to X.X.X` — 有安全更新可用。
   - `$(warning) Update to X.X.X Major` — 主要版本更新。
3. 状态栏汇总有多少包可以升级。
4. 从状态栏或命令面板执行「Update All」，只升级安全的那些（peerDependencies 跳过）。
5. 查询失败时 CodeLens 会显示错误，点一下即重试。

## 配置项

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `npmDeps.enabled` | `true` | 启用或禁用扩展 |
| `npmDeps.showPrerelease` | `false` | 选择最新版本时是否包含预发布版本 |
| `npmDeps.cacheTTLMinutes` | `60` | 缓存过期时间（分钟） |
| `npmDeps.registryUrl` | `https://registry.npmjs.org` | 自定义注册表地址 |

## 项目结构

```
src/
├── core/
│   ├── cache.ts             # 注册表响应缓存
│   ├── dependencySpec.ts    # 范围解析与升级规则
│   ├── locateDependency.ts  # 定位依赖在文档中的当前位置
│   ├── packageJsonParser.ts # package.json 解析
│   ├── registryConfig.ts    # 作用域注册表地址与令牌
│   └── versionResolver.ts   # 版本风险分析与解析
├── providers/
│   ├── codeLensProvider.ts  # CodeLens 条目
│   ├── hoverProvider.ts     # 悬停摘要
│   ├── npmClient.ts         # 注册表客户端
│   └── versionService.ts    # 版本服务
├── utils/
│   ├── i18n.ts              # 语言查找
│   ├── logger.ts            # 输出通道日志
│   └── statusBar.ts         # 状态栏管理
├── types/index.ts
├── test/                    # Mocha 单元测试
└── extension.ts             # 扩展入口
```

## 开发

```bash
npm install
npm run compile   # tsc
npm test          # mocha 'out/test/unit/**/*.test.js'
npm run lint      # biome check --write src
npm run uat       # 针对 scripts/uat-fixture 的端到端验证
```

## 发布

推送版本标签后，CI 会跑测试、发布到两个市场，并把 VSIX 附到 GitHub Release：

```bash
git tag v<package.json 里的版本号> && git push origin v<package.json 里的版本号>
```

发布使用 OIDC trusted publishing —— 在每个市场登记一次仓库与工作流即可，
不必把令牌存成 secret。`VSCE_PAT` / `OVSX_PAT` 仍然可用作回退。

本地手动发布（从 `.env` 读取 `VSCE_PAT` / `OVSX_PAT`）：

```bash
./publish.sh all    # 两个市场都发
./publish.sh vsx    # 只发 VS Code Marketplace
./publish.sh ovsx   # 只发 OpenVSX
```

## 许可

MIT，详见 [LICENSE](LICENSE)。

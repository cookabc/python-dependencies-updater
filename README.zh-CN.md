# Python 依赖更新器

[English](README.md) · **简体中文**

在 `requirements.txt` 与 `pyproject.toml` 里直接显示版本提示并一键升级，同时标出破坏性变更，状态栏给出汇总。

[![Marketplace Version](https://vsmarketplacebadges.dev/version/cookabc.python-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-dependencies-updater)
[![Downloads](https://vsmarketplacebadges.dev/downloads-short/cookabc.python-dependencies-updater.svg)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-dependencies-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/cookabc/python-dependencies-updater/actions/workflows/ci.yml/badge.svg)](https://github.com/cookabc/python-dependencies-updater/actions/workflows/ci.yml)

## 功能

- **两种格式** — 读取 `requirements.txt` 与 `pyproject.toml`。
- **PEP 621、PEP 735 与 Poetry** — `[project.dependencies]`、
  `[project.optional-dependencies]`、`[dependency-groups]` 与
  `[tool.poetry.dependencies]`（含 dev 与 group 表）都支持。
- **版本检测** — 每个依赖都按 PyPI 实际状态显示版本情况。
- **风险分析** — 补丁与次要版本标为安全，主要版本单独标出。
- **一键更新** — 点版本提示即可把该依赖升到当前允许的最新版本。
- **尊重原有约束** — 沿用依赖自己的写法（`==`、`>=`、`~=`、`==1.2.*` 通配、环境标记、Poetry 的 `^`/`~`）。
- **漏洞检查** — 精确版本会对照 OSV.dev 检查并在原地标出。
- **悬停详情** — 悬停依赖可看 PyPI 摘要与最新发布版本。
- **批量更新** — 状态栏与命令面板可一次升级全部安全包，主要版本另需确认。
- **智能缓存** — PyPI 响应进缓存，编辑时不走网络。
- **十种语言** — 界面文案通过 `package.nls.*.json` 本地化。

## 安装

```bash
code --install-extension cookabc.python-dependencies-updater
```

或在扩展视图（Ctrl+Shift+X）里搜索「Python Dependencies Updater」。

## 使用

### requirements.txt

1. 打开任意 `requirements.txt`。
2. 每个依赖显示自己的状态：
   - `✓ Up to date` — 已经是最新版本。
   - `↗ Update to X.X.X` — 有安全更新可用。
   - `⚠️ Update to X.X.X Major` — 主要版本更新。

### pyproject.toml

支持 PEP 621 的 `[project]` 依赖、`[project.optional-dependencies]` 可选依赖组，
以及 PEP 735 的 `[dependency-groups]`，状态提示与更新操作完全一致。

Poetry 项目同样支持：`[tool.poetry.dependencies]`、
`[tool.poetry.dev-dependencies]` 与 `[tool.poetry.group.<名称>.dependencies]`
都会被读取，Poetry 的 `^`/`~` 约束会先换算成对应的 PEP 440 区间再解析版本。
只给出 `git` 或 `path` 来源的依赖会被跳过，`python` 也会忽略，因为它约束的是
解释器而不是某个包。

多行与单行的依赖数组都能处理，且每条依赖就地改写，不影响同一行上的其他条目。

### 漏洞检查

每个精确固定到某个版本的依赖（`==1.2.3`）都会对照 [OSV.dev](https://osv.dev)
检查。存在公告时依赖旁会出现盾牌提示、状态栏变红；点击可列出公告及其严重度，
选中即可在 osv.dev 上打开。

只检查精确版本。`>=2.0` 或 `~=4.2` 这类范围约束只说明允许哪些版本，并不代表
实际装的是哪一个，检查它只会报出用户可能根本不会遇到的漏洞。整个检查可以用
`pyDepsHint.checkVulnerabilities` 关掉。

### 批量更新

从命令面板执行「Update All Packages」，或点状态栏的提示。安全更新与主要版本更新会
分开处理，主要版本需要额外确认。

## 配置项

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `pyDepsHint.enabled` | `true` | 启用或禁用扩展 |
| `pyDepsHint.showPrerelease` | `false` | 是否包含预发布版本 |
| `pyDepsHint.cacheTTLMinutes` | `60` | 缓存过期时间（分钟） |
| `pyDepsHint.supportPyProject` | `true` | 是否启用 `pyproject.toml` 支持 |
| `pyDepsHint.checkVulnerabilities` | `true` | 是否对照 OSV.dev 检查精确版本 |
| `pyDepsHint.registryUrl` | `https://pypi.org` | 暴露 PyPI JSON API 的自定义注册表 |

## 项目结构

```
src/
├── core/
│   ├── batchUpdate.ts     # 批量更新编排
│   ├── cache.ts           # 响应缓存
│   ├── packageName.ts     # 发行包名归一化
│   ├── parser.ts          # requirements.txt 解析
│   ├── pep440.ts          # PEP 440 版本比较
│   ├── pyprojectParser.ts # pyproject.toml 解析（PEP 621/735、Poetry）
│   ├── unifiedParser.ts   # 两种格式的统一接口
│   ├── versionAnalyzer.ts # 版本风险分析
│   ├── versionResolver.ts # 版本解析
│   └── vulnerabilityScan.ts # 判定哪些精确版本可送 OSV 检查
├── providers/
│   ├── codeLensProvider.ts # CodeLens 条目
│   ├── hoverProvider.ts    # 悬停摘要
│   ├── osvClient.ts        # OSV.dev 客户端
│   ├── pypiClient.ts       # PyPI 客户端
│   └── versionService.ts   # 版本服务
├── utils/
│   ├── configuration.ts    # 配置读取
│   ├── dependencyUtils.ts  # 依赖相关的公共工具
│   ├── i18n.ts             # 语言查找
│   ├── logger.ts           # 输出通道日志
│   ├── statusBar.ts        # 状态栏管理
│   └── url-validator.ts    # 注册表地址校验
├── types/index.ts
├── test/                  # Mocha 单元测试
└── extension.ts           # 扩展入口
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

# Python Requirements Updater

Smart version management for Python requirements.txt files with one-click updates and breaking change detection.

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/cookabc.python-requirements-updater)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-requirements-updater)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/cookabc.python-requirements-updater)](https://marketplace.visualstudio.com/items?itemName=cookabc.python-requirements-updater)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 功能特性

- 🔍 **智能版本检测** - 自动识别 `requirements.txt` 文件并显示版本信息
- 🎯 **风险分析** - 区分安全更新（补丁/小版本）和风险更新（大版本）
- 🖱️ **一键更新** - 点击版本提示即可更新到最新版本
- ⚠️ **安全确认** - 大版本更新时显示确认对话框，防止破坏性变更
- 📊 **状态栏显示** - 实时显示可更新包的数量
- 🌍 **多语言支持** - 支持中文、英文、日文、韩文等多种语言
- 💾 **智能缓存** - 减少网络请求，提升响应速度

## 🚀 Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Python Requirements Updater"
4. Click Install

Or install from command line:
```bash
code --install-extension cookabc.python-requirements-updater
```

## 🚀 Usage

1. Open any `requirements.txt` file
2. The extension automatically shows status for each dependency:
   - `✓ Up to date` - Package is already latest version
   - `↗ Update to X.X.X` - Safe update available (click to update)
   - `⚠️ Update to X.X.X Major` - Major version update (use caution)

### Batch Updates

- Click the status bar update notification
- Or use Command Palette: `Ctrl+Shift+P` → "Update All Packages"
- Automatically separates safe updates from risky major version updates

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `pyDepsHint.enabled` | `true` | Enable/disable the extension |
| `pyDepsHint.showPrerelease` | `false` | Include pre-release versions |
| `pyDepsHint.cacheTTLMinutes` | `60` | Cache TTL in minutes |

## 🏗️ 项目结构

```
src/
├── core/           # 核心逻辑
│   ├── cache.ts           # 缓存管理
│   ├── parser.ts          # 依赖解析
│   ├── versionAnalyzer.ts # 版本风险分析
│   └── versionResolver.ts # 版本解析
├── providers/      # 服务提供者
│   ├── codeLensProvider.ts # CodeLens 提供者
│   ├── pypiClient.ts      # PyPI API 客户端
│   └── versionService.ts  # 版本服务
├── utils/          # 工具函数
│   ├── configuration.ts   # 配置管理
│   ├── i18n.ts           # 国际化
│   └── statusBar.ts      # 状态栏管理
├── types/          # 类型定义
│   └── index.ts
└── extension.ts    # 插件入口
```

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 运行测试
npm test

# 打包
npx vsce package
```

## 📄 License

MIT

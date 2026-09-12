# 工作助手（Work Assistant）

一款适配 Windows 的半透明悬浮待办面板，帮助你把每日要做的事情钉在桌面上。

![平台](https://img.shields.io/badge/platform-Windows-0078D4)
![技术栈](https://img.shields.io/badge/Electron-33+-47848F)
![版本](https://img.shields.io/badge/version-1.0.0-blue)
![许可](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 功能特性

- 📋 **每日待办面板** — 半透明悬浮在桌面，展示今日任务、完成进度和时间提醒
- 🔁 **多周期提醒** — 支持每天 / 每周 / 每月 / 单次 四种重复模式
- 🔔 **到点系统通知** — 每个任务可设置具体时间，到点弹出 Windows 系统通知
- 📌 **位置锁定** — 一键固定面板位置，防止误触拖走
- 🪟 **智能鼠标穿透** — 光标离开面板时自动穿透，让面板外区域的桌面图标可以点击
- 💾 **本地数据存储** — 所有任务和设置仅保存在本机 `%APPDATA%` 目录，不上传任何服务器
- 🚀 **开机自启** — 可选择随 Windows 开机自动启动
- 📦 **一键安装** — NSIS 安装程序，支持自定义安装目录

---

## 🖼️ 界面预览

> 以下为实际运行效果（半透明风格，适配暗色/亮色壁纸）：

| 悬浮面板 | 任务设置 | 系统托盘 |
| :---: | :---: | :---: |
| 顶部显示日期，中间任务列表，底部进度条 | 完整的任务 CRUD，支持时间、周期、备注 | 常驻托盘，可一键显示/隐藏、打开设置 |

---

## 🚀 快速开始

### 方式一：安装版（推荐普通用户）

下载最新的 `工作助手 Setup 1.0.0.exe`，双击运行即可。

### 方式二：开发运行

```bash
# 克隆仓库
git clone https://github.com/<your-username>/work-assistant.git
cd work-assistant

# 安装依赖（国内用户建议先设置镜像）
set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
npm install

# 开发模式运行
npm start

# 打包 NSIS 安装程序
npm run dist
```

> **打包提示**：如果项目路径包含中文，electron-builder 的 NSIS 打包可能失败（makensis 按 ANSI 解析参数）。解决方法是把整个项目（含 `node_modules`）**物理复制到纯英文路径**（如 `D:\dr-build\app`）再执行 `npm run dist`。

---

## 📂 目录结构

```
work-assistant/
├── main.js                 # 主进程：窗口创建、IPC、托盘、数据存储、鼠标穿透
├── preload.js              # 安全桥接：向渲染进程暴露受控 API
├── package.json
├── assets/
│   ├── icon.ico            # 应用图标（多尺寸）
│   ├── icon.png            # 图标 PNG 版本
│   └── tray.png            # 托盘图标
├── src/
│   ├── index.html          # 悬浮面板界面
│   ├── settings.html       # 设置窗口
│   ├── renderer.js         # 面板渲染逻辑（任务列表、固定按钮、拖动）
│   ├── settings.js         # 设置窗口逻辑
│   ├── styles.css          # 样式
│   └── shared/
│       └── reminder-utils.js  # 共享工具函数（周期计算、日期格式化等）
└── tools/
    └── gen-icon.js         # 零依赖图标生成脚本
```

---

## 🧠 技术实现要点

### 鼠标穿透（双保险方案）

透明悬浮面板需要让面板圆角外的区域能点击桌面图标，同时面板内的按钮必须可点。采用**主进程轮询 + 渲染层即时上报**的双保险设计：

1. **渲染层始终开启 `forward:true` 的穿透模式**（`setIgnoreMouseEvents(true, {forward:true})`），这样即使窗口处于穿透态，渲染层仍能收到 `mousemove` 事件
2. 光标一进入面板，渲染层立即通过 `panel:hover` IPC 通知主进程解除穿透——消除了"轮询间隙内快速点击被吞"的竞态
3. 主进程 60ms 轮询 `screen.getCursorScreenPoint()` 与窗口 bounds 求交作为兜底，防止渲染层失效时卡死在穿透态

### 固定按钮（位置锁定，与置顶解耦）

"固定"语义为**锁定窗口位置**：

- 渲染层：固定时移除 header 上的 `-webkit-app-region: drag` 类 → 无法拖动
- 主进程：固定时调用 `mainWindow.setMovable(false)` → Windows 层面也锁定

### 数据存储

- 数据目录：`%APPDATA%\work-assistant\tasks.json`
- 包含 `tasks`（任务列表）和 `settings`（opacity / autoStart / notify / pinned / bounds）
- 主进程内置从旧目录 `%APPDATA%\desktop-reminder` 的自动迁移

### Electron 镜像

国内用户安装/打包前建议设置：

```bash
set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
```

---

## 📝 许可证

[MIT License](LICENSE) © 2026

# 工作助手（Work Assistant）

一款适配 Windows 的半透明悬浮待办面板，帮助你把每日要做的事情钉在桌面上。

![平台](https://img.shields.io/badge/platform-Windows-0078D4)
![技术栈](https://img.shields.io/badge/Electron-33+-47848F)
![版本](https://img.shields.io/badge/version-1.3.0-blue)
![许可](https://img.shields.io/badge/license-MIT-green)
![下载](https://img.shields.io/github/v/release/jackie251818/work-assistant?display_name=tag&sort=semver)
[![Release](https://img.shields.io/badge/⬇️_下载-Releases-0ea5e9)](https://github.com/jackie251818/work-assistant/releases/latest)

---

## 功能特性

- **每日待办面板** — 半透明悬浮在桌面，展示今日任务、完成进度和时间提醒
- **多周期提醒** — 支持每天 / 每周 / 每月 / 单次 四种重复模式
- **到点系统通知** — 每个任务可设置具体时间，到点弹出 Windows 系统通知
- **一键收起为迷你长条** — 点 `—` 把整个面板缩成 340×34 的横向摘要条，只显示日期、待办统计和下一条任务；多条任务每 3 秒轮播；鼠标悬停自动弹出，空闲 N 秒自动收起（均可在设置中调整）
- **自动更新** — 基于 electron-updater + GitHub Releases，启动后自动检查新版本并在后台下载，完成后点一下通知即可重启安装；也可在设置页或托盘菜单手动检查
- **6 款内置皮肤** — 星云蓝 / 落日橙 / 森林翠 / 樱花粉 / 紫罗兰 / 水墨极简，设置页一键切换即时生效
- **防意外消失** — Win+D / 显示桌面等系统动作导致面板被隐藏时，250ms 内自动恢复；用户主动隐藏不受影响
- **位置锁定** — 一键固定面板位置，防止误触拖走
- **智能鼠标穿透** — 光标离开面板时自动穿透，让面板外区域的桌面图标可以点击
- **本地数据存储** — 所有任务和设置仅保存在本机 `%APPDATA%` 目录，不上传任何服务器
- **开机自启** — 可选择随 Windows 开机自动启动
- **一键安装** — NSIS 安装程序，支持自定义安装目录

---

## 界面预览

> 截图待补充，敬请期待 👀

| 悬浮面板 | 任务设置 | 系统托盘 |
| :---: | :---: | :---: |
| 顶部显示日期，中间任务列表，底部进度条 | 完整的任务 CRUD，支持时间、周期、备注 | 常驻托盘，可一键显示/隐藏、打开设置 |

---

## 技术栈

| 组件 | 技术 | 版本 | 说明 |
| :---: | :---: | :---: | :---: |
| 运行时 | Electron | 33+ | 跨平台桌面应用框架 |
| 打包 | electron-builder | 25+ | NSIS 安装程序 |
| 自动更新 | electron-updater | 6+ | 基于 GitHub Releases 的增量更新 |
| 构建语言 | Node.js | 18+ | 仅用于构建/打包，运行时由 Electron 内嵌 |
| 前端 | 原生 HTML/CSS/JS | — | 无框架依赖，零构建步骤 |
| 数据 | JSON 文件 | — | 存储于 `%APPDATA%\work-assistant\tasks.json` |

---

## 环境要求

- **操作系统**：Windows 10 / 11（64 位）
- **开发运行**：Node.js 18+、npm（可选，仅开发/打包时需要）
- **打包**：项目路径需为**纯英文**（中文路径会导致 NSIS makensis 失败）

---

## 快速开始

### 方式一：安装版（推荐普通用户）

👉 [前往 GitHub Releases 下载](https://github.com/jackie251818/work-assistant/releases/latest) 最新的 `work-assistant-setup-x.y.z.exe`，双击运行即可（支持覆盖安装，任务数据不受影响）。

**v1.3.0 起支持自动更新**：安装后应用会自动检测并后台下载新版本，下载完成后点一下通知即可重启安装，无需重新手动下载。仅 v1.2.0 及更早的用户需要最后一次手动安装 v1.3.0+。

### 方式二：开发运行

```bash
# 克隆仓库
git clone https://github.com/jackie251818/work-assistant.git
cd work-assistant

# 安装依赖（国内用户建议先设置镜像）
set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
npm install

# 开发模式运行
npm start

# 打包 NSIS 安装程序
npm run dist
```

> **打包提示**：
> - 如果项目路径包含中文，electron-builder 的 NSIS 打包会失败（makensis 按 ANSI 解析参数）。解决方法是把整个项目（含 `node_modules`）**物理复制到纯英文路径**（如 `D:\dr-build\app`）再执行 `npm run dist`。
> - 打包脚本已固化 `--publish never`（只在本地产包，不会误触发线上发布），产物为 `work-assistant-setup-x.y.z.exe` + `latest.yml` + `.blockmap`（自动更新三件套）。
> - **发布新版本到线上、让用户收到自动更新的完整步骤见 [docs/RELEASING.md](docs/RELEASING.md)。**

---

## 使用指南

### 悬浮面板

- **点击 📌 按钮** — 切换位置锁定。锁定后面板无法拖动，解锁后可自由拖动
- **点击 ⚙ 按钮** — 打开任务设置窗口，添加/编辑/删除待办事项
- **点击 — 按钮** — 收起为迷你长条（340×34），只保留日期、待办统计和下一条任务预览；再点 ▲ 或鼠标悬停可展开
- **按住面板头部拖动** — 移动面板位置（仅在解锁状态下可用）
- **点击任务左侧圆圈** — 标记完成 / 取消完成

### 收起 / 展开

> 可在设置 → 偏好设置中通过「启用收缩功能」开关整体关闭；关闭后 `—` 按钮变灰、面板不会自动收起。

| 行为 | 说明 |
| :---: | :--- |
| 点 `—` | 整个面板缩成横向迷你长条，其余区域完全透明 |
| 鼠标悬停长条 | 自动展开完整面板 |
| 展开后空闲 N 秒 | 自动收起（默认 8 秒，可在设置中调 3–60 秒） |
| 点长条上的 ▲ | 手动展开 |

### 皮肤主题

设置 → 偏好设置 → 面板皮肤，6 款配色一键切换，悬浮面板与设置窗口同时即时换肤：

| 皮肤 | 风格 |
| :---: | :--- |
| 星云蓝 | 青蓝 + 靛紫（默认） |
| 落日橙 | 暖橙 + 玫粉 |
| 森林翠 | 翠绿 + 黄绿 |
| 樱花粉 | 粉色 + 淡紫 |
| 紫罗兰 | 紫色 + 品红 |
| 水墨 | 黑白灰极简 |

### 系统托盘

右键托盘图标可：
- 显示 / 隐藏面板
- 打开设置窗口
- 检查更新 / 下载完成后重启安装新版本
- 切换开机自启
- 切换到点系统通知
- 退出程序

### 任务周期说明

| 周期 | 说明 | 示例 |
| :---: | :---: | :---: |
| 每天 | 每天都会出现在待办列表 | 喝水提醒、写日报 |
| 每周 | 指定周几出现（可多选） | 周一 / 周三 / 周五 |
| 每月 | 指定每月几号 | 每月 1 号发工资 |
| 单次 | 仅在指定日期出现一次 | 2026-10-01 提交报告 |

---

## 数据存储

所有数据保存在本机，路径：

```
%APPDATA%\work-assistant\tasks.json
```

文件格式示例：

```json
{
  "tasks": [
    {
      "id": "mtxu9cyikflh6k",
      "title": "示例：喝水提醒",
      "note": "久坐时起身活动一下，喝杯水",
      "repeat": "daily",
      "time": "10:00",
      "enabled": true,
      "done": { "2026-09-12": false }
    }
  ],
  "settings": {
    "opacity": 0.92,
    "autoStart": false,
    "notify": true,
    "panelVisible": true,
    "pinned": true,
    "theme": "nebula",
    "autoCollapse": true,
    "collapseDelay": 8,
    "bounds": { "x": 1563, "y": 126, "width": 340, "height": 540 }
  }
}
```

> **数据迁移**：从旧版本"桌面提示"升级时，主进程会自动将 `%APPDATA%\desktop-reminder\tasks.json` 迁移到新目录。

---

## 目录结构

```
work-assistant/
├── main.js                 # 主进程：窗口创建、IPC、托盘、数据存储、鼠标穿透、自动更新
├── preload.js              # 安全桥接：向渲染进程暴露受控 API
├── package.json
├── LICENSE
├── README.md
├── docs/
│   └── RELEASING.md        # 发布新版本的标准流程（打包→Release→验证→排错）
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

## 技术实现要点

### 鼠标穿透（双保险方案）

透明悬浮面板需要让面板圆角外的区域能点击桌面图标，同时面板内的按钮必须可点。采用**主进程轮询 + 渲染层即时上报**的双保险设计：

1. **穿透态开启 `forward:true`**（`setIgnoreMouseEvents(true, {forward:true})`），这样即使窗口处于穿透态，渲染层仍能收到 `mousemove` 事件
2. 光标一进入面板，渲染层立即通过 `panel:hover` IPC 通知主进程解除穿透——消除了"轮询间隙内快速点击被吞"的竞态
3. 主进程 60ms 轮询 `screen.getCursorScreenPoint()` 与窗口 bounds 求交作为兜底，防止渲染层失效时卡死在穿透态

非穿透态（光标在面板内）调用 `setIgnoreMouseEvents(false)`，窗口正常接收所有鼠标事件。

### 固定按钮（位置锁定）

"固定"语义为**锁定窗口位置**（与置顶解耦）：

- 渲染层：固定时移除 header 上的 `-webkit-app-region: drag` 类 → 无法拖动
- 主进程：固定时调用 `mainWindow.setMovable(false)` → Windows 层面也锁定

### Electron 镜像

国内用户安装/打包前建议设置：

```bash
set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
```

### 自动更新

- 更新源由 package.json `build.publish` 声明（GitHub Releases），打包时写入安装目录 `resources/app-update.yml`，无需内置任何 token
- 主进程 `initAutoUpdater()`（main.js）在启动 6 秒后静默检查：发现新版自动后台下载（有 blockmap 时走差分增量），完成后弹系统通知，点击即 `quitAndInstall()`；设置页与托盘菜单提供手动入口
- 状态机：`checking → available → downloading → downloaded`，另有 `not-available / error`；通过 IPC `update:status` 广播给设置窗口
- 用户主动操作才弹通知，静默检查失败只写 `debug.log`，不打扰日常使用
- 完整发布 SOP 见 [docs/RELEASING.md](docs/RELEASING.md)

---

## 常见问题

**Q：面板拖不动怎么办？**

A：看一下 📌 固定按钮是不是亮着。亮着表示已锁定，点一下解锁就能拖了。

**Q：按钮点了没反应？**

A：试试把鼠标移到面板上多停一会儿再点。理论上 forward:true 的 mousemove 转发会即时解除穿透，但如果遇到极端情况（如快速瞬移光标），主进程 60ms 轮询也会兜底。

**Q：换电脑后数据怎么迁移？**

A：把旧电脑 `%APPDATA%\work-assistant\tasks.json` 拷到新电脑同路径即可。

**Q：打包时报 NSIS makensis 错误？**

A：项目路径含中文时 electron-builder 的 NSIS 打包会失败（makensis 按 ANSI 解析参数）。解决方法：把整个项目物理复制到纯英文路径（如 `D:\dr-build\app`）再打包。

**Q：自动更新是怎么工作的？检查失败怎么办？**

A：应用启动后会从本仓库 GitHub Releases 拉取 `latest.yml` 判断是否有新版本（无需任何账号），发现新版自动后台下载，完成后通知你重启安装。更新包按 SHA-512 校验，且为当前用户级安装、不弹 UAC。若网络访问 GitHub 不畅导致检查失败，不会打扰使用，可稍后在设置页「关于与更新」手动重试，或直接到 [Releases](https://github.com/jackie251818/work-assistant/releases/latest) 下载安装包覆盖安装（任务数据不受影响）。注意 v1.2.0 及更早版本需要最后一次手动安装 v1.3.0，之后才能自动更新。

**Q：发新版 Release 时要上传哪些文件？**

A：三个文件缺一不可，且必须来自同一次打包、放在同一个正式 Release 中：`work-assistant-setup-x.y.z.exe`、`latest.yml`、`work-assistant-setup-x.y.z.exe.blockmap`（`latest.yml` 中的文件名必须与 Release 资产名逐字一致，不可手改）。完整的版本号规则、打包命令、Release 上传脚本和发布后验证步骤见 **[docs/RELEASING.md](docs/RELEASING.md)**。

---

## 贡献

欢迎对本项目提出改进建议和代码贡献！

### 开发流程

```bash
# 1. Fork 本仓库，克隆到本地
git clone https://github.com/<your-username>/work-assistant.git
cd work-assistant

# 2. 创建特性分支
git checkout -b feat/your-feature-name

# 3. 安装依赖并开发
npm install
npm start    # 开发模式运行

# 4. 提交并推送
git add .
git commit -m "feat: 你的改动描述"
git push origin feat/your-feature-name

# 5. 提交 Pull Request
```

### 代码风格

- 主进程和渲染层统一使用原生 JavaScript（ES2020）
- 渲染层无框架依赖，保持轻量
- IPC 通道命名采用 `模块:动作` 格式（如 `panel:pin`、`task:toggle`）

### 提交规范

推荐使用 Conventional Commits 格式：

| 前缀 | 说明 |
| :---: | :--- |
| `feat:` | 新功能 |
| `fix:` | 修复 Bug |
| `docs:` | 文档更新 |
| `refactor:` | 重构（不改变功能） |
| `chore:` | 构建/工具/依赖变更 |

### 发布新版本

维护者发版（升版本号 → 英文路径打包 → 上传 GitHub Release 三件套 → 发布后验证）的完整标准流程与排错手册：[docs/RELEASING.md](docs/RELEASING.md)。

---

## 更新日志

### v1.3.0 (2026-09-13)

- **新增：软件自动更新** — 启动 6 秒后静默检查 GitHub Releases，发现新版自动后台下载（支持差分增量更新），下载完成弹出系统通知，点击即重启安装；设置页「关于与更新」可查看版本、手动检查、查看下载进度；托盘菜单同步提供入口
- **修复：点桌面空白 / Win+D / 显示桌面后面板意外消失** — 三重防护：`minimize`/`hide` 事件即时恢复 + 250ms 看门狗兜底（实测外部 SW_HIDE 不触发 Electron 事件，只能靠看门狗，恢复耗时约 240ms）；用户主动隐藏（托盘菜单）不受影响
- 新增：收起迷你长条支持多条任务每 3 秒轮播（`1/3 ⏰10:00 任务名`，带淡入动画）
- 修复：tasks.json 带 UTF-8 BOM（如记事本保存）时数据被默认值覆盖的问题
- 注意：v1.2.0 及更早版本不含更新模块，需最后一次手动安装 v1.3.0；此后版本均可自动更新

### v1.2.0 (2026-09-13)

- **新增：6 款内置皮肤** — 星云蓝（默认）/ 落日橙 / 森林翠 / 樱花粉 / 紫罗兰 / 水墨极简，设置页一键切换，面板与设置窗口即时换肤
- 新增：收缩功能总开关 — 关闭后「—」按钮禁用，面板不收起；关闭时若处于收起态会自动展开
- 优化：全站样式变量化，面板背景、日期渐变、按钮、进度条、收起长条均跟随皮肤

### v1.1.0 (2026-09-12)

- **新增：一键收起为迷你长条** — 点 `—` 把整个面板缩成 340×34 横向摘要条，显示日期、待办统计和下一条任务
- 收起后鼠标悬停自动展开（可在设置中关闭）
- 展开后空闲 N 秒自动收起（默认 8 秒，设置中可调 3–60 秒）
- 修复：Electron 默认最小窗口高度导致 `setSize` 无法缩到 28px 的问题（收起前先 `setMinimumSize` 放开限制）

### v1.0.0 (2026-09-12)

- 初始版本发布
- 半透明悬浮面板，展示今日待办与进度
- 支持每天 / 每周 / 每月 / 单次 四种任务周期
- 位置锁定（固定按钮）
- 智能鼠标穿透（双保险方案）
- 系统托盘常驻
- 开机自启可选
- 本地 JSON 数据存储
- 从"桌面提示"旧版自动迁移数据

---

## 许可证

[MIT License](LICENSE) © 2026

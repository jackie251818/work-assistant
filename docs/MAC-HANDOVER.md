# 工作助手 Mac 适配交接文档

> 本文档供 Mac 上的 AI 助手阅读，用于完成 macOS 环境下的构建、测试和（可选）签名公证配置。

---

## 一、项目概况

| 项目 | 值 |
|:---|:---|
| 应用名称 | 工作助手 |
| 技术栈 | Electron 33 + 原生 JS（无框架） |
| 仓库 | `github.com/jackie251818/work-assistant` |
| appId | `com.trae.workassistant` |
| 当前版本 | 1.5.1 |
| Windows 包 | NSIS 安装程序（`work-assistant-setup-{version}.exe`） |
| Mac 包目标 | DMG + ZIP（`work-assistant-{version}-mac.{ext}`） |

### 应用特性

- **半透明悬浮面板**：无边框、透明背景、始终置顶、鼠标穿透
- **托盘常驻**：纯菜单栏应用，Mac 上隐藏 Dock 图标
- **数据存储**：`{appData}/work-assistant/tasks.json`（Mac 上即 `~/Library/Application Support/work-assistant/tasks.json`）
- **自动更新**：GitHub Releases（electron-updater），Mac 需上传 `zip` + `latest-mac.yml`

---

## 二、已完成适配（commit f09e307）

以下改动已在 Windows 开发机上完成并验证，**Mac 端无需再改代码**，只需构建。

### 2.1 main.js 平台判断

文件：`main.js`

```js
// 第 17-18 行：平台常量
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
```

**适配点一览：**

| 行号 | 代码 | 说明 |
|:---|:---|:---|
| 193 | `...(IS_WIN ? { thickFrame: false } : {})` | thickFrame 仅 Windows 设置，Mac 忽略 |
| 233-242 | `if (IS_WIN) { ... } else { updateTrayMenu(); }` | minimize 事件：Win 防系统动作隐藏，Mac 仅更新菜单 |
| 253-265 | `if (IS_WIN) { ... }` | hide 事件：Win 自动恢复意外隐藏，Mac 不处理 |
| 689-695 | `if (IS_WIN) { setAppUserModelId } else if (IS_MAC) { app.dock.hide() }` | Win 设通知 ID，Mac 隐藏 Dock |
| 717-729 | `if (IS_WIN) { setInterval(...) }` | 看门狗仅 Win 运行，Mac 无需 |

### 2.2 package.json Mac 打包配置

文件：`package.json`，`build.mac` 段：

```json
"mac": {
  "target": ["dmg", "zip"],
  "icon": "assets/icon.icns",
  "category": "public.app-category.productivity",
  "identity": null,
  "artifactName": "work-assistant-${version}-mac.${ext}"
}
```

- `identity: null` — **不签名**（用户无 Apple Developer 账号）
- `dmg` — 安装镜像
- `zip` — 自动更新用（electron-updater 在 Mac 上读取 zip + latest-mac.yml）

### 2.3 Mac 图标

文件：`tools/gen-icon.js` + `assets/icon.icns`

- `encodeICNS()` 函数生成 ICNS 格式（16/32/64/128/256/512）
- `assets/icon.icns` 已生成并提交

### 2.4 dist:mac 脚本

```json
"dist:mac": "electron-builder --mac --publish never"
```

---

## 三、Mac 上的操作步骤

### 3.1 环境准备

```bash
# 1. 克隆仓库（或从 Windows 同步代码到 Mac）
git clone https://github.com/jackie251818/work-assistant.git
cd work-assistant

# 2. 安装依赖
npm install

# 3. （可选）验证图标存在
ls -la assets/icon.icns
```

### 3.2 开发运行

```bash
npm start
```

**验证清单：**

- [ ] 面板正常显示（半透明、置顶）
- [ ] Dock 中无应用图标（`app.dock.hide()` 生效）
- [ ] 菜单栏托盘图标正常显示
- [ ] 点击托盘可展开/收起面板
- [ ] 添加/编辑/删除任务正常
- [ ] 记事本功能正常（📝 切换）
- [ ] 单条置顶功能正常（📌 按钮）
- [ ] 系统通知正常弹出（到点提醒）
- [ ] 设置窗口正常打开
- [ ] 开机自启功能可勾选（macOS 登录项）
- [ ] 鼠标穿透正常（面板外区域可点击穿透）

### 3.3 打包

```bash
npm run dist:mac
```

产物在 `dist/` 目录：

| 文件 | 用途 |
|:---|:---|
| `work-assistant-1.5.1-mac.dmg` | 安装镜像（手动安装） |
| `work-assistant-1.5.1-mac.zip` | 自动更新用（上传到 GitHub Release） |
| `latest-mac.yml` | Mac 自动更新元数据（上传到 GitHub Release） |
| `work-assistant-1.5.1-mac.dmg.blockmap` | 增量更新用 |

### 3.4 测试安装

```bash
# 挂载 DMG 安装
open dist/work-assistant-1.5.1-mac.dmg
# 将"工作助手"拖入 Applications
# 首次打开：右键 → 打开（绕过 Gatekeeper，因为未签名）
```

### 3.5 发布到 GitHub Release

Mac 版需要上传 **3 个文件**到与 Windows 版相同的 GitHub Release（或单独的 Mac Release）：

```bash
# 上传到 GitHub Release（需要 gh CLI 已登录）
gh release upload v1.5.1 \
  dist/work-assistant-1.5.1-mac.dmg \
  dist/work-assistant-1.5.1-mac.zip \
  dist/latest-mac.yml \
  --clobber
```

> **注意**：`latest-mac.yml` 必须上传，否则 Mac 客户端无法检查更新。
> `latest-mac.yml` 中的 `path` 和 `url` 必须与 Release 资产名完全一致。

---

## 四、Mac 特有注意事项

### 4.1 数据路径

Mac 上数据存储在：
```
~/Library/Application Support/work-assistant/tasks.json
```

等价于 Windows 的 `%APPDATA%/work-assistant/tasks.json`。

### 4.2 通知权限

macOS 需要用户授权通知权限：
- 首次发送通知时系统会弹授权弹窗
- 或在「系统设置 → 通知 → 工作助手」中手动开启
- 未签名应用的通知权限可能需要手动授予

### 4.3 开机自启

`app.setLoginItemSettings({ openAtLogin: true })` 在 macOS 上的行为：
- macOS 13+ (Ventura) 需要在「系统设置 → 通用 → 登录项」中手动确认
- 未签名应用的开机自启可能被系统阻止，需用户手动添加

### 4.4 鼠标穿透

代码使用 `setIgnoreMouseEvents(true, { forward: true })` 实现穿透：
- macOS 上此 API 正常工作
- 60ms 轮询检测光标位置（`updateMouseIgnore`），Mac 同样适用

### 4.5 窗口置顶

`mainWindow.setAlwaysOnTop(true, 'screen-saver')` 在 Mac 上：
- `screen-saver` 级别足够高，可以覆盖大多数应用
- 如果发现置顶不生效，可尝试改为 `'pop-up-menu'` 或 `'floating'`

### 4.6 托盘图标

当前使用 `assets/tray.png`（32x32 彩色图标）：
- macOS 菜单栏推荐使用模板图标（Template Image，单色，自动适配深/浅色模式）
- **可选优化**：生成 `trayMacTemplate.png`（纯白色透明背景），在代码中：
  ```js
  const icon = nativeImage.createFromPath(ASSET('trayMacTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  ```
- 这不是必须的，当前彩色图标也能正常显示

### 4.7 自动更新

electron-updater 在 Mac 上的工作机制：
- 读取 `latest-mac.yml`（而非 Windows 的 `latest.yml`）
- 下载 `zip` 格式的更新包
- 解压到临时目录，替换应用
- **未签名应用的自动更新可能受限**：macOS 可能阻止替换未签名应用
- 如自动更新不工作，可作为"手动下载更新"模式（通知用户去下载新版 dmg）

---

## 五、签名与公证配置（待用户获取 Apple Developer 账号后启用）

当前 `identity: null` 表示不签名。当用户获得 Apple Developer Program 资格后：

### 5.1 创建 Developer ID 证书

1. 登录 https://developer.apple.com/account
2. Certificates, Identifiers & Profiles → Certificates → +
3. 选择 **Developer ID Application**（不是 Mac App Store）
4. 按提示用 Keychain 创建 CSR，上传，下载 `.cer` 文件
5. 双击 `.cer` 文件导入 Keychain

### 5.2 创建 App 专用密码（用于公证）

1. 登录 https://appleid.apple.com
2. 登录与开发者账号 → App 专用密码 → 生成
3. 记录密码（格式如 `xxxx-xxxx-xxxx-xxxx`）

### 5.3 修改 package.json

将 `build.mac` 改为：

```json
"mac": {
  "target": ["dmg", "zip"],
  "icon": "assets/icon.icns",
  "category": "public.app-category.productivity",
  "identity": "Developer ID Application: Your Name (TEAMXXXXXX)",
  "notarize": {
    "teamId": "TEAMXXXXXX"
  },
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "artifactName": "work-assistant-${version}-mac.${ext}"
}
```

### 5.4 创建 entitlements 文件

文件：`build/entitlements.mac.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
```

### 5.5 设置环境变量

打包前在 Mac 终端设置（或写入 `~/.zshrc`）：

```bash
# 方式一：App 专用密码（简单）
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMXXXXXX"
```

或使用 App Store Connect API Key（更稳定）：

```bash
# 方式二：API Key（推荐）
export APPLE_API_KEY="/path/to/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxx-xxxx-xxxxx-xxxx"
```

### 5.6 签名打包

```bash
npm run dist:mac
```

electron-builder 会自动：签名 → 公证 → 装订票据（Staple）。

### 5.7 验证签名

```bash
# 检查签名
codesign --verify --deep --strict --verbose=2 "dist/工作助手.app"

# 检查公证
spctl --assess --type execute --verbose "dist/工作助手.app"

# 检查装订票据
xcrun stapler validate "dist/工作助手.app"
```

---

## 六、项目文件结构

```
工作助手/
├── main.js                 # Electron 主进程（含平台判断分支）
├── preload.js              # 预加载脚本（IPC 桥接）
├── package.json            # 项目配置 + electron-builder 配置
├── assets/
│   ├── icon.png            # 256x256 PNG 图标（通知、设置窗口）
│   ├── icon.ico            # Windows ICO 图标
│   ├── icon.icns           # macOS ICNS 图标（已生成）
│   └── tray.png            # 32x32 托盘图标
├── src/
│   ├── index.html          # 面板 UI
│   ├── settings.html       # 设置页 UI
│   ├── renderer.js         # 面板渲染逻辑
│   ├── settings.js         # 设置页逻辑
│   ├── styles.css          # 样式
│   └── shared/
│       └── reminder-utils.js  # 提醒工具函数
├── tools/
│   └── gen-icon.js         # 图标生成器（ICO + ICNS + PNG）
├── docs/
│   └── MAC-HANDOVER.md     # 本文档
└── dist/                   # 打包产物输出目录
```

---

## 七、常见问题排查

### Q: 打包报错 "icon.icns not found"
确认 `assets/icon.icns` 存在。如不存在，运行 `npm run gen-icon` 重新生成。

### Q: 面板不显示
检查 `debug.log`（位于 `~/Library/Application Support/work-assistant/debug.log`）：
```bash
tail -50 ~/Library/Application\ Support/work-assistant/debug.log
```

### Q: 通知不弹出
1. 系统设置 → 通知 → 找到"工作助手" → 允许通知
2. 未签名应用可能需要手动授权
3. 确认 `data.settings.notify !== false`

### Q: 托盘图标不显示
- macOS 菜单栏空间有限，如已满则不显示
- 检查 `assets/tray.png` 是否存在

### Q: 自动更新失败
- 确认 GitHub Release 中有 `latest-mac.yml` 和 `zip` 资产
- 未签名应用可能无法自动替换（macOS 安全限制）
- 查看日志中的 `updater[error]` 行

### Q: Dock 图标仍然显示
确认代码中 `app.dock.hide()` 被调用（main.js 第 694 行）。
如果应用通过 DMG 安装到 /Applications，可能需要重新打开应用。

### Q: 鼠标穿透不工作
`setIgnoreMouseEvents` 在 macOS 上正常工作，但需要 `forward: true` 参数。
确认 `updateMouseIgnore()` 函数中的调用包含此参数。

---

## 八、给 Mac AI 助手的操作指引

1. **先读本文档**，理解项目结构和已完成适配
2. **不需要修改代码**，代码已适配完毕
3. **执行 `npm install && npm start`** 验证功能
4. **执行 `npm run dist:mac`** 打包
5. **测试安装**：挂载 dmg，拖入 Applications，右键打开
6. **如用户有 Apple Developer 账号**：按第五节配置签名公证
7. **上传到 GitHub Release**：上传 dmg + zip + latest-mac.yml
9. **如有问题**：查 `~/Library/Application Support/work-assistant/debug.log`

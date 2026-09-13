# 发布新版本流程（Release Guide）

> 本文档记录工作助手从「改完代码」到「所有在线用户收到自动更新」的完整步骤。
> 自动更新链路：electron-updater（客户端） → GitHub Releases（更新源） → `latest.yml`（版本清单）。
>
> **第一次发版前必读**：v1.3.0 之前的版本（≤1.2.0）没有自动更新模块，无法靠本流程升级；已分发的旧安装包用户必须手动安装一次 ≥1.3.0 的版本，之后才能收到自动更新。

---

## 0. 自动更新原理（30 秒理解）

1. 客户端启动 6 秒后，向 GitHub 请求**最新正式 Release** 中的 `latest.yml`（内含最新版本号、安装包文件名、SHA-512、大小）。
2. 版本号高于本机 → 下载该 Release 中的 `.exe`（有 `.blockmap` 时优先差分增量下载）。
3. 下载完成 → 弹系统通知 → 用户点击后 `quitAndInstall()` 退出并静默安装（用户级安装，不弹 UAC）。

由此推出发布铁律：

- **三件套必须同一次构建、传到同一个 Release**：`work-assistant-setup-x.y.z.exe`、`latest.yml`、`work-assistant-setup-x.y.z.exe.blockmap`。
- **`latest.yml` 不能手改**；其中 `files[0].url` 必须与 Release 资产名逐字一致。
- **Release 必须是正式版**（不能是 Draft 草稿或 Pre-release 预发布），否则稳定通道的客户端检查不到。
- **版本号只能增加、不能覆盖重发同版本**：客户端只升级不降级，且会校验 SHA-512。发坏了就发更高的修复版本。
- 安装包文件名固定 ASCII：`work-assistant-setup-${version}.exe`（已在 package.json 的 `nsis.artifactName` 配置，勿改成中文）。

---

## 1. 版本号规则

遵循语义化版本（SemVer）：`主版本.次版本.修订号`

| 类型 | 何时用 | 示例 |
| :---: | :--- | :--- |
| 修订号 patch | Bug 修复、小优化，无新功能 | 1.3.1 |
| 次版本 minor | 新增功能、向后兼容 | 1.4.0 |
| 主版本 major | 重大改版/不兼容变更 | 2.0.0 |

Git tag 格式固定为 `v` + 版本号，如 `v1.3.1`。

---

## 2. 发布前检查

- [ ] 代码已在本机验证通过（`node --check main.js` 等语法检查 + 实际运行冒烟）
- [ ] `package.json` 的 `version` 已改为新版本号（**唯一版本号来源**，打包与 `latest.yml` 都取它）
- [ ] `README.md`：顶部版本 badge 已更新；「更新日志」已追加新版本条目
- [ ] 所有改动已 git commit（见第 5 步，顺序上也可先打包再提交，但必须在创建 Release 前推送 tag 对应代码）

---

## 3. 打包（Windows / PowerShell）

> ⚠️ 本机项目路径含中文（`桌面\工作助手`），NSIS 会失败。必须把项目**物理复制**到纯英文路径打包（junction/软链接无效，会被解析回真实路径）。
> 以下命令在 **PowerShell** 中执行（PS 5.1 用 `;` 连接，不支持 `&&`）。

### 3.1 关闭运行中的应用并同步到英文构建目录

```powershell
# 停掉已安装的应用，避免文件占用
Get-Process | Where-Object { $_.Path -like '*work-assistant*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 镜像同步（/XD 必须写绝对路径，否则会误排除 electron 运行时内部的 dist 目录）
robocopy 'd:\Users\Administrator\Desktop\工作助手' 'D:\dr-build\app' /MIR `
  /XD 'd:\Users\Administrator\Desktop\工作助手\dist' `
      'd:\Users\Administrator\Desktop\工作助手\.git' `
  /XF '*.log'
# robocopy 退出码 < 8 都算成功（1 = 有文件被复制）
```

### 3.2 设置国内镜像并打包

```powershell
$env:ELECTRON_MIRROR='https://registry.npmmirror.com/-/binary/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://registry.npmmirror.com/-/binary/electron-builder-binaries/'
Set-Location 'D:\dr-build\app'

# --publish never：只在本地产包，不尝试发布（发布统一走第 4 步，避免无 GH_TOKEN 报错）
npx electron-builder --win --publish never
```

**360 安全卫士可能导致首次打包失败**（实时扫描锁住刚生成的未签名 exe，报 `failed opening file ... __uninstaller-nsis-*.exe`，特征是 Setup 只有约 190KB）。直接重试即可。可用循环：

```powershell
$ok = $false
for ($i=1; $i -le 3; $i++) {
  npx electron-builder --win --publish never 2>&1 | Select-Object -Last 3
  $exe = 'D:\dr-build\app\dist\work-assistant-setup-' + (Get-Content package.json -Raw | ConvertFrom-Json).version + '.exe'
  if ((Test-Path $exe) -and ((Get-Item $exe).Length -gt 70MB) -and (Test-Path 'D:\dr-build\app\dist\latest.yml')) { $ok=$true; break }
  Start-Sleep -Seconds 5
}
Write-Output ('BUILD OK=' + $ok)
```

### 3.3 核对产物（三件套必须齐全）

```powershell
Get-ChildItem 'D:\dr-build\app\dist' |
  Where-Object { $_.Name -match 'setup-.*\.exe$|\.blockmap$|^latest\.yml$' } |
  Select-Object Name, Length
```

应得到：

```
latest.yml                                  约 0.3 KB
work-assistant-setup-x.y.z.exe              约 78–82 MB
work-assistant-setup-x.y.z.exe.blockmap     约 85 KB
```

打开 `latest.yml` 确认 `version` 与 `files[0].url` 的版本号正确。

### 3.4 本地安装冒烟（必做）

```powershell
# 拷回项目 dist 留档
Copy-Item 'D:\dr-build\app\dist\work-assistant-setup-*.exe'     'd:\Users\Administrator\Desktop\工作助手\dist\' -Force
Copy-Item 'D:\dr-build\app\dist\latest.yml'                     'd:\Users\Administrator\Desktop\工作助手\dist\' -Force
Copy-Item 'D:\dr-build\app\dist\work-assistant-setup-*.blockmap' 'd:\Users\Administrator\Desktop\工作助手\dist\' -Force

# 静默安装并启动（/S 为 NSIS 静默参数）
Start-Process 'd:\Users\Administrator\Desktop\工作助手\dist\work-assistant-setup-x.y.z.exe' -ArgumentList '/S' -Wait
Start-Sleep -Seconds 3
Start-Process 'C:\Users\Administrator\AppData\Local\Programs\work-assistant\工作助手.exe'
```

冒烟要点：面板正常显示、设置页「关于与更新」版本号正确、任务数据未丢失。

---

## 4. 创建 GitHub Release 并上传三件套

### 方式 A：网页手动上传（简单直观）

1. 打开 https://github.com/jackie251818/work-assistant/releases/new
2. Tag 填 `v1.3.1`（目标分支 main，没有该 tag 时页面会自动创建）
3. 标题如 `v1.3.1 — 一句话概括`
4. 粘贴发布说明（参照第 6 节模板）
5. **不要**勾 "Set as a pre-release" / "Set as a draft"，保持正式发布
6. 把第 3.3 节的三个文件全部拖入附件区，等待上传到 100%，点 Publish release

> 国内上行到 GitHub 可能很慢（实测约 30–50 KB/s，82MB 需数十分钟），属正常现象，耐心等待，不要中途关闭页面。

### 方式 B：命令行发布（可复用脚本）

Token 已缓存在 git credential 中，无需手动准备。把版本号与发布说明文件替换后整段执行（创建 Release 与上传资产必须在同一脚本内完成）：

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# 从 git credential 取已缓存的 GitHub token
$credOut = "protocol=https`nhost=github.com`n`n" | git credential fill
$token = (($credOut | Where-Object { $_ -like 'password=*' }) -replace 'password=', '').Trim()
$headers = @{ Authorization = "token $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'release' }

$repo = 'jackie251818/work-assistant'
$ver  = '1.3.1'   # ← 改这里

# 发布说明用 .NET 原语读取（Get-Content 的字符串带 PSPath 附加属性，会导致 ConvertTo-Json 被 GitHub 422 拒绝）
$relBody = [System.IO.File]::ReadAllText('D:\dr-build\release-body.md', [System.Text.Encoding]::UTF8)

$payload = @{
  tag_name         = "v$ver"
  target_commitish = 'main'
  name             = "v$ver — 标题"
  body             = $relBody
  draft            = $false
  prerelease       = $false
} | ConvertTo-Json -Depth 5

$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" -Method Post `
  -Headers $headers -ContentType 'application/json; charset=utf-8' `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))
Write-Output ('release id=' + $rel.id)

$dist = 'D:\dr-build\app\dist'
$assets = @(
  @{ f = "$dist\work-assistant-setup-$ver.exe";          n = "work-assistant-setup-$ver.exe";          ct = 'application/vnd.microsoft.portable-executable' },
  @{ f = "$dist\latest.yml";                             n = 'latest.yml';                             ct = 'application/octet-stream' },
  @{ f = "$dist\work-assistant-setup-$ver.exe.blockmap"; n = "work-assistant-setup-$ver.exe.blockmap"; ct = 'application/octet-stream' }
)
foreach ($a in $assets) {
  $u = "https://uploads.github.com/repos/$repo/releases/$($rel.id)/assets?name=$([uri]::EscapeDataString($a.n))"
  $up = Invoke-RestMethod -Uri $u -Method Post -Headers $headers -ContentType $a.ct -InFile $a.f
  Write-Output ('uploaded: ' + $up.name + ' state=' + $up.state)
}
```

验证三个资产均为 `state=uploaded`：

```powershell
(Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/$($rel.id)" -Headers $headers).assets |
  Select-Object name, state, size
```

---

## 5. 提交代码与打标签

发布用的代码必须与 tag 对应。建议在创建 Release 前完成提交推送（方式 A 网页建 tag 时会打在当时最新的 main 上）：

```powershell
Set-Location 'd:\Users\Administrator\Desktop\工作助手'
git add package.json package-lock.json README.md main.js preload.js src/  # 按实际改动
git commit -m "feat: 改动概述 (v1.3.1)"
git push origin main
```

如需本地显式打标签：

```powershell
git tag v1.3.1
git push origin v1.3.1
```

---

## 6. README 与发布说明更新（每次必做）

1. `README.md` 顶部 badge：`version-1.3.1`。
2. `README.md`「更新日志」顶部追加新版本条目（用户视角：新功能 / 修复 / 注意事项）。
3. Release 发布说明模板：

```markdown
## v1.3.1 — 标题

### ⬇️ 安装
下载 `work-assistant-setup-1.3.1.exe` 双击安装（覆盖安装，任务数据不受影响）。
已安装 v1.3.0+ 的用户：打开应用后会自动后台更新，也可在设置 → 关于与更新中手动检查。

### ✨ 新功能 / 优化
- ...

### 🐛 修复
- ...
```

---

## 7. 发布后验证（5 分钟内完成）

```powershell
# 1) latest.yml 可匿名公开下载，且版本号正确
curl.exe -sL 'https://github.com/jackie251818/work-assistant/releases/latest/download/latest.yml'

# 2) exe 资产可匿名下载（Range 请求只取 1KB，验证 HTTP 206，不用下完整包）
curl.exe -sL -r 0-1023 -o NUL -w 'http=%{http_code}' `
  'https://github.com/jackie251818/work-assistant/releases/latest/download/work-assistant-setup-1.3.1.exe'

# 3) 重启本机应用，读诊断日志确认更新检查正常
Get-Process | Where-Object { $_.Path -like '*work-assistant*' } | Stop-Process -Force
Start-Sleep -Seconds 2
Remove-Item "$env:APPDATA\work-assistant\debug.log" -ErrorAction SilentlyContinue
Start-Process 'C:\Users\Administrator\AppData\Local\Programs\work-assistant\工作助手.exe'
Start-Sleep -Seconds 15
Get-Content "$env:APPDATA\work-assistant\debug.log"
```

日志中当前版本应出现：

```
updater[info] Update for version 1.3.1 is not available (latest version: 1.3.1, ...)
```

**验证自动更新真正生效**（可选，最有说服力）：在一台装有上一版本的机器上（或临时把本机 package.json 保持旧版打的包）启动应用，观察日志出现 `update-available` → `downloading` → `update-downloaded`，点通知后完成升级。

- [ ] Release 页面三个资产齐全且非草稿/非预发布
- [ ] `latest.yml` 匿名可访问，版本号、文件名、sha512 正确
- [ ] 客户端检查更新无报错
- [ ] （必要时）旧版客户端实测能升级上来

---

## 8. 故障排查

| 现象 | 原因与处理 |
| :--- | :--- |
| 客户端日志 `Cannot find latest.yml ... HttpError: 404` | 最新 Release 没传 `latest.yml`，或 Release 是 Draft/Pre-release。补齐资产或改为正式发布。 |
| 日志 `sha512 mismatch` / 校验失败 | 重新上传了 exe 但 `latest.yml` 是旧的（或反之）。三件套必须来自**同一次构建**；修正后升一个新版本号发布。 |
| 检查结果一直是"已是最新" | 确认 Release 不是 pre-release（客户端默认仅接受稳定版）；确认 `latest.yml` 的 `version` 确实高于客户端版本。 |
| 发布后用户无反应 | 客户端仅在**启动时**检查一次；让用户重启应用，或在设置页手动检查。 |
| 用户下载/更新很慢 | GitHub 资产在境外。失败会静默跳过不影响使用；必要时在设置页重试。长期可改为 generic 源（对象存储）。 |
| 打包报 makensis `failed opening file`，Setup 仅 190KB | 360 实时扫描占用（也可能是中文路径）。英文路径下重试 electron-builder。 |
| 打包报 PublishManager 错误 | 漏了 `--publish never`；产物本身通常已生成，重新加参数打包即可。 |
| 网页/命令上传到一半失败 | 删掉 Release 中传了一半的资产后重传该文件；exe 与 yml/blockmap 必须最终齐全。 |
| 发了一个有严重问题的版本 | 不要删后重发同版本号（已升级用户不会降级）。删除或保留问题 Release 均可，**正确做法是立刻修复并发更高版本号**。 |

诊断信息统一看：`%APPDATA%\work-assistant\debug.log`（updater 相关行以 `updater` 开头）。

---

## 9. 一页纸检查清单（每次发版照抄）

1. [ ] 改代码、本机验证
2. [ ] `package.json` 升版本号
3. [ ] README badge + 更新日志
4. [ ] git commit & push
5. [ ] 英文路径打包（镜像变量 + `--publish never`），确认三件套
6. [ ] 本地静默安装冒烟
7. [ ] 创建正式 Release `vX.Y.Z`，上传 exe + latest.yml + blockmap，等待全部 uploaded
8. [ ] 匿名下载验证 latest.yml / exe（HTTP 200/206）
9. [ ] 重启应用看 debug.log 检查正常
10. [ ] 通知用户（≤1.2.0 老用户需手动安装一次）

---

## 变更记录

| 日期 | 版本 | 更新内容 | 触发原因 |
| :--- | :--- | :--- | :--- |
| 2026-09-13 | v1.3.0 | 初版发布流程文档：electron-updater + GitHub Releases 三件套发布链路、打包镜像/中文路径/360 坑、发布后验证与排错 | v1.3.0 首次引入自动更新，需固化发版 SOP |

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  Notification,
  nativeImage,
  screen
} = require('electron');
const path = require('path');
const fs = require('fs');
const U = require('./src/shared/reminder-utils');
const { autoUpdater } = require('electron-updater');

/* ================= 应用标识与数据目录 ================= */
// 项目由"桌面提示"更名为"工作助手"，沿用旧数据（自动迁移 tasks.json）
const DATA_DIR = path.join(app.getPath('appData'), 'work-assistant');
const LEGACY_DATA_DIR = path.join(app.getPath('appData'), 'desktop-reminder');
if (
  !fs.existsSync(path.join(DATA_DIR, 'tasks.json')) &&
  fs.existsSync(path.join(LEGACY_DATA_DIR, 'tasks.json'))
) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.copyFileSync(
    path.join(LEGACY_DATA_DIR, 'tasks.json'),
    path.join(DATA_DIR, 'tasks.json')
  );
}
app.setPath('userData', DATA_DIR);

/* ================= 诊断日志（排查面板意外消失） ================= */
const DEBUG_LOG = path.join(DATA_DIR, 'debug.log');
function dbg(msg) {
  try {
    fs.appendFileSync(
      DEBUG_LOG,
      `[${new Date().toISOString()}] ${msg}\n`,
      'utf-8'
    );
  } catch (_) {}
}

/* ================= 数据存储 ================= */
const DATA_FILE = () => path.join(app.getPath('userData'), 'tasks.json');

const DEFAULT_DATA = () => ({
  tasks: [
    {
      id: U.uid(),
      title: '示例：喝水提醒',
      note: '久坐时起身活动一下，喝杯水',
      repeat: 'daily',
      time: '10:00',
      enabled: true,
      done: {}
    },
    {
      id: U.uid(),
      title: '示例：每周例会',
      note: '准备本周工作进展汇报',
      repeat: 'weekly',
      days: [1],
      time: '09:30',
      enabled: true,
      done: {}
    }
  ],
  notes: '',
  settings: {
    opacity: 0.92,
    autoStart: false,
    notify: true,
    panelVisible: true,
    pinned: true,
    alwaysOnTop: true,
    theme: 'nebula',
    bounds: null,
    autoCollapse: true,
    collapseDelay: 8
  }
});

let data = null;

function loadData() {
  try {
    // 去掉可能存在的 UTF-8 BOM（记事本等编辑器保存时会带，直接 parse 会抛错回退默认值）
    const raw = fs.readFileSync(DATA_FILE(), 'utf-8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    const d = DEFAULT_DATA();
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : d.tasks,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      settings: Object.assign(d.settings, parsed.settings || {})
    };
  } catch {
    return DEFAULT_DATA();
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE(), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('数据保存失败:', err);
  }
}

/* ================= 窗口管理 ================= */
let mainWindow = null;
let settingsWindow = null;
let tray = null;
let notifyTimer = null;
// 用户是否主动要求隐藏面板（托盘菜单 / panel:hide）。
// 用于区分系统动作（Win+D、显示桌面）导致的意外隐藏，后者需自动恢复。
let userHidden = false;
// 用户是否主动最小化到任务栏（点 — 按钮）。
// 非用户主动的最小化（系统动作）仍会被立即还原。
let userMinimized = false;
const notifiedKeys = new Set();

const ASSET = (name) => path.join(__dirname, 'assets', name);

/** 应用固定（位置锁定）状态 —— 固定=不能拖动，与置顶解耦 */
function applyPinState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const pinned = data.settings.pinned !== false;
  mainWindow.setMovable(!pinned);
}

/** 窗口置顶状态 —— 面板保持在其他普通窗口上方（设置 → 偏好设置可开关） */
function applyAlwaysOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(data.settings.alwaysOnTop !== false);
}

/* ================= 面板收起/展开 ================= */
const FULL_HEIGHT = 540;
const COLLAPSED_HEIGHT = 34;
let isCollapsed = false;

function setCollapsed(collapsed) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (collapsed === isCollapsed) return;
  isCollapsed = collapsed;
  if (collapsed) {
    // 收起：缩成 340×28 横向长条 + 关闭穿透
    mainWindow.setMinimumSize(300, 20);
    mainWindow.setSize(340, COLLAPSED_HEIGHT);
    mainWindow.setIgnoreMouseEvents(false);
    cursorInsidePanel = true;
  } else {
    // 展开：恢复完整尺寸 + 重置穿透
    mainWindow.setMinimumSize(300, 200);
    mainWindow.setSize(340, FULL_HEIGHT);
    cursorInsidePanel = false;
    updateMouseIgnore();
  }
}

ipcMain.handle('panel:setCollapsed', (_e, collapsed) => {
  setCollapsed(!!collapsed);
  return isCollapsed;
});

ipcMain.handle('panel:isCollapsed', () => isCollapsed);

function createMainWindow() {
  const bounds = data.settings.bounds;
  // 默认停靠在主屏幕右上角
  let x;
  let y;
  if (bounds && Number.isInteger(bounds.x) && Number.isInteger(bounds.y)) {
    x = bounds.x;
    y = bounds.y;
  } else {
    const wa = screen.getPrimaryDisplay().workArea;
    x = wa.x + wa.width - 340 - 24;
    y = wa.y + 24;
  }
  mainWindow = new BrowserWindow({
    width: 340,
    height: 540,
    x,
    y,
    frame: false,
    transparent: true,
    thickFrame: false, // 去掉 Windows 为无边框窗口保留的 1px 系统边框印记
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 应用固定（位置锁定）与置顶状态
  applyPinState();
  applyAlwaysOnTop();
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.setSkipTaskbar(true);
    if (data.settings.panelVisible !== false) mainWindow.show();
  });

  // 记住拖动后的位置
  let saveTimer = null;
  const persistBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (mainWindow) data.settings.bounds = mainWindow.getBounds();
      saveData();
    }, 300);
  };
  mainWindow.on('move', persistBounds);

  // —— 防止面板被系统动作（Win+D / 显示桌面 / 误触托盘）意外藏起来 ——
  mainWindow.on('minimize', () => {
    dbg('event: minimize (userMinimized=' + userMinimized + ')');
    // 非用户主动最小化（系统动作）→ 立即还原；用户点 — 最小化到任务栏则保留
    if (!userMinimized && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.restore();
    } else {
      updateTrayMenu();
    }
  });
  mainWindow.on('restore', () => {
    dbg('event: restore');
    userMinimized = false;
    // 恢复后回归"托盘常驻、不占任务栏"的常态
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setSkipTaskbar(true);
  });
  mainWindow.on('hide', () => {
    dbg('event: hide (userHidden=' + userHidden + ') visible=' +
      (mainWindow && !mainWindow.isDestroyed() ? mainWindow.isVisible() : '?'));
    // 非用户主动隐藏（如 Windows"显示桌面"给分层窗口发的 SW_HIDE）→ 立即恢复
    if (!userHidden && mainWindow && !mainWindow.isDestroyed()) {
      setImmediate(() => {
        if (!userHidden && mainWindow && !mainWindow.isDestroyed() &&
            data.settings.panelVisible !== false) {
          dbg('auto-recover: show after unexpected hide');
          mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
        }
      });
    }
  });
  mainWindow.on('show', () => dbg('event: show'));
  mainWindow.on('blur', () => {
    // blur 频繁，仅在隐藏状态异常时帮助诊断（默认注释，需要时打开）
    // dbg('event: blur');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 680,
    height: 660,
    minWidth: 600,
    minHeight: 580,
    title: '设置 - 工作助手',
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    icon: nativeImage.createFromPath(ASSET('icon.png')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/** 从任务栏/托盘恢复最小化的面板 */
function restorePanelFromTaskbar() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dbg('restorePanelFromTaskbar');
  userMinimized = false;
  mainWindow.restore();
  mainWindow.setSkipTaskbar(true);
  mainWindow.setIgnoreMouseEvents(false);
  updateTrayMenu();
}

function togglePanel() {
  if (!mainWindow) return;
  dbg('togglePanel called, visible=' + mainWindow.isVisible());
  if (mainWindow.isMinimized()) {
    restorePanelFromTaskbar();
    return;
  }
  if (mainWindow.isVisible()) {
    userHidden = true;
    mainWindow.hide();
    data.settings.panelVisible = false;
  } else {
    userHidden = false;
    mainWindow.show();
    mainWindow.setIgnoreMouseEvents(false);
    data.settings.panelVisible = true;
  }
  saveData();
  updateTrayMenu();
}

/* ================= 系统托盘 ================= */
function updateTrayMenu() {
  if (!tray) return;
  const visible = mainWindow
    ? (mainWindow.isVisible() && !mainWindow.isMinimized())
    : true;
  const menu = Menu.buildFromTemplate([
    { label: visible ? '隐藏面板' : '显示面板', click: togglePanel },
    { label: '设置...', click: createSettingsWindow },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: data.settings.autoStart === true,
      click: (item) => {
        data.settings.autoStart = item.checked;
        app.setLoginItemSettings({ openAtLogin: item.checked });
        saveData();
      }
    },
    {
      label: '到点系统通知',
      type: 'checkbox',
      checked: data.settings.notify !== false,
      click: (item) => {
        data.settings.notify = item.checked;
        saveData();
      }
    },
    { type: 'separator' },
    makeUpdateMenuItem(),
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('工作助手' + (visible ? '' : '（已隐藏）'));
}

function createTray() {
  const icon = nativeImage.createFromPath(ASSET('tray.png'));
  tray = new Tray(icon);
  updateTrayMenu();
  tray.on('click', togglePanel);
  tray.on('double-click', createSettingsWindow);
}

/* ================= 自动更新（electron-updater · GitHub Releases） =================
 * 更新源由 package.json build.publish 声明，打包时写入 resources/app-update.yml。
 * 发布新版时必须把 Setup exe + latest.yml + exe.blockmap 一并传到同一个 GitHub Release，
 * 且 latest.yml 中的文件名必须与 Release 资产名完全一致（故产物名固定为 ASCII）。
 */
const updateState = {
  status: 'idle', // idle | checking | available | downloading | downloaded | not-available | error | unsupported
  currentVersion: app.getVersion(),
  version: null, // 检测到的新版本号
  percent: 0,
  message: '',
  checkedAt: null
};
let updateManual = false; // 本次检查是否由用户手动触发（决定是否弹"已是最新/失败"通知）

// electron-updater 的错误对象 message 可能含多行请求头，只取首行用于日志与界面提示
function briefErr(m) {
  return String((m && m.message) || m || '').split('\n')[0];
}

function commitUpdateState(patch) {
  Object.assign(updateState, patch, { checkedAt: new Date().toISOString() });
  dbg(
    'updater: ' + updateState.status +
    (updateState.version ? ' v' + updateState.version : '') +
    (updateState.percent ? ' ' + updateState.percent + '%' : '') +
    (updateState.message ? ' | ' + updateState.message : '')
  );
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('update:status', updateState);
  }
  updateTrayMenu();
}

function showUpdateNotification(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (onClick) n.on('click', onClick);
  n.show();
}

function makeUpdateMenuItem() {
  const busy = updateState.status === 'checking' || updateState.status === 'downloading';
  if (updateState.status === 'downloaded') {
    return {
      label: '重启并安装新版本 v' + updateState.version,
      click: () => autoUpdater.quitAndInstall()
    };
  }
  if (updateState.status === 'downloading') {
    return { label: '正在下载新版本… ' + updateState.percent + '%', enabled: false };
  }
  if (updateState.status === 'checking') {
    return { label: '正在检查更新…', enabled: false };
  }
  return {
    label: '检查更新',
    enabled: !busy,
    click: () => { checkForUpdates(true); }
  };
}

function initAutoUpdater() {
  autoUpdater.autoDownload = true; // 发现新版后自动后台下载
  autoUpdater.autoInstallOnAppQuit = true; // 用户正常退出时若已下载则顺手安装
  autoUpdater.logger = {
    info: (m) => dbg('updater[info] ' + m),
    debug: () => {}, // 下载分片日志过多，不记录
    warn: (m) => dbg('updater[warn] ' + briefErr(m)),
    error: (m) => dbg('updater[error] ' + briefErr(m))
  };

  autoUpdater.on('checking-for-update', () => {
    commitUpdateState({ status: 'checking', percent: 0, message: '正在检查更新…' });
  });
  autoUpdater.on('update-available', (info) => {
    commitUpdateState({
      status: 'available',
      version: info.version,
      percent: 0,
      message: '发现新版本 v' + info.version + '，正在后台下载…'
    });
    showUpdateNotification(
      '发现新版本 v' + info.version,
      '正在后台下载，完成后会通知你重启安装。'
    );
  });
  autoUpdater.on('update-not-available', () => {
    commitUpdateState({
      status: 'not-available',
      version: null,
      percent: 0,
      message: '当前已是最新版本（v' + app.getVersion() + '）'
    });
    if (updateManual) {
      showUpdateNotification('已是最新版本', '当前版本 v' + app.getVersion());
    }
  });
  autoUpdater.on('download-progress', (p) => {
    const percent = Math.round(p.percent || 0);
    commitUpdateState({
      status: 'downloading',
      percent,
      message: '正在下载新版本… ' + percent + '%'
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    commitUpdateState({
      status: 'downloaded',
      version: info.version,
      percent: 100,
      message: '新版本 v' + info.version + ' 已就绪，重启后完成安装'
    });
    showUpdateNotification(
      '新版本已就绪 v' + info.version,
      '点击此通知立即重启并安装更新（也可稍后点托盘菜单安装）。',
      () => autoUpdater.quitAndInstall()
    );
  });
  autoUpdater.on('error', (err) => {
    const msg = briefErr(err || '未知错误');
    commitUpdateState({ status: 'error', message: '更新失败：' + msg });
    // commitUpdateState 已写日志，这里不重复；手动检查时弹通知，静默失败不打扰用户
    if (updateManual) {
      showUpdateNotification('检查更新失败', msg + '，可稍后重试');
    }
  });
}

function checkForUpdates(manual) {
  updateManual = !!manual;
  if (!app.isPackaged) {
    commitUpdateState({ status: 'unsupported', message: '开发环境不支持在线更新' });
    return Promise.resolve(updateState);
  }
  if (updateState.status === 'checking' || updateState.status === 'downloading') {
    return Promise.resolve(updateState);
  }
  // 'error' 事件负责提示，这里吞掉 rejection 避免未捕获异常；统一返回内部状态
  return autoUpdater.checkForUpdates()
    .then(() => updateState)
    .catch((err) => {
      dbg('updater checkForUpdates rejected: ' + briefErr(err));
      return updateState;
    });
}

/* ================= 提醒通知 ================= */
function checkReminders() {
  if (data.settings.notify === false) return;
  const now = new Date();
  const today = U.dateStr(now);
  const hm = U.timeStr(now);

  for (const task of data.tasks) {
    if (!task.time || task.enabled === false) continue;
    if (!U.isTaskDue(task, now)) continue;
    if (U.isTaskDone(task, now)) continue;
    const key = task.id + '@' + today;
    if (task.time === hm && !notifiedKeys.has(key)) {
      notifiedKeys.add(key);
      const n = new Notification({
        title: '工作助手：' + task.title,
        body: task.note || '该事项已到计划时间，点击查看',
        icon: nativeImage.createFromPath(ASSET('icon.png')),
        silent: false
      });
      n.on('click', () => {
        if (!mainWindow) createMainWindow();
        else if (mainWindow.isMinimized()) restorePanelFromTaskbar();
        else mainWindow.show();
      });
      n.show();
    }
  }
}

/* ================= IPC ================= */
function broadcastDataChange() {
  const payload = JSON.stringify(data);
  if (mainWindow) mainWindow.webContents.send('data:changed', payload);
  if (settingsWindow) settingsWindow.webContents.send('data:changed', payload);
}

ipcMain.handle('data:get', () => data);

ipcMain.handle('data:save', (_e, payload) => {
  if (payload && Array.isArray(payload.tasks)) data.tasks = payload.tasks;
  if (payload && payload.settings) data.settings = Object.assign(data.settings, payload.settings);
  if (payload && typeof payload.notes === 'string') data.notes = payload.notes;
  saveData();
  if (payload && payload.settings && 'alwaysOnTop' in payload.settings) {
    applyAlwaysOnTop();
  }
  broadcastDataChange();
  return data;
});

ipcMain.handle('task:toggle', (_e, id, done) => {
  const task = data.tasks.find((t) => t.id === id);
  if (task) {
    task.done = task.done || {};
    task.done[U.dateStr(new Date())] = !!done;
    saveData();
    broadcastDataChange();
  }
  return data;
});

ipcMain.handle('panel:pin', (_e, pinned) => {
  data.settings.pinned = !!pinned;
  saveData();
  applyPinState();
  broadcastDataChange();
  return data;
});

/* ================= 鼠标穿透（主进程轮询 + 渲染层即时上报，双保险） =================
   光标在面板窗口内 → 可点击；光标离开 → 整窗穿透（让出圆角外区域）。
   穿透时开启 forward:true，渲染层仍能收到 mousemove —— 光标一进入面板就立即
   通过 panel:hover 解除穿透，消除"轮询间隙内快速点击被吞"的竞态；
   主进程轮询作为兜底（渲染层失效时最多 60ms 恢复，不会卡死在穿透态）。 */
let cursorInsidePanel = false;

function updateMouseIgnore() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) {
    if (cursorInsidePanel) {
      cursorInsidePanel = false;
      mainWindow.setIgnoreMouseEvents(false);
    }
    return;
  }
  const p = screen.getCursorScreenPoint();
  const b = mainWindow.getBounds();
  const inside =
    p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
  if (inside !== cursorInsidePanel) {
    cursorInsidePanel = inside;
    mainWindow.setIgnoreMouseEvents(!inside, { forward: true });
  }
}

// 渲染层收到 mousemove（穿透时由 forward 转发）→ 立即解除穿透
ipcMain.on('panel:hover', () => {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
  if (cursorInsidePanel) return;
  cursorInsidePanel = true;
  mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('settings:open', createSettingsWindow);
ipcMain.on('panel:hide', () => {
  if (mainWindow) {
    userHidden = true;
    mainWindow.hide();
  }
  data.settings.panelVisible = false;
  saveData();
  updateTrayMenu();
});
ipcMain.on('panel:minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dbg('panel:minimize (user)');
  userMinimized = true;
  // 最小化期间在任务栏显示图标，点击图标即可恢复
  mainWindow.setSkipTaskbar(false);
  mainWindow.minimize();
  updateTrayMenu();
});
ipcMain.on('panel:toggle', togglePanel);
ipcMain.on('app:quit', () => app.quit());

/* 更新相关 IPC */
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:getState', () => updateState);
ipcMain.handle('update:check', () => checkForUpdates(true));
ipcMain.on('update:install', () => {
  if (updateState.status === 'downloaded') autoUpdater.quitAndInstall();
});

/* ================= 应用生命周期 ================= */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) restorePanelFromTaskbar();
      else if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Windows 通知归属的应用 ID
    app.setAppUserModelId('com.trae.workassistant');
    data = loadData();
    // 同步开机自启状态（与用户在系统中设置保持一致）
    data.settings.autoStart = app.getLoginItemSettings().openAtLogin;

    createMainWindow();
    createTray();

    // 自动更新：注册事件并在启动 6 秒后静默检查一次（不弹任何提示，除非发现新版/出错只记日志）
    initAutoUpdater();
    setTimeout(() => checkForUpdates(false), 6000);

    // 每 20 秒检查一次到点提醒
    checkReminders();
    notifyTimer = setInterval(checkReminders, 20 * 1000);

    // 每 60ms 按光标位置兜底更新鼠标穿透状态（即时解除由 panel:hover 完成）
    setInterval(updateMouseIgnore, 60);

    // 看门狗：面板应显示却不可见（被系统动作意外隐藏）时自动恢复。
    // 注意：外部 SW_HIDE 不会触发 Electron 的 'hide' 事件（实测），只能靠轮询兜底，
    // 250ms 间隔使"显示桌面"类隐藏最长仅闪约 1/4 秒。
    setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (userHidden || userMinimized || data.settings.panelVisible === false) return;
      if (!mainWindow.isVisible()) {
        dbg('watchdog: panel invisible unexpectedly → show()');
        mainWindow.show();
      } else if (mainWindow.isMinimized()) {
        dbg('watchdog: panel minimized unexpectedly → restore()');
        mainWindow.restore();
      }
    }, 250);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    // 托盘常驻：监听该事件且不调用 app.quit()，窗口全部关闭后进程仍驻留托盘
  });

  app.on('before-quit', () => {
    if (notifyTimer) clearInterval(notifyTimer);
    saveData();
  });
}

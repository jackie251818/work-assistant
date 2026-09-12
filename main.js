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
  settings: {
    opacity: 0.92,
    autoStart: false,
    notify: true,
    panelVisible: true,
    pinned: true,
    bounds: null
  }
});

let data = null;

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE(), 'utf-8');
    const parsed = JSON.parse(raw);
    const d = DEFAULT_DATA();
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : d.tasks,
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
const notifiedKeys = new Set();

const ASSET = (name) => path.join(__dirname, 'assets', name);

/** 应用固定（位置锁定）状态 —— 固定=不能拖动，与置顶解耦 */
function applyPinState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const pinned = data.settings.pinned !== false;
  mainWindow.setMovable(!pinned);
}

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
    resizable: false,
    maximizable: false,
    minimizable: false,
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

  // 应用固定（位置锁定）状态
  applyPinState();
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

function togglePanel() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    data.settings.panelVisible = false;
  } else {
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
  const visible = mainWindow ? mainWindow.isVisible() : true;
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
  saveData();
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
  if (mainWindow) mainWindow.hide();
  data.settings.panelVisible = false;
  saveData();
  updateTrayMenu();
});
ipcMain.on('panel:toggle', togglePanel);
ipcMain.on('app:quit', () => app.quit());

/* ================= 应用生命周期 ================= */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
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

    // 每 20 秒检查一次到点提醒
    checkReminders();
    notifyTimer = setInterval(checkReminders, 20 * 1000);

    // 每 60ms 按光标位置兜底更新鼠标穿透状态（即时解除由 panel:hover 完成）
    setInterval(updateMouseIgnore, 60);

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

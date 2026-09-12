const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /** 获取全部数据 { tasks, settings } */
  getData: () => ipcRenderer.invoke('data:get'),
  /** 保存（增量合并），返回保存后的完整数据 */
  saveData: (payload) => ipcRenderer.invoke('data:save', payload),
  /** 切换某日任务完成状态 */
  toggleTask: (id, done) => ipcRenderer.invoke('task:toggle', id, done),
  /** 打开设置窗口 */
  openSettings: () => ipcRenderer.send('settings:open'),
  /** 隐藏悬浮面板 */
  hidePanel: () => ipcRenderer.send('panel:hide'),
  /** 固定/取消固定面板（置顶开关） */
  setPinned: (pinned) => ipcRenderer.invoke('panel:pin', pinned),
  /** 显示/隐藏切换 */
  togglePanel: () => ipcRenderer.send('panel:toggle'),
  /** 鼠标在面板内移动时通知主进程立即解除穿透（消除轮询间隙竞态） */
  notifyHover: () => ipcRenderer.send('panel:hover'),
  /** 退出应用 */
  quit: () => ipcRenderer.send('app:quit'),
  /** 数据变更订阅，返回取消函数 */
  onDataChanged: (cb) => {
    const listener = (_e, payload) => cb(JSON.parse(payload));
    ipcRenderer.on('data:changed', listener);
    return () => ipcRenderer.removeListener('data:changed', listener);
  }
});

/* 桌面悬浮面板渲染逻辑 */
(function () {
  'use strict';
  const U = window.ReminderUtils;

  let state = { tasks: [], settings: { opacity: 0.92 } };
  let currentDay = '';
  let isCollapsed = false;

  /* 自动收起定时器 */
  let collapseTimer = null;
  function collapseEnabled() {
    return state.settings.autoCollapse !== false;
  }
  function scheduleAutoCollapse() {
    clearTimeout(collapseTimer);
    if (!collapseEnabled()) return;
    if (currentView === 'notes') return; // 记事本视图下不自动收起，避免打断编辑
    const delay = (state.settings.collapseDelay ?? 8) * 1000;
    collapseTimer = setTimeout(() => setPanelCollapsed(true), delay);
  }
  function resetAutoCollapseTimer() {
    if (isCollapsed) return;
    scheduleAutoCollapse();
  }

  const $ = (id) => document.getElementById(id);
  const listEl = $('taskList');
  const emptyEl = $('emptyState');

  /* ---------- 周期短描述 ---------- */
  function cycleText(task) {
    switch (task.repeat) {
      case 'daily':
        return '每天';
      case 'weekly': {
        const order = [1, 2, 3, 4, 5, 6, 0];
        return (
          '每' +
          (task.days || [])
            .slice()
            .sort((a, b) => order.indexOf(a) - order.indexOf(b))
            .map((d) => U.WEEK_NAMES[d].replace('周', ''))
            .join('、')
        );
      }
      case 'monthly':
        return '每月' + (task.monthDay || 1) + '号';
      case 'once':
        return task.date || '';
      default:
        return '';
    }
  }

  /* ---------- 渲染 ---------- */
  function renderHeader(date) {
    $('monthDay').textContent = date.getDate();
    $('weekDay').textContent = U.WEEK_NAMES[date.getDay()];
    $('yearText').textContent = date.getFullYear() + '年' + (date.getMonth() + 1) + '月';
  }

  function sortTasks(list, date) {
    return list
      .filter((t) => U.isTaskDue(t, date))
      .sort((a, b) => {
        // 已完成的统一沉底（置顶任务完成当天也沉底，次日自动回到最前）
        const doneA = U.isTaskDone(a, date) ? 1 : 0;
        const doneB = U.isTaskDone(b, date) ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        // 未完成任务中：置顶的排最前，多条置顶时仍按提醒时间排序
        const pinA = a.pinned === true ? 0 : 1;
        const pinB = b.pinned === true ? 0 : 1;
        if (pinA !== pinB) return pinA - pinB;
        return (a.time || '99:99').localeCompare(b.time || '99:99');
      });
  }

  function renderTasks() {
    const date = new Date();
    const due = sortTasks(state.tasks, date);
    const doneCount = due.filter((t) => U.isTaskDone(t, date)).length;

    listEl.innerHTML = '';

    if (due.length === 0) {
      emptyEl.hidden = false;
      listEl.hidden = true;
    } else {
      emptyEl.hidden = true;
      listEl.hidden = false;

      for (const task of due) {
        const done = U.isTaskDone(task, date);
        const item = document.createElement('div');
        item.className = 'task-item' + (done ? ' done' : '');
        item.dataset.id = task.id;

        const body = document.createElement('div');
        body.className = 'task-body';

        const title = document.createElement('div');
        title.className = 'task-title';
        title.textContent = task.title;
        body.appendChild(title);

        if (task.note) {
          const note = document.createElement('div');
          note.className = 'task-note';
          note.textContent = task.note;
          body.appendChild(note);
        }

        const meta = document.createElement('div');
        meta.className = 'task-meta';
        const cycle = document.createElement('span');
        cycle.className = 'tag tag-cycle';
        cycle.textContent = cycleText(task);
        meta.appendChild(cycle);
        if (task.time) {
          const time = document.createElement('span');
          time.className = 'tag tag-time';
          time.textContent = '⏰ ' + task.time;
          meta.appendChild(time);
        }
        body.appendChild(meta);

        const check = document.createElement('button');
        check.className = 'task-check';
        check.title = done ? '标记为未完成' : '标记为已完成';

        // 单条置顶按钮：置顶后该提醒始终排在列表最前面
        const pin = document.createElement('button');
        pin.className = 'task-pin' + (task.pinned === true ? ' on' : '');
        pin.title = task.pinned === true
          ? '取消置顶（恢复按时间排序）'
          : '置顶：把这条提醒移到列表最前面';
        pin.textContent = '📌';

        item.appendChild(check);
        item.appendChild(body);
        item.appendChild(pin);
        listEl.appendChild(item);
      }
    }

    // 进度
    const pct = due.length ? Math.round((doneCount / due.length) * 100) : 0;
    $('progressText').textContent =
      '今日待办 ' + due.length + ' 项 · 已完成 ' + doneCount;
    $('progressPercent').textContent = due.length ? pct + '%' : '';
    $('progressFill').style.width = pct + '%';

    const enabledCount = state.tasks.filter((t) => t.enabled !== false).length;
    $('panelFooter').textContent =
      '共 ' + enabledCount + ' 项计划生效中 · 数据仅保存在本机';
  }

  function syncPinBtn() {
    const pinned = state.settings.pinned !== false;
    const btn = $('btnPin');
    const header = document.querySelector('.panel-header');
    btn.classList.toggle('off', !pinned);
    // 固定时禁止拖动（去掉 drag 类），取消固定时恢复拖动
    header.classList.toggle('drag', !pinned && !isCollapsed);
    btn.title = pinned ? '已固定位置（无法拖动）' : '取消固定（可拖动）';
  }

  async function setPanelCollapsed(collapsed) {
    if (collapsed === isCollapsed) return;
    isCollapsed = collapsed;
    await window.api.setCollapsed(collapsed);
    document.body.classList.toggle('collapsed', collapsed);
    // 直接用 inline style 隐藏 panel，确保生效
    document.getElementById('panel').style.display = collapsed ? 'none' : '';
    syncPinBtn(); // 收起态下不能拖动（即使没固定）
    syncCollapseBtn();
    if (collapsed) {
      clearTimeout(collapseTimer);
      rotateIdx = 0;
      renderCollapsedBar(); // 收起时刷新摘要并启动多任务轮询
    } else {
      stopRotate();
      scheduleAutoCollapse();
    }
  }

  function syncCollapseBtn() {
    const btn = $('btnHide');
    if (isCollapsed) {
      btn.textContent = '▲';
      btn.title = '展开面板';
      btn.classList.remove('off');
      $('collapsedBar').hidden = false;
      const pinVal = state.settings.pinned !== false;
      $('collapsedBar').classList.toggle('drag', !pinVal);
    } else {
      btn.textContent = '▲';
      btn.title = '收起面板';
      btn.classList.remove('off');
      $('collapsedBar').hidden = true;
    }
  }

  /* 收起态多任务轮询 */
  let rotateIdx = 0;
  let rotateTimer = null;
  function stopRotate() {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }
  function renderCollapsedBar() {
    const date = new Date();
    const due = sortTasks(state.tasks, date);
    const doneCount = due.filter((t) => U.isTaskDone(t, date)).length;
    $('cbMonthDay').textContent = date.getDate();
    $('cbWeek').textContent = U.WEEK_NAMES[date.getDay()];
    $('cbSummary').textContent = `${due.length - doneCount}/${due.length} 项`;
    // 未完成任务列表：收起态每 3 秒轮询展示下一条
    const pending = due.filter((t) => !U.isTaskDone(t, date));
    const nextEl = $('cbNext');
    if (pending.length === 0) {
      stopRotate();
      nextEl.textContent = due.length ? '今日已全部完成 ✓' : '暂无安排';
    } else {
      if (rotateIdx >= pending.length) rotateIdx = 0;
      const cur = pending[rotateIdx];
      const prefix = pending.length > 1 ? `${rotateIdx + 1}/${pending.length} ` : '';
      nextEl.textContent =
        prefix + (cur.time ? '⏰' + cur.time + ' ' : '') + cur.title;
      if (pending.length > 1) {
        nextEl.classList.remove('cb-flip');
        void nextEl.offsetWidth; // 强制重排以重启动画
        nextEl.classList.add('cb-flip');
      } else {
        nextEl.classList.remove('cb-flip');
      }
      if (pending.length > 1 && isCollapsed && !rotateTimer) {
        rotateTimer = setInterval(() => {
          rotateIdx = (rotateIdx + 1) % pending.length;
          renderCollapsedBar();
        }, 3000);
      }
      if (pending.length <= 1) stopRotate();
    }
    $('btnPin2').classList.toggle('off', state.settings.pinned === false);
  }

  const THEMES = ['nebula', 'sunset', 'forest', 'sakura', 'violet', 'ink'];
  function applyTheme() {
    const t = THEMES.includes(state.settings.theme) ? state.settings.theme : 'nebula';
    THEMES.forEach((name) => document.body.classList.remove('theme-' + name));
    document.body.classList.add('theme-' + t);
  }

  function renderAll() {
    document.documentElement.style.setProperty(
      '--opacity',
      String(state.settings.opacity ?? 0.92)
    );
    applyTheme();
    const date = new Date();
    renderHeader(date);
    renderTasks();
    renderCollapsedBar();
    syncPinBtn();
    syncCollapseBtn();
    syncNotes();
  }

  /* ---------- 记事本视图 ---------- */
  const notesEl = $('notesArea');
  let notesTimer = null;
  let currentView = 'tasks';

  function switchView(view) {
    currentView = view;
    const notesMode = view === 'notes';
    $('notesView').hidden = !notesMode;
    $('taskView').hidden = notesMode;
    $('btnNotes').classList.toggle('active', notesMode);
    $('btnNotes').title = notesMode ? '返回待办' : '记事本';
    if (notesMode) {
      notesEl.focus();
      clearTimeout(collapseTimer); // 进入记事本：取消自动收起，避免编辑中被收起
    } else if (!isCollapsed) {
      scheduleAutoCollapse(); // 切回待办：恢复自动收起
    }
  }

  function syncNotes() {
    // 外部数据变更时同步文本（正在输入则不打断）
    if (document.activeElement !== notesEl && notesEl.value !== (state.notes || '')) {
      notesEl.value = state.notes || '';
    }
    $('notesCount').textContent = (state.notes || '').length + ' 字';
  }

  notesEl.addEventListener('input', () => {
    $('notesCount').textContent = notesEl.value.length + ' 字';
    clearTimeout(notesTimer);
    notesTimer = setTimeout(async () => {
      state = await window.api.saveData({ notes: notesEl.value });
    }, 500);
  });
  $('btnNotes').addEventListener('click', () => {
    switchView(currentView === 'notes' ? 'tasks' : 'notes');
  });

  /* ---------- 事件 ---------- */
  listEl.addEventListener('click', async (e) => {
    // 单条置顶 / 取消置顶
    const pinBtn = e.target.closest('.task-pin');
    if (pinBtn) {
      const item = pinBtn.closest('.task-item');
      const willPin = !pinBtn.classList.contains('on');
      state = await window.api.pinTask(item.dataset.id, willPin);
      renderTasks();
      renderCollapsedBar();
      return;
    }
    const check = e.target.closest('.task-check');
    if (!check) return;
    const item = check.closest('.task-item');
    const id = item.dataset.id;
    const willDone = !item.classList.contains('done');
    const updated = await window.api.toggleTask(id, willDone);
    state = updated;
    renderTasks();
  });

  $('btnSettings').addEventListener('click', () => window.api.openSettings());
  $('btnMinimize').addEventListener('click', () => window.api.minimizePanel());
  $('btnHide').addEventListener('click', () => {
    setPanelCollapsed(!isCollapsed); // 手动收起/展开始终可用，与「启用收缩功能」无关
  });
  $('btnExpand').addEventListener('click', () => setPanelCollapsed(false));
  $('btnPin2').addEventListener('click', async () => {
    const updated = await window.api.setPinned(state.settings.pinned === false);
    state = updated;
    syncPinBtn();
    syncCollapseBtn();
  });

  /* 光标移动：收起态 → 悬停自动展开；展开态 → 重置空闲自动收起计时器 */
  window.addEventListener('mousemove', () => {
    window.api.notifyHover();
    if (isCollapsed && collapseEnabled()) {
      setPanelCollapsed(false);
    } else {
      resetAutoCollapseTimer();
    }
  }, { passive: true });
  $('btnPin').addEventListener('click', async () => {
    const updated = await window.api.setPinned(state.settings.pinned === false);
    state = updated;
    syncPinBtn();
  });

  /* ---------- 数据变更 / 跨天刷新 ---------- */
  window.api.onDataChanged((data) => {
    state = data;
    renderAll();
  });

  setInterval(() => {
    const today = U.dateStr(new Date());
    if (today !== currentDay) {
      currentDay = today;
      renderAll();
    }
  }, 20 * 1000);

  /* ---------- 启动 ---------- */
  (async function init() {
    state = await window.api.getData();
    isCollapsed = await window.api.isCollapsed();
    if (isCollapsed) {
      document.body.classList.add('collapsed');
      document.getElementById('panel').style.display = 'none';
    }
    currentDay = U.dateStr(new Date());
    renderAll();
    scheduleAutoCollapse();
  })();
})();

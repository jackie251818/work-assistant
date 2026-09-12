/* 桌面悬浮面板渲染逻辑 */
(function () {
  'use strict';
  const U = window.ReminderUtils;

  let state = { tasks: [], settings: { opacity: 0.92 } };
  let currentDay = '';

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
        const doneA = U.isTaskDone(a, date) ? 1 : 0;
        const doneB = U.isTaskDone(b, date) ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
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

        item.appendChild(check);
        item.appendChild(body);
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
    header.classList.toggle('drag', !pinned);
    btn.title = pinned ? '已固定位置（无法拖动）' : '取消固定（可拖动）';
  }

  function renderAll() {
    document.documentElement.style.setProperty(
      '--opacity',
      String(state.settings.opacity ?? 0.92)
    );
    const date = new Date();
    renderHeader(date);
    renderTasks();
    syncPinBtn();
  }

  /* ---------- 事件 ---------- */
  listEl.addEventListener('click', async (e) => {
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
  $('btnHide').addEventListener('click', () => window.api.hidePanel());

  /* 光标在面板内移动 → 立即解除穿透（穿透态下 mousemove 由 forward 转发到此处，
     点击动作必然先产生移动，从而保证第一次点击就能落在按钮上） */
  window.addEventListener('mousemove', () => window.api.notifyHover(), {
    passive: true
  });
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
    currentDay = U.dateStr(new Date());
    renderAll();
  })();
})();

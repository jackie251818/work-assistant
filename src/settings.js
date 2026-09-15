/* 设置页逻辑：偏好设置 + 事项增删改 */
(function () {
  'use strict';
  const U = window.ReminderUtils;
  const $ = (id) => document.getElementById(id);

  let state = { tasks: [], settings: {} };
  let editingId = null; // null=关闭表单；'new'=新增；id=编辑
  let formWeekDays = [1];
  let formRemind = false;

  /* ================= 渲染 ================= */
  const THEMES = [
    { id: 'nebula', name: '星云蓝', dot: 'linear-gradient(135deg, #22d3ee, #818cf8)' },
    { id: 'sunset', name: '落日橙', dot: 'linear-gradient(135deg, #fb923c, #f472b6)' },
    { id: 'forest', name: '森林翠', dot: 'linear-gradient(135deg, #4ade80, #a3e635)' },
    { id: 'sakura', name: '樱花粉', dot: 'linear-gradient(135deg, #f9a8d4, #c4b5fd)' },
    { id: 'violet', name: '紫罗兰', dot: 'linear-gradient(135deg, #a78bfa, #f0abfc)' },
    { id: 'ink', name: '水墨', dot: 'linear-gradient(135deg, #e2e8f0, #94a3b8)' }
  ];

  function applyTheme() {
    const t = THEMES.some((x) => x.id === state.settings.theme)
      ? state.settings.theme
      : 'nebula';
    THEMES.forEach((x) => document.body.classList.remove('theme-' + x.id));
    document.body.classList.add('theme-' + t);
  }

  function renderThemeGrid() {
    const grid = $('themeGrid');
    grid.innerHTML = '';
    for (const t of THEMES) {
      const sw = document.createElement('button');
      sw.className =
        'theme-swatch' + (state.settings.theme === t.id ? ' active' : '');
      sw.title = '使用「' + t.name + '」皮肤';

      const dot = document.createElement('span');
      dot.className = 'theme-dot';
      dot.style.background = t.dot;
      sw.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'theme-name';
      name.textContent = t.name;
      sw.appendChild(name);

      sw.addEventListener('click', async () => {
        state.settings.theme = t.id;
        state = await window.api.saveData({ settings: state.settings });
        applyTheme();
        renderThemeGrid();
      });
      grid.appendChild(sw);
    }
  }

  function renderPrefs() {
    const s = state.settings;
    const pct = Math.round((s.opacity ?? 0.92) * 100);
    $('opacityRange').value = pct;
    $('opacityVal').textContent = pct + '%';
    $('swAutoStart').classList.toggle('on', !!s.autoStart);
    $('swNotify').classList.toggle('on', s.notify !== false);
    $('swAlwaysOnTop').classList.toggle('on', s.alwaysOnTop !== false);
    $('swAutoCollapse').classList.toggle('on', s.autoCollapse !== false);
    $('collapseDelay').value = s.collapseDelay ?? 8;
    applyTheme();
    renderThemeGrid();
  }

  function renderTaskCards() {
    const wrap = $('taskCards');
    wrap.innerHTML = '';

    if (state.tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-tasks';
      empty.textContent = '还没有事项，点击下方按钮添加第一条每日待办';
      wrap.appendChild(empty);
      return;
    }

    // 启用在前、置顶在前，再按创建顺序
    const sorted = state.tasks
      .slice()
      .sort(
        (a, b) =>
          Number(a.enabled === false) - Number(b.enabled === false) ||
          Number(a.pinned !== true) - Number(b.pinned !== true)
      );

    for (const task of sorted) {
      const card = document.createElement('div');
      card.className = 'set-task' + (task.enabled === false ? ' off' : '');

      const main = document.createElement('div');
      main.className = 'set-task-main';

      const title = document.createElement('div');
      title.className = 'set-task-title';
      title.textContent = task.title;
      main.appendChild(title);

      if (task.note) {
        const note = document.createElement('div');
        note.className = 'set-task-note';
        note.textContent = task.note;
        main.appendChild(note);
      }

      const schedule = document.createElement('div');
      schedule.className = 'set-task-schedule';
      const tag1 = document.createElement('span');
      tag1.className = 'tag tag-cycle';
      tag1.textContent = U.describeSchedule(task).replace(/ \d{2}:\d{2} 提醒$/, '');
      schedule.appendChild(tag1);
      if (task.time) {
        const tag2 = document.createElement('span');
        tag2.className = 'tag tag-time';
        tag2.textContent = '⏰ ' + task.time;
        schedule.appendChild(tag2);
      }
      main.appendChild(schedule);

      const ops = document.createElement('div');
      ops.className = 'set-task-ops';

      const sw = document.createElement('button');
      sw.className = 'switch' + (task.enabled !== false ? ' on' : '');
      sw.title = task.enabled !== false ? '点击停用' : '点击启用';
      sw.addEventListener('click', () => toggleEnabled(task.id));

      const btnPin = document.createElement('button');
      btnPin.className = 'op-btn' + (task.pinned === true ? ' on' : '');
      btnPin.textContent = '📌 置顶';
      btnPin.title = task.pinned === true
        ? '取消置顶（悬浮面板中恢复按时间排序）'
        : '在悬浮面板中把这条提醒置顶到最前面';
      btnPin.addEventListener('click', () => togglePinned(task.id));

      const btnEdit = document.createElement('button');
      btnEdit.className = 'op-btn';
      btnEdit.textContent = '编辑';
      btnEdit.addEventListener('click', () => openForm(task.id));

      const btnDel = document.createElement('button');
      btnDel.className = 'op-btn danger';
      btnDel.textContent = '删除';
      btnDel.addEventListener('click', () => removeTask(task.id));

      ops.appendChild(sw);
      ops.appendChild(btnPin);
      ops.appendChild(btnEdit);
      ops.appendChild(btnDel);

      card.appendChild(main);
      card.appendChild(ops);
      wrap.appendChild(card);
    }
  }

  /* ================= 偏好 ================= */
  let opacityTimer = null;
  $('opacityRange').addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    $('opacityVal').textContent = pct + '%';
    clearTimeout(opacityTimer);
    opacityTimer = setTimeout(async () => {
      state.settings.opacity = pct / 100;
      state = await window.api.saveData({ settings: state.settings });
    }, 150);
  });

  $('swAutoStart').addEventListener('click', async () => {
    state.settings.autoStart = !state.settings.autoStart;
    state = await window.api.saveData({ settings: state.settings });
    renderPrefs();
  });

  $('swNotify').addEventListener('click', async () => {
    state.settings.notify = state.settings.notify === false;
    state = await window.api.saveData({ settings: state.settings });
    renderPrefs();
  });

  $('swAlwaysOnTop').addEventListener('click', async () => {
    state.settings.alwaysOnTop = state.settings.alwaysOnTop === false;
    state = await window.api.saveData({ settings: state.settings });
    renderPrefs();
  });

  $('swAutoCollapse').addEventListener('click', async () => {
    state.settings.autoCollapse = state.settings.autoCollapse === false;
    state = await window.api.saveData({ settings: state.settings });
    renderPrefs();
  });

  let delayTimer = null;
  $('collapseDelay').addEventListener('input', async (e) => {
    let v = Number(e.target.value);
    if (!Number.isInteger(v) || v < 3) v = 3;
    if (v > 60) v = 60;
    state.settings.collapseDelay = v;
    clearTimeout(delayTimer);
    delayTimer = setTimeout(async () => {
      state = await window.api.saveData({ settings: state.settings });
    }, 200);
  });

  /* ================= 任务增删改 ================= */
  async function togglePinned(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.pinned = task.pinned !== true;
    state = await window.api.saveData({ tasks: state.tasks });
    renderTaskCards();
  }

  async function toggleEnabled(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.enabled = task.enabled === false;
    state = await window.api.saveData({ tasks: state.tasks });
    renderTaskCards();
  }

  async function removeTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    if (!confirm('确定删除事项「' + task.title + '」吗？')) return;
    state.tasks = state.tasks.filter((t) => t.id !== id);
    state = await window.api.saveData({ tasks: state.tasks });
    if (editingId === id) closeForm();
    renderTaskCards();
  }

  /* ---------- 表单 ---------- */
  function openForm(id) {
    editingId = id || 'new';
    const panel = $('formPanel');
    panel.classList.add('show');

    let task;
    if (id && id !== 'new') {
      task = state.tasks.find((t) => t.id === id);
    }
    task = task || {
      title: '',
      note: '',
      repeat: 'daily',
      days: [1],
      monthDay: 1,
      date: U.dateStr(new Date()),
      time: '',
      enabled: true,
      done: {}
    };

    $('fTitle').value = task.title || '';
    $('fNote').value = task.note || '';
    $('fRepeat').value = task.repeat || 'daily';
    $('fMonthDay').value = task.monthDay || 1;
    $('fDate').value = task.date || U.dateStr(new Date());
    formWeekDays = Array.isArray(task.days) ? task.days.slice() : [];
    formRemind = !!task.time;
    $('fTime').value = task.time || '09:00';

    syncRepeatFields();
    syncWeekPicker();
    syncRemind();

    $('fTitle').focus();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeForm() {
    editingId = null;
    $('formPanel').classList.remove('show');
  }

  function syncRepeatFields() {
    const repeat = $('fRepeat').value;
    $('fieldWeek').hidden = repeat !== 'weekly';
    $('fieldMonthDay').hidden = repeat !== 'monthly';
    $('fieldDate').hidden = repeat !== 'once';
  }

  function syncWeekPicker() {
    document.querySelectorAll('.week-dot').forEach((btn) => {
      btn.classList.toggle(
        'on',
        formWeekDays.includes(Number(btn.dataset.day))
      );
    });
  }

  function syncRemind() {
    $('swRemind').classList.toggle('on', formRemind);
    $('fTime').hidden = !formRemind;
    $('remindMsg').textContent = formRemind
      ? '将在每日该时间弹出 Windows 通知'
      : '关闭后仅展示，不弹系统通知';
  }

  /* ================= 自动更新 ================= */
  function renderUpdateState(s) {
    if (!s) return;
    $('updateMsg').textContent = s.message || '启动后自动检查更新；发现新版会在后台下载，完成后提示你重启安装';
    $('updateMsg').classList.toggle('update-error', s.status === 'error');

    const busy = s.status === 'checking' || s.status === 'downloading' || s.status === 'available';
    $('btnCheckUpdate').textContent =
      s.status === 'checking' ? '正在检查…' :
      s.status === 'downloading' ? '下载中 ' + (s.percent || 0) + '%' : '检查更新';
    $('btnCheckUpdate').disabled = busy;

    const downloading = s.status === 'downloading' || s.status === 'available';
    $('updateProgress').hidden = !downloading;
    $('updateProgressBar').style.width = (s.percent || 0) + '%';

    $('btnInstallUpdate').hidden = s.status !== 'downloaded';
  }

  $('btnCheckUpdate').addEventListener('click', async () => {
    $('btnCheckUpdate').disabled = true;
    $('updateMsg').textContent = '正在检查更新…';
    $('updateMsg').classList.remove('update-error');
    const s = await window.api.checkUpdate();
    renderUpdateState(s);
  });
  $('btnInstallUpdate').addEventListener('click', () => {
    window.api.installUpdate();
  });
  window.api.onUpdateStatus(renderUpdateState);

  $('btnAdd').addEventListener('click', () => openForm('new'));
  $('btnCancel').addEventListener('click', closeForm);
  $('fRepeat').addEventListener('change', syncRepeatFields);
  $('swRemind').addEventListener('click', () => {
    formRemind = !formRemind;
    syncRemind();
  });

  document.querySelectorAll('.week-dot').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = Number(btn.dataset.day);
      const i = formWeekDays.indexOf(day);
      if (i >= 0) formWeekDays.splice(i, 1);
      else formWeekDays.push(day);
      syncWeekPicker();
    });
  });

  $('btnSave').addEventListener('click', async () => {
    const title = $('fTitle').value.trim();
    if (!title) {
      alert('请填写事项名称');
      $('fTitle').focus();
      return;
    }

    const repeat = $('fRepeat').value;
    let monthDay = Number($('fMonthDay').value);
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) {
      alert('每月几号请填写 1-31 之间的数字');
      return;
    }
    const date = $('fDate').value;
    if (repeat === 'weekly' && formWeekDays.length === 0) {
      alert('每周重复至少选择一个星期');
      return;
    }
    if (repeat === 'once' && !date) {
      alert('请选择日期');
      return;
    }

    const patch = {
      title,
      note: $('fNote').value.trim(),
      repeat,
      days: repeat === 'weekly' ? formWeekDays.slice().sort() : [],
      monthDay,
      date: repeat === 'once' ? date : '',
      time: formRemind ? $('fTime').value : ''
    };

    if (editingId === 'new') {
      state.tasks.push(
        Object.assign(
          { id: U.uid(), enabled: true, done: {} },
          patch
        )
      );
    } else {
      const task = state.tasks.find((t) => t.id === editingId);
      if (task) Object.assign(task, patch);
    }

    state = await window.api.saveData({ tasks: state.tasks });
    closeForm();
    renderTaskCards();
  });

  /* ================= 数据同步 ================= */
  window.api.onDataChanged((data) => {
    state = data;
    renderPrefs();
    renderTaskCards();
  });

  /* ================= 启动 ================= */
  (async function init() {
    state = await window.api.getData();
    renderPrefs();
    renderTaskCards();

    $('appVersion').textContent = 'v' + await window.api.getVersion();
    renderUpdateState(await window.api.getUpdateState());
  })();
})();

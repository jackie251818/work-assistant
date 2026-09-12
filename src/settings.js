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
  function renderPrefs() {
    const s = state.settings;
    const pct = Math.round((s.opacity ?? 0.92) * 100);
    $('opacityRange').value = pct;
    $('opacityVal').textContent = pct + '%';
    $('swAutoStart').classList.toggle('on', !!s.autoStart);
    $('swNotify').classList.toggle('on', s.notify !== false);
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

    // 启用在前，再按创建顺序
    const sorted = state.tasks
      .slice()
      .sort((a, b) => Number(a.enabled === false) - Number(b.enabled === false));

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

      const btnEdit = document.createElement('button');
      btnEdit.className = 'op-btn';
      btnEdit.textContent = '编辑';
      btnEdit.addEventListener('click', () => openForm(task.id));

      const btnDel = document.createElement('button');
      btnDel.className = 'op-btn danger';
      btnDel.textContent = '删除';
      btnDel.addEventListener('click', () => removeTask(task.id));

      ops.appendChild(sw);
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

  /* ================= 任务增删改 ================= */
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
  })();
})();

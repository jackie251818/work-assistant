/**
 * 共享工具：日期处理、任务调度匹配（主进程与渲染进程共用）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReminderUtils = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /** Date -> "YYYY-MM-DD"（本地时区） */
  function dateStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** "HH:MM"（本地时区） */
  function timeStr(d) {
    d = d || new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function parseDate(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  /**
   * 判断任务在指定日期是否需要展示
   * repeat: daily（每天）| weekly（每周指定星期）| monthly（每月几号）| once（仅一次）
   */
  function isTaskDue(task, date) {
    if (!task || task.enabled === false) return false;
    date = date || new Date();
    switch (task.repeat) {
      case 'daily':
        return true;
      case 'weekly':
        return Array.isArray(task.days) && task.days.includes(date.getDay());
      case 'monthly':
        return Number(task.monthDay) === date.getDate();
      case 'once':
        return task.date === dateStr(date);
      default:
        return false;
    }
  }

  /** 任务在某日是否已完成 */
  function isTaskDone(task, date) {
    const key = dateStr(date);
    return !!(task.done && task.done[key]);
  }

  /** 调度规则的中文描述 */
  function describeSchedule(task) {
    let base = '';
    switch (task.repeat) {
      case 'daily':
        base = '每天';
        break;
      case 'weekly': {
        const order = [1, 2, 3, 4, 5, 6, 0];
        const days = (task.days || [])
          .slice()
          .sort((a, b) => order.indexOf(a) - order.indexOf(b))
          .map((d) => WEEK_NAMES[d]);
        base = days.length ? '每' + days.join('、') : '未选择星期';
        break;
      }
      case 'monthly':
        base = '每月' + (task.monthDay || 1) + '号';
        break;
      case 'once':
        base = task.date ? '仅 ' + task.date : '未选择日期';
        break;
    }
    return base + (task.time ? ' ' + task.time + ' 提醒' : '');
  }

  /** 生成唯一 ID */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    WEEK_NAMES,
    pad,
    dateStr,
    timeStr,
    parseDate,
    isTaskDue,
    isTaskDone,
    describeSchedule,
    uid
  };
});

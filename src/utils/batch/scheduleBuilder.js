/**
 * 定时任务「运行时间」编辑器 <-> 既有数据格式 的双向转换
 *
 * 数据格式是硬约束，任何界面改动都只能落到这三个字段上：
 *   runType: 'daily' | 'cron'
 *   runTime: 'HH:mm' | null          （仅 daily 有效，调度器直接按字符串比较）
 *   cronExpression: string           （仅 cron 有效，5 段：分 时 日 月 周）
 *
 * 编辑器状态（ScheduleState）只存在于内存中，不落库：
 *   { freq, hour, minute, weekdays, dayOfMonth, interval, cronExpression }
 */

import {
  calculateNextRuns,
  validateCronExpression,
} from "./cronUtils.js";

/** 频率档位，顺序即界面顺序 */
export const SCHEDULE_FREQS = ["daily", "weekly", "monthly", "hourly", "custom"];

/** 星期候选值，周一在前、周日在后（0 表示周日，与 cron 一致） */
export const SCHEDULE_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

/** 「每隔几小时」的可选间隔，只给能整除 24 的值 */
export const SCHEDULE_INTERVALS = [1, 2, 3, 4, 6, 8, 12];

/** 常用时间胶囊 */
export const SCHEDULE_TIME_PRESETS = ["06:00", "08:00", "12:00", "18:00", "20:00", "22:00"];

/** 自定义 Cron 的示例 */
export const SCHEDULE_CRON_SAMPLES = [
  { value: "0 8 * * *", label: "每天 08:00" },
  { value: "0 8 * * 1-5", label: "工作日 08:00" },
  { value: "0 */2 * * *", label: "每 2 小时" },
  { value: "30 21 L * *", label: "每月最后一天 21:30" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const WEEK_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

const isInt = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;

/** 时 / 分 / 日 下拉选项 */
export const SCHEDULE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  label: pad2(i),
  value: i,
}));

export const SCHEDULE_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => ({
  label: pad2(i),
  value: i,
}));

export const SCHEDULE_DAY_OPTIONS = [
  ...Array.from({ length: 28 }, (_, i) => ({ label: `${i + 1} 号`, value: i + 1 })),
  { label: "最后一天", value: "L" },
];

/** 归一化：去首尾空白、压缩连续空白 */
export const normalizeCron = (expression) =>
  String(expression || "").trim().replace(/\s+/g, " ");

/** 新建一个编辑器状态 */
export const createScheduleState = (patch = {}) => ({
  freq: "daily",
  hour: 8,
  minute: 0,
  weekdays: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  interval: 2,
  cronExpression: "0 8 * * *",
  ...patch,
});

/**
 * 编辑器状态 -> Cron 表达式
 * 无法生成时返回空字符串（例如「每周」一天都没选）
 */
export const buildCronFromState = (state) => {
  if (!state) return "";

  switch (state.freq) {
    case "daily":
      return `${state.minute} ${state.hour} * * *`;
    case "weekly": {
      const days = Array.isArray(state.weekdays) ? [...state.weekdays] : [];
      if (days.length === 0) return "";
      const sorted = days.map(Number).sort((a, b) => a - b);
      const dow = sorted.length === 7 ? "*" : sorted.join(",");
      return `${state.minute} ${state.hour} * * ${dow}`;
    }
    case "monthly": {
      const dom = state.dayOfMonth === "L" ? "L" : Number(state.dayOfMonth);
      return `${state.minute} ${state.hour} ${dom} * *`;
    }
    case "hourly":
      return `${state.minute} */${state.interval} * * *`;
    case "custom":
      return normalizeCron(state.cronExpression);
    default:
      return "";
  }
};

/**
 * 编辑器状态 -> 落库字段（结构必须与旧版本完全一致）
 */
export const buildTaskSchedule = (state) => {
  if (state && state.freq === "daily") {
    return {
      runType: "daily",
      runTime: `${pad2(state.hour)}:${pad2(state.minute)}`,
      cronExpression: "",
    };
  }
  return {
    runType: "cron",
    runTime: null,
    cronExpression: buildCronFromState(state),
  };
};

/** 解析星期字段，支持 1-5 / 0,6 / 1,3,5 / 7 */
const parseDowField = (field) => {
  const out = new Set();
  const parts = String(field).split(",");

  for (const raw of parts) {
    const part = raw.trim();
    if (/^\d$/.test(part)) {
      const n = Number(part);
      if (n > 7) return null;
      out.add(n === 7 ? 0 : n);
      continue;
    }
    const range = /^(\d)-(\d)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end || end > 7) return null;
      for (let i = start; i <= end; i++) out.add(i === 7 ? 0 : i);
      continue;
    }
    return null;
  }

  if (out.size === 0) return null;
  return [...out].sort((a, b) => a - b);
};

/**
 * 尝试把表达式反推回「频率 + 参数」
 * 只认完全等价的简单形态，其余一律返回 null（由调用方落回「自定义」）
 */
const parseSimpleCron = (expression) => {
  const parts = normalizeCron(expression).split(" ");
  if (parts.length !== 5) return null;

  const [minuteField, hourField, domField, monthField, dowField] = parts;
  if (monthField !== "*") return null;

  // 每隔 N 小时：M */N * * *
  if (/^\d+$/.test(minuteField) && /^\*\/\d+$/.test(hourField)) {
    const interval = Number(hourField.slice(2));
    if (
      domField === "*" &&
      dowField === "*" &&
      SCHEDULE_INTERVALS.includes(interval) &&
      isInt(Number(minuteField), 0, 59)
    ) {
      return { freq: "hourly", minute: Number(minuteField), interval };
    }
    return null;
  }

  if (!/^\d+$/.test(minuteField) || !/^\d+$/.test(hourField)) return null;
  const minute = Number(minuteField);
  const hour = Number(hourField);
  if (!isInt(minute, 0, 59) || !isInt(hour, 0, 23)) return null;

  if (domField === "*" && dowField === "*") {
    return { freq: "daily", minute, hour };
  }

  if (domField === "*" && dowField !== "*") {
    const weekdays = parseDowField(dowField);
    if (!weekdays) return null;
    return { freq: "weekly", minute, hour, weekdays };
  }

  if (dowField === "*" && domField !== "*") {
    if (domField === "L") return { freq: "monthly", minute, hour, dayOfMonth: "L" };
    if (!/^\d+$/.test(domField)) return null;
    const dom = Number(domField);
    // 界面只提供 1-28 与「最后一天」，29-31 会掉回自定义，避免小月整月不跑
    if (!isInt(dom, 1, 28)) return null;
    return { freq: "monthly", minute, hour, dayOfMonth: dom };
  }

  return null;
};

/**
 * 既有任务 -> 编辑器状态
 * 认不出来的表达式原样放进「自定义」，一个字符都不改
 */
export const inferScheduleFromTask = (task) => {
  const base = createScheduleState();
  if (!task) return base;

  if (task.runType === "daily") {
    const matched = /^(\d{1,2}):(\d{2})$/.exec(String(task.runTime || ""));
    if (matched) {
      const hour = Number(matched[1]);
      const minute = Number(matched[2]);
      if (isInt(hour, 0, 23) && isInt(minute, 0, 59)) {
        return { ...base, freq: "daily", hour, minute };
      }
    }
    return { ...base, freq: "daily" };
  }

  const expression = normalizeCron(task.cronExpression);
  const simple = parseSimpleCron(expression);
  if (simple) return { ...base, ...simple };

  return {
    ...base,
    freq: "custom",
    cronExpression: expression,
  };
};

/** 一句话摘要，用于标签后面的蓝色胶囊 */
export const describeSchedule = (state) => {
  if (!state) return "";

  const time = `${pad2(state.hour)}:${pad2(state.minute)}`;

  if (state.freq === "daily") return `每天 ${time}`;

  if (state.freq === "weekly") {
    const days = Array.isArray(state.weekdays) ? [...state.weekdays] : [];
    if (days.length === 0) return "未选择星期";
    if (days.length === 7) return `每天 ${time}`;
    const sorted = days.map(Number).sort((a, b) => a - b);
    const key = sorted.join(",");
    if (key === "1,2,3,4,5") return `工作日 ${time}`;
    if (key === "0,6") return `周末 ${time}`;
    return `每周${sorted.map((d) => WEEK_LABEL[d]).join("、")} ${time}`;
  }

  if (state.freq === "monthly") {
    const domText = state.dayOfMonth === "L" ? "最后一天" : `${state.dayOfMonth} 号`;
    return `每月${domText} ${time}`;
  }

  if (state.freq === "hourly") {
    return `每 ${state.interval} 小时（第 ${state.minute} 分）`;
  }

  return "自定义表达式";
};

/**
 * 编辑器侧的严格 Cron 校验
 *
 * 共享的 validateCronExpression 用 parseInt 取数，`8:00` 会被当成第 8 分钟放行，
 * 而这恰好是用户最常犯的错。这里先做字符集白名单，再把结果交给共享校验兜底。
 * 只作用于编辑器输入，不改动 cronUtils，避免影响旧任务与导入导出。
 *
 * @returns {string} 空字符串表示通过
 */
export const validateCronStrict = (expression) => {
  const normalized = normalizeCron(expression);
  if (!normalized) return "请输入 Cron 表达式";

  const parts = normalized.split(" ");
  if (parts.length !== 5) {
    return `Cron 需要 5 段（分 时 日 月 周），当前 ${parts.length} 段`;
  }

  for (const part of parts) {
    if (!/^[0-9*,/\-LW#?]+$/.test(part)) {
      return `Cron 字段「${part}」含有非法字符，只支持数字和 * , - / L W # ?`;
    }
  }

  const result = validateCronExpression(normalized);
  return result.valid ? "" : result.message;
};

/**
 * 校验编辑器状态
 * @returns {string} 空字符串表示通过
 */
export const validateScheduleState = (state) => {
  if (!state) return "运行时间未设置";

  if (state.freq === "weekly") {
    const days = Array.isArray(state.weekdays) ? state.weekdays : [];
    if (days.length === 0) return "请至少选择一天";
  }

  if (state.freq === "custom") {
    return validateCronStrict(state.cronExpression);
  }

  return "";
};

/** 把 "2026/10/19 08:00:00" 之类的本地化字符串还原成 Date */
const parseLocaleString = (value) => {
  const matched = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2}):(\d{2})/.exec(
    String(value || ""),
  );
  if (!matched) return null;
  const date = new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Number(matched[4]),
    Number(matched[5]),
    Number(matched[6]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatRelative = (date) => {
  const minutes = Math.max(0, Math.round((date.getTime() - Date.now()) / 60000));
  if (minutes < 1) return "不到 1 分钟后";
  if (minutes < 60) return `${minutes} 分钟后`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return `${hours} 小时${restMinutes ? ` ${restMinutes} 分` : ""}后`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return `${days} 天${restHours ? ` ${restHours} 小时` : ""}后`;
};

const formatRunLabel = (date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target - today) / 86400000);

  let prefix = "";
  if (diffDays === 0) prefix = "今天 ";
  else if (diffDays === 1) prefix = "明天 ";
  else if (diffDays === 2) prefix = "后天 ";

  return `${prefix}${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())} 周${WEEK_LABEL[date.getDay()]}`;
};

/**
 * 用与真实调度完全相同的 cronUtils 计算未来 N 次执行时间，
 * 只做展示层格式化：label 供主文案，relative 供「还有多久」。
 */
export const previewSchedule = (expression, count = 5) => {
  const normalized = normalizeCron(expression);
  const parts = normalized.split(" ");
  if (parts.length !== 5) return [];
  if (validateCronStrict(normalized)) return [];

  const [minuteField, hourField, domField, monthField, dowField] = parts;
  const runs = calculateNextRuns(
    minuteField,
    hourField,
    domField,
    monthField,
    dowField,
    count,
  );

  return runs.map((raw) => {
    const date = parseLocaleString(raw);
    if (!date) return { label: raw, short: raw, relative: "" };
    return {
      label: formatRunLabel(date),
      short: `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
        date.getHours(),
      )}:${pad2(date.getMinutes())}`,
      relative: formatRelative(date),
    };
  });
};

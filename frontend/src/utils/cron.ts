/**
 * cron 表达式 → 中文可读描述（设置页「备份周期」预览用）。
 *
 * 语义与后端实际使用的 node-cron@3 对齐：5 段（分 时 日 月 周），
 * 「日」和「周」同时限定时是 **AND**（两个条件都满足才执行），
 * 这点和 Vixie cron 的 OR 语义不同，描述里要区分开。
 * 只描述能识别的写法；识别不了就原样返回，不做猜测。
 */
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type ParsedField =
  | { kind: 'any' }
  | { kind: 'step'; step: number }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'values'; values: number[] };

function isNumber(value: string): boolean {
  return /^\d+$/.test(value);
}

/** `*` / `*\/N` / `a-b` / `a,b,c` 四种写法；其他写法返回 null（交给调用方原样显示） */
function parseField(value: string): ParsedField | null {
  if (value === '*') return { kind: 'any' };
  const stepMatch = /^\*\/(\d+)$/.exec(value);
  if (stepMatch) return { kind: 'step', step: Number(stepMatch[1]) };
  const rangeMatch = /^(\d+)-(\d+)$/.exec(value);
  if (rangeMatch) {
    const from = Number(rangeMatch[1]);
    const to = Number(rangeMatch[2]);
    return from <= to ? { kind: 'range', from, to } : null;
  }
  const tokens = value.split(',');
  if (tokens.every(isNumber)) return { kind: 'values', values: tokens.map(Number) };
  return null;
}

/** `*\/N` 形式的步进值 */
function stepOf(value: string): number | null {
  const match = /^\*\/(\d+)$/.exec(value);
  return match ? Number(match[1]) : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function rangeValues(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += 1) values.push(value);
  return values;
}

/** 0/7 都是周日 */
function weekdayName(value: number): string {
  return WEEKDAY_NAMES[value % 7];
}

/** 月份限定：null = 每月（不限），undefined = 识别不了 */
function monthPhrase(value: string): string | null | undefined {
  const parsed = parseField(value);
  if (!parsed) return undefined;
  if (parsed.kind === 'any') return null;
  if (parsed.kind === 'step') return `每 ${parsed.step} 个月`;
  if (parsed.kind === 'range') {
    return parsed.from === parsed.to ? `${parsed.from} 月` : `${parsed.from}–${parsed.to} 月`;
  }
  return `${uniqueSorted(parsed.values).join('、')} 月`;
}

/**
 * 日限定：null = 每天（不限），undefined = 识别不了。
 * withMonthlyPrefix=false 用于「年/月已限定时」避免出现「3 月每月 1 日」这种重复。
 */
function domPhrase(value: string, withMonthlyPrefix: boolean): string | null | undefined {
  const parsed = parseField(value);
  if (!parsed) return undefined;
  if (parsed.kind === 'any') return null;
  const prefix = withMonthlyPrefix ? '每月 ' : '';
  if (parsed.kind === 'step') return `每 ${parsed.step} 天`;
  if (parsed.kind === 'range') {
    return parsed.from === parsed.to
      ? `${prefix}${parsed.from} 日`
      : `${prefix}${parsed.from}–${parsed.to} 日`;
  }
  return `${prefix}${uniqueSorted(parsed.values).join('、')} 日`;
}

/** 周限定：返回「周一、周三」/「工作日」/「周末」/「每天」；null = 不限，undefined = 识别不了 */
function dowNames(value: string): string | null | undefined {
  const parsed = parseField(value);
  if (!parsed) return undefined;
  if (parsed.kind === 'any') return null;
  if (parsed.kind === 'step') return undefined;
  const days = uniqueSorted(
    (parsed.kind === 'range' ? rangeValues(parsed.from, parsed.to) : parsed.values).map(
      (day) => day % 7,
    ),
  );
  if (days.length === 7) return '每天';
  if (days.join(',') === '1,2,3,4,5') return '工作日';
  if (days.length === 2 && days[0] === 0 && days[1] === 6) return '周末';
  return days.map(weekdayName).join('、');
}

/** 周限定的成句写法：每周一、工作日、周末；null = 不限，undefined = 识别不了 */
function dowPhrase(value: string): string | null | undefined {
  const names = dowNames(value);
  if (names === undefined || names === null) return names;
  if (names === '每天' || names === '工作日' || names === '周末') return names;
  return `每${names}`;
}

export function formatCronDescription(expression?: string | null): string {
  const raw = String(expression || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const parts = raw.split(' ');
  if (parts.length !== 5) return raw;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // 1) 具体时刻（分、时都是数字）→ HH:MM，再叠加日/月/周限定
  if (isNumber(minute) && isNumber(hour)) {
    const time = `${pad2(Number(hour))}:${pad2(Number(minute))}`;

    const monthPart = monthPhrase(month);
    const domPart = domPhrase(dayOfMonth, true);
    const domBare = domPhrase(dayOfMonth, false);
    const dowPartRaw = dowPhrase(dayOfWeek);
    const dowNameRaw = dowNames(dayOfWeek);
    if (
      monthPart === undefined ||
      domPart === undefined ||
      domBare === undefined ||
      dowPartRaw === undefined ||
      dowNameRaw === undefined
    ) {
      return raw;
    }

    // 「所有星期」等价于不限定，避免描述成「每天且当天是每天」
    const dowPart = dowPartRaw === '每天' ? null : dowPartRaw;
    const dowNameText = dowNameRaw === '每天' ? null : dowNameRaw;

    let when: string;
    if (monthPart) {
      const yearPrefix = `每年 ${monthPart}`;
      if (domPart && dowNameText) when = `${yearPrefix} ${domBare}且当天是${dowNameText}`;
      else if (domPart) when = `${yearPrefix} ${domBare}`;
      else if (dowPart) when = `${yearPrefix}${dowPart}`;
      else when = `${yearPrefix}每天`;
    } else if (domPart && dowNameText) {
      // node-cron：日、周同时限定时两个条件都要求满足
      when = `${domPart}且当天是${dowNameText}`;
    } else if (domPart) {
      when = domPart;
    } else if (dowPart) {
      when = dowPart;
    } else {
      when = '每天';
    }
    return `${when} ${time}`;
  }

  // 2) 分钟粒度的周期（日/月/周都不限定时）
  const noDateFilter = dayOfMonth === '*' && month === '*' && dayOfWeek === '*';
  if (noDateFilter) {
    if (minute === '*' && hour === '*') return '每分钟';

    const minuteStep = stepOf(minute);
    if (minuteStep && hour === '*') return `每 ${minuteStep} 分钟`;

    if (isNumber(minute) && hour === '*') {
      return Number(minute) === 0 ? '每小时整点' : `每小时第 ${Number(minute)} 分钟`;
    }

    const hourStep = stepOf(hour);
    if (isNumber(minute) && hourStep) {
      return Number(minute) === 0
        ? `每 ${hourStep} 小时`
        : `每 ${hourStep} 小时（第 ${Number(minute)} 分）`;
    }
  }

  return raw;
}

/**
 * 页面展示用：可读描述 + 原始表达式，如「每分钟（* * * * *）」。
 * 识别不了时描述就是原文，不再重复套一层括号。
 */
export function formatCronSummary(expression?: string | null): string {
  const raw = String(expression || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const description = formatCronDescription(raw);
  return description === raw ? raw : `${description}（${raw}）`;
}

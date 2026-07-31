/**
 * 支持的时间输入类型。
 */
export type DateInput = Date | string | number;

/**
 * 时间戳单位。
 */
export type TimestampUnit = "auto" | "second" | "millisecond";

/**
 * 常用日期时间格式。
 */
export type DateFormatPreset =
  | "date"
  | "time"
  | "timeSecond"
  | "datetime"
  | "datetimeSecond"
  | "compactDate"
  | "compactDatetime"
  | "isoDate"
  | "isoDatetime";

/**
 * 日期时间格式化配置。
 */
export interface FormatDateOptions {
  /**
   * 预设格式。
   *
   * @default "datetimeSecond"
   */
  preset?: DateFormatPreset;

  /**
   * 自定义格式模板。
   *
   * 设置后优先于 preset。
   *
   * 支持：
   * YYYY MM DD HH mm ss SSS
   *
   * @example
   * "YYYY-MM-DD HH:mm:ss"
   */
  pattern?: string;

  /**
   * 输入数字的时间戳单位。
   *
   * @default "auto"
   */
  timestampUnit?: TimestampUnit;

  /**
   * IANA 时区。
   *
   * @example
   * "Asia/Shanghai"
   * "America/Los_Angeles"
   */
  timeZone?: string;

  /**
   * 国际化区域。
   *
   * @default "zh-CN"
   */
  locale?: string;

  /**
   * 无效输入时返回的文本。
   *
   * @default "--"
   */
  fallback?: string;
}

/**
 * Intl 日期格式化配置。
 */
export interface FormatIntlDateOptions extends Intl.DateTimeFormatOptions {
  /**
   * 国际化区域。
   *
   * @default "zh-CN"
   */
  locale?: string;

  /**
   * 数字时间戳单位。
   *
   * @default "auto"
   */
  timestampUnit?: TimestampUnit;

  /**
   * 无效输入时返回的文本。
   *
   * @default "--"
   */
  fallback?: string;
}

/**
 * 相对时间格式化配置。
 */
export interface FormatRelativeTimeOptions {
  /**
   * 作为比较基准的时间。
   *
   * @default Date.now()
   */
  base?: DateInput;

  /**
   * 数字时间戳单位。
   *
   * @default "auto"
   */
  timestampUnit?: TimestampUnit;

  /**
   * 国际化区域。
   *
   * @default "zh-CN"
   */
  locale?: string;

  /**
   * 是否使用“昨天”“明天”等自然语言。
   *
   * @default "auto"
   */
  numeric?: Intl.RelativeTimeFormatNumeric;

  /**
   * 无效输入时返回的文本。
   *
   * @default "--"
   */
  fallback?: string;
}

/**
 * 时间范围格式化配置。
 */
export interface FormatDateRangeOptions extends FormatDateOptions {
  /**
   * 起止时间分隔符。
   *
   * @default " ~ "
   */
  separator?: string;

  /**
   * 同一天时是否省略结束日期。
   *
   * @default true
   */
  collapseSameDate?: boolean;
}

/**
 * 持续时间格式化配置。
 */
export interface FormatDurationOptions {
  /**
   * 输入单位。
   *
   * @default "millisecond"
   */
  inputUnit?: "millisecond" | "second";

  /**
   * 最多展示多少个时间单位。
   *
   * @default 2
   */
  maxUnits?: number;

  /**
   * 是否展示毫秒。
   *
   * @default false
   */
  showMilliseconds?: boolean;

  /**
   * 是否使用紧凑格式。
   *
   * @example
   * true  -> 1h 2m 3s
   * false -> 1小时2分钟3秒
   *
   * @default false
   */
  compact?: boolean;

  /**
   * 无效输入时返回的文本。
   *
   * @default "--"
   */
  fallback?: string;
}

/**
 * 日期时间增减配置。
 *
 * 使用负数表示减去对应单位。
 */
export interface AddDateOptions {
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/**
 * 日期格式模板。
 */
const DATE_PATTERNS: Record<DateFormatPreset, string> = {
  date: "YYYY-MM-DD",
  time: "HH:mm",
  timeSecond: "HH:mm:ss",
  datetime: "YYYY-MM-DD HH:mm",
  datetimeSecond: "YYYY-MM-DD HH:mm:ss",
  compactDate: "YYYYMMDD",
  compactDatetime: "YYYYMMDDHHmmss",
  isoDate: "YYYY-MM-DD",
  isoDatetime: "YYYY-MM-DDTHH:mm:ss",
};

/**
 * 格式化日期时间。
 *
 * @param input 日期、时间字符串或时间戳。
 * @param options 格式化配置。
 *
 * @example
 * formatDateTime(new Date());
 * // "2026-07-15 09:30:00"
 *
 * @example
 * formatDateTime(1752552600, {
 *   timestampUnit: "second",
 * });
 *
 * @example
 * formatDateTime(date, {
 *   pattern: "YYYY年MM月DD日 HH:mm:ss",
 *   timeZone: "Asia/Shanghai",
 * });
 */
export function formatDateTime(input: DateInput, options: FormatDateOptions = {}): string {
  const {
    preset = "datetimeSecond",
    pattern,
    timestampUnit = "auto",
    timeZone,
    locale = "zh-CN",
    fallback = "--",
  } = options;

  const date = toDate(input, timestampUnit);

  if (!date) {
    return fallback;
  }

  const format = pattern ?? DATE_PATTERNS[preset];

  try {
    const parts = getDateParts(date, {
      locale,
      ...(timeZone === undefined ? {} : { timeZone }),
    });

    return applyDatePattern(format, parts);
  } catch {
    return fallback;
  }
}

/**
 * 使用 Intl.DateTimeFormat 格式化日期。
 *
 * 适合需要中文星期、月份名称、时区名称等场景。
 *
 * @example
 * formatDateIntl(new Date(), {
 *   year: "numeric",
 *   month: "long",
 *   day: "2-digit",
 *   weekday: "long",
 * });
 * // "2026年7月15日星期三"
 */
export function formatDateIntl(input: DateInput, options: FormatIntlDateOptions = {}): string {
  const { locale = "zh-CN", timestampUnit = "auto", fallback = "--", ...intlOptions } = options;

  const date = toDate(input, timestampUnit);

  if (!date) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat(locale, intlOptions).format(date);
  } catch {
    return fallback;
  }
}

/**
 * 格式化相对时间。
 *
 * @example
 * formatRelativeTime(Date.now() - 30_000);
 * // "30秒前"
 *
 * @example
 * formatRelativeTime(Date.now() + 3_600_000);
 * // "1小时后"
 */
export function formatRelativeTime(
  input: DateInput,
  options: FormatRelativeTimeOptions = {},
): string {
  const {
    base,
    timestampUnit = "auto",
    locale = "zh-CN",
    numeric = "auto",
    fallback = "--",
  } = options;

  const target = toDate(input, timestampUnit);
  /*
   * 默认基准时间已经是毫秒精度，不能继续套用 input 的时间戳单位。
   * 只有显式传入 base 时，才让 base 与 input 使用相同单位。
   */
  const baseDate = base === undefined ? new Date() : toDate(base, timestampUnit);

  if (!target || !baseDate) {
    return fallback;
  }

  const diff = target.getTime() - baseDate.getTime();
  const { value, unit } = selectRelativeUnit(diff);

  try {
    return new Intl.RelativeTimeFormat(locale, {
      numeric,
    }).format(value, unit);
  } catch {
    return fallback;
  }
}

/**
 * 格式化时间范围。
 *
 * @example
 * formatDateRange(
 *   "2026-07-15 09:00:00",
 *   "2026-07-15 12:30:00",
 * );
 * // "2026-07-15 09:00:00 ~ 12:30:00"
 */
export function formatDateRange(
  start: DateInput,
  end: DateInput,
  options: FormatDateRangeOptions = {},
): string {
  const {
    separator = " ~ ",
    collapseSameDate = true,
    fallback = "--",
    timestampUnit = "auto",
    timeZone,
  } = options;

  const startDate = toDate(start, timestampUnit);
  const endDate = toDate(end, timestampUnit);

  if (!startDate || !endDate || !isValidTimeZone(timeZone)) {
    return fallback;
  }

  const startText = formatDateTime(startDate, options);

  if (!collapseSameDate || !isSameDate(startDate, endDate, timeZone)) {
    return `${startText}${separator}${formatDateTime(endDate, options)}`;
  }

  const endText = formatDateTime(endDate, {
    ...options,
    pattern: getRangeEndPattern(options.pattern, options.preset),
  });

  return `${startText}${separator}${endText}`;
}

/**
 * 格式化持续时间。
 *
 * @example
 * formatDuration(65_000);
 * // "1分钟5秒"
 *
 * @example
 * formatDuration(3_723_000, {
 *   compact: true,
 *   maxUnits: 3,
 * });
 * // "1h 2m 3s"
 */
export function formatDuration(duration: number, options: FormatDurationOptions = {}): string {
  const {
    inputUnit = "millisecond",
    maxUnits = 2,
    showMilliseconds = false,
    compact = false,
    fallback = "--",
  } = options;

  if (!Number.isFinite(duration) || duration < 0) {
    return fallback;
  }

  if (!Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 5) {
    throw new RangeError("maxUnits 必须是 1 到 5 之间的整数");
  }

  let remaining = inputUnit === "second" ? duration * 1000 : duration;

  remaining = Math.floor(remaining);

  const units = [
    {
      value: Math.floor(remaining / 86_400_000),
      compact: "d",
      normal: "天",
    },
    {
      value: Math.floor((remaining % 86_400_000) / 3_600_000),
      compact: "h",
      normal: "小时",
    },
    {
      value: Math.floor((remaining % 3_600_000) / 60_000),
      compact: "m",
      normal: "分钟",
    },
    {
      value: Math.floor((remaining % 60_000) / 1000),
      compact: "s",
      normal: "秒",
    },
    {
      value: remaining % 1000,
      compact: "ms",
      normal: "毫秒",
    },
  ];

  const availableUnits = showMilliseconds ? units : units.slice(0, -1);

  const parts = availableUnits
    .filter((item) => item.value > 0)
    .slice(0, maxUnits)
    .map((item) => (compact ? `${item.value}${item.compact}` : `${item.value}${item.normal}`));

  if (parts.length === 0) {
    return compact ? (showMilliseconds ? "0ms" : "0s") : showMilliseconds ? "0毫秒" : "0秒";
  }

  return parts.join(compact ? " " : "");
}

/**
 * 将时间输入安全转换为 Date。
 *
 * @returns 无效输入返回 null。
 */
export function toDate(input: DateInput, timestampUnit: TimestampUnit = "auto"): Date | null {
  if (input instanceof Date) {
    const date = new Date(input.getTime());

    return isValidDate(date) ? date : null;
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return null;
    }

    const timestamp = normalizeTimestamp(input, timestampUnit);
    const date = new Date(timestamp);

    return isValidDate(date) ? date : null;
  }

  if (typeof input === "string") {
    const value = input.trim();

    if (!value) {
      return null;
    }

    if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
      return toDate(Number(value), timestampUnit);
    }

    const date = new Date(normalizeDateString(value));

    return isValidDate(date) ? date : null;
  }

  return null;
}

/**
 * 判断是否为合法日期。
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * 判断两个时间是否为同一天。
 */
export function isSameDate(first: DateInput, second: DateInput, timeZone?: string): boolean {
  const firstDate = toDate(first);
  const secondDate = toDate(second);

  if (!firstDate || !secondDate) {
    return false;
  }

  try {
    const firstParts = getDateParts(firstDate, {
      locale: "en-US",
      ...(timeZone === undefined ? {} : { timeZone }),
    });

    const secondParts = getDateParts(secondDate, {
      locale: "en-US",
      ...(timeZone === undefined ? {} : { timeZone }),
    });

    return (
      firstParts.year === secondParts.year &&
      firstParts.month === secondParts.month &&
      firstParts.day === secondParts.day
    );
  } catch {
    return false;
  }
}

/**
 * 比较两个时间。
 *
 * @returns first 较早返回 -1，相同返回 0，较晚返回 1；无效输入返回 null。
 */
export function compareDate(first: DateInput, second: DateInput): -1 | 0 | 1 | null {
  const firstDate = toDate(first);
  const secondDate = toDate(second);

  if (!firstDate || !secondDate) {
    return null;
  }

  const difference = firstDate.getTime() - secondDate.getTime();

  if (difference === 0) {
    return 0;
  }

  return difference < 0 ? -1 : 1;
}

/**
 * 判断 first 是否早于 second。
 */
export function isBefore(first: DateInput, second: DateInput): boolean {
  return compareDate(first, second) === -1;
}

/**
 * 判断 first 是否晚于 second。
 */
export function isAfter(first: DateInput, second: DateInput): boolean {
  return compareDate(first, second) === 1;
}

/**
 * 判断时间是否在指定范围内。
 *
 * @param inclusive 是否包含起止边界，默认为 true。
 */
export function isBetween(
  input: DateInput,
  start: DateInput,
  end: DateInput,
  inclusive = true,
): boolean {
  const inputDate = toDate(input);
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!inputDate || !startDate || !endDate) {
    return false;
  }

  const inputTime = inputDate.getTime();
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  if (startTime > endTime) {
    return false;
  }

  return inclusive
    ? inputTime >= startTime && inputTime <= endTime
    : inputTime > startTime && inputTime < endTime;
}

/**
 * 计算起止时间相差的毫秒数。
 *
 * 结果为 end - start；无效输入返回 null。
 */
export function differenceInMilliseconds(start: DateInput, end: DateInput): number | null {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return null;
  }

  return endDate.getTime() - startDate.getTime();
}

/**
 * 计算起止时间相差的完整秒数。
 *
 * 结果向零取整；无效输入返回 null。
 */
export function differenceInSeconds(start: DateInput, end: DateInput): number | null {
  const difference = differenceInMilliseconds(start, end);

  return difference === null ? null : Math.trunc(difference / 1000);
}

/**
 * 计算起止时间相差的完整 24 小时天数。
 *
 * 结果向零取整；无效输入返回 null。
 */
export function differenceInDays(start: DateInput, end: DateInput): number | null {
  const difference = differenceInMilliseconds(start, end);

  return difference === null ? null : Math.trunc(difference / 86_400_000);
}

/**
 * 计算两个本地日期之间相差的自然日数。
 *
 * 该方法忽略具体时分秒和夏令时造成的一天长度变化。
 */
export function differenceInCalendarDays(start: DateInput, end: DateInput): number | null {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return null;
  }

  const startDay = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  return Math.round((endDay - startDay) / 86_400_000);
}

/**
 * 按本地日历增减日期时间。
 *
 * 月份或年份变化时会自动将月末日期限制到目标月份的最后一天。
 * 无效输入或配置返回 null。
 *
 * @example
 * addDate("2024-01-31 09:00:00", { months: 1 });
 * // Date("2024-02-29 09:00:00")
 */
export function addDate(input: DateInput, options: AddDateOptions): Date | null {
  const date = toDate(input);

  if (!date || !isValidAddDateOptions(options)) {
    return null;
  }

  const {
    years = 0,
    months = 0,
    days = 0,
    hours = 0,
    minutes = 0,
    seconds = 0,
    milliseconds = 0,
  } = options;

  if (years !== 0 || months !== 0) {
    const originalDay = date.getDate();

    date.setDate(1);
    date.setMonth(date.getMonth() + years * 12 + months);
    date.setDate(Math.min(originalDay, getDaysInMonth(date) ?? originalDay));
  }

  date.setDate(date.getDate() + days);
  date.setHours(date.getHours() + hours);
  date.setMinutes(date.getMinutes() + minutes);
  date.setSeconds(date.getSeconds() + seconds);
  date.setMilliseconds(date.getMilliseconds() + milliseconds);

  return isValidDate(date) ? date : null;
}

/**
 * 获取输入时间所在本地日期的开始时间。
 */
export function startOfDay(input: DateInput): Date | null {
  const date = toDate(input);

  if (!date) {
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
}

/**
 * 获取输入时间所在本地日期的结束时间。
 */
export function endOfDay(input: DateInput): Date | null {
  const date = toDate(input);

  if (!date) {
    return null;
  }

  date.setHours(23, 59, 59, 999);

  return date;
}

/**
 * 判断输入时间是否为本地当天。
 */
export function isToday(input: DateInput): boolean {
  return isSameDate(input, new Date());
}

/**
 * 判断指定年份是否为闰年。
 */
export function isLeapYear(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= 0 &&
    year <= 275_760 &&
    (year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0))
  );
}

/**
 * 获取输入时间所在本地月份的天数。
 *
 * 无效输入返回 null。
 */
export function getDaysInMonth(input: DateInput): number | null {
  const date = toDate(input);

  if (!date) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * 获取当前 Unix 秒级时间戳。
 */
export function getUnixTime(input: DateInput = Date.now()): number {
  const date = toDate(input);

  if (!date) {
    throw new TypeError("无效的时间值");
  }

  return Math.floor(date.getTime() / 1000);
}

/**
 * 获取毫秒级时间戳。
 */
export function getTimestamp(input: DateInput = Date.now()): number {
  const date = toDate(input);

  if (!date) {
    throw new TypeError("无效的时间值");
  }

  return date.getTime();
}

interface DateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  millisecond: string;
}

function getDateParts(
  date: Date,
  options: {
    locale: string;
    timeZone?: string;
  },
): DateParts {
  const formatter = new Intl.DateTimeFormat(options.locale, {
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: partMap.get("year") ?? "0000",
    month: partMap.get("month") ?? "00",
    day: partMap.get("day") ?? "00",
    hour: partMap.get("hour") ?? "00",
    minute: partMap.get("minute") ?? "00",
    second: partMap.get("second") ?? "00",
    millisecond: String(date.getMilliseconds()).padStart(3, "0"),
  };
}

function isValidTimeZone(timeZone?: string): boolean {
  if (timeZone === undefined) {
    return true;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });

    return true;
  } catch {
    return false;
  }
}

function isValidAddDateOptions(options: AddDateOptions): boolean {
  return (
    typeof options === "object" &&
    options !== null &&
    Object.values(options).every((value) => value === undefined || Number.isInteger(value))
  );
}

function applyDatePattern(pattern: string, parts: DateParts): string {
  const tokens = new Map<string, string>([
    ["YYYY", parts.year],
    ["MM", parts.month],
    ["DD", parts.day],
    ["HH", parts.hour],
    ["mm", parts.minute],
    ["ss", parts.second],
    ["SSS", parts.millisecond],
  ]);

  return pattern.replace(/YYYY|SSS|MM|DD|HH|mm|ss/g, (token) => tokens.get(token) ?? token);
}

function normalizeTimestamp(value: number, unit: TimestampUnit): number {
  if (unit === "second") {
    return value * 1000;
  }

  if (unit === "millisecond") {
    return value;
  }

  /*
   * 当前常见秒级时间戳约为 10 位，
   * 毫秒级时间戳约为 13 位。
   */
  return Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
}

function normalizeDateString(value: string): string {
  /*
   * 将常见的：
   * 2026-07-15 09:30:00
   *
   * 转换为更符合 ISO 8601 的：
   * 2026-07-15T09:30:00
   */
  return value.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/, "$1T$2");
}

function selectRelativeUnit(diffMs: number): {
  value: number;
  unit: Intl.RelativeTimeFormatUnit;
} {
  const absolute = Math.abs(diffMs);

  const units: Array<{
    unit: Intl.RelativeTimeFormatUnit;
    milliseconds: number;
  }> = [
    { unit: "year", milliseconds: 31_536_000_000 },
    { unit: "month", milliseconds: 2_592_000_000 },
    { unit: "week", milliseconds: 604_800_000 },
    { unit: "day", milliseconds: 86_400_000 },
    { unit: "hour", milliseconds: 3_600_000 },
    { unit: "minute", milliseconds: 60_000 },
    { unit: "second", milliseconds: 1000 },
  ];

  const selected = units.find((item) => absolute >= item.milliseconds) ?? {
    unit: "second",
    milliseconds: 1000,
  };

  return {
    value: Math.round(diffMs / selected.milliseconds),
    unit: selected.unit,
  };
}

function getRangeEndPattern(pattern?: string, preset: DateFormatPreset = "datetimeSecond"): string {
  const source = pattern ?? DATE_PATTERNS[preset];

  const hasDate = source.includes("YYYY") || source.includes("MM") || source.includes("DD");

  const hasTime = source.includes("HH") || source.includes("mm") || source.includes("ss");

  if (hasDate && hasTime) {
    const timePattern = source.match(/HH(?:[^A-Za-z]mm)?(?:[^A-Za-z]ss)?(?:[^A-Za-z]SSS)?/);

    return timePattern?.[0] ?? "HH:mm:ss";
  }

  return source;
}

/**
 * 格式化日期。
 *
 * @example
 * formatDate("2026-07-15 09:30:45");
 * // "2026-07-15"
 */
export function formatDate(input: DateInput): string {
  return formatDateTime(input, {
    preset: "date",
  });
}

/**
 * 格式化时间，精确到分钟。
 *
 * @example
 * formatTime("2026-07-15 09:30:45");
 * // "09:30"
 */
export function formatTime(input: DateInput): string {
  return formatDateTime(input, {
    preset: "time",
  });
}

/**
 * 格式化时间，精确到秒。
 *
 * @example
 * formatTimeSecond("2026-07-15 09:30:45");
 * // "09:30:45"
 */
export function formatTimeSecond(input: DateInput): string {
  return formatDateTime(input, {
    preset: "timeSecond",
  });
}

/**
 * 格式化日期时间，精确到分钟。
 */
export function formatDateMinute(input: DateInput): string {
  return formatDateTime(input, {
    preset: "datetime",
  });
}

/**
 * 格式化日期时间，精确到秒。
 */
export function formatDateSecond(input: DateInput): string {
  return formatDateTime(input, {
    preset: "datetimeSecond",
  });
}

// 使用预设、自定义模板及时区格式化日期时间。
console.log(
  "formatDateTime:",
  formatDateTime("2026-07-15T01:30:45.123Z", {
    pattern: "YYYY年MM月DD日 HH:mm:ss.SSS",
    timeZone: "Asia/Shanghai",
  }),
);

// 使用 Intl.DateTimeFormat 的完整配置格式化本地化日期。
console.log(
  "formatDateIntl:",
  formatDateIntl("2026-07-15T01:30:45.123Z", {
    locale: "zh-CN",
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "2-digit",
    weekday: "long",
  }),
);

// 以固定基准时间展示相对时间，便于得到稳定的演示结果。
console.log(
  "formatRelativeTime:",
  formatRelativeTime("2026-07-15T02:30:45.123Z", {
    base: "2026-07-15T01:30:45.123Z",
  }),
);

// 格式化同一天内的时间范围，并自动省略结束日期。
console.log("formatDateRange:", formatDateRange("2026-07-15 09:00:00", "2026-07-15 12:30:00"));

// 将毫秒数转换为最多三个单位的紧凑持续时间。
console.log(
  "formatDuration:",
  formatDuration(3_723_000, {
    compact: true,
    maxUnits: 3,
  }),
);

// 将 Date、字符串或时间戳安全转换为 Date，无效输入返回 null。
console.log("toDate:", toDate(1_752_552_600, "second"));

// 判断值是否为有效的 Date 实例。
console.log("isValidDate:", isValidDate(new Date("2026-07-15T01:30:45.123Z")));

// 判断两个时间在指定时区内是否属于同一天。
console.log(
  "isSameDate:",
  isSameDate("2026-07-15T15:30:00Z", "2026-07-16T01:00:00Z", "Asia/Shanghai"),
);

// 比较时间先后：较早、相同、较晚分别返回 -1、0、1。
console.log("compareDate:", compareDate("2026-07-15 09:00:00", "2026-07-15 10:00:00"));

// 判断两个时间的先后关系。
console.log("isBefore:", isBefore("2026-07-15 09:00:00", "2026-07-15 10:00:00"));
console.log("isAfter:", isAfter("2026-07-15 10:00:00", "2026-07-15 09:00:00"));

// 判断时间是否处于包含边界的范围内。
console.log(
  "isBetween:",
  isBetween("2026-07-15 10:00:00", "2026-07-15 09:00:00", "2026-07-15 12:00:00"),
);

// 计算精确时间差和忽略时分秒的自然日差。
console.log(
  "differenceInMilliseconds:",
  differenceInMilliseconds("2026-07-15 09:00:00", "2026-07-15 09:00:01"),
);
console.log(
  "differenceInSeconds:",
  differenceInSeconds("2026-07-15 09:00:00", "2026-07-15 09:01:30"),
);
console.log("differenceInDays:", differenceInDays("2026-07-15 09:00:00", "2026-07-17 09:00:00"));
console.log(
  "differenceInCalendarDays:",
  differenceInCalendarDays("2026-07-15 23:00:00", "2026-07-16 01:00:00"),
);

// 按本地日历增减日期，月末会自动限制到目标月份的最后一天。
console.log("addDate:", addDate("2024-01-31 09:30:00", { months: 1 }));

// 获取本地日期的开始和结束时间。
console.log("startOfDay:", startOfDay("2026-07-15 09:30:45"));
console.log("endOfDay:", endOfDay("2026-07-15 09:30:45"));

// 判断当天、闰年以及获取指定月份天数。
console.log("isToday:", isToday(new Date()));
console.log("isLeapYear:", isLeapYear(2024));
console.log("getDaysInMonth:", getDaysInMonth("2024-02-15"));

// 获取 Unix 秒级时间戳。
console.log("getUnixTime:", getUnixTime("2026-07-15T01:30:45.123Z"));

// 获取毫秒级时间戳。
console.log("getTimestamp:", getTimestamp("2026-07-15T01:30:45.123Z"));

// 以下便捷 API 分别输出日期、分钟级时间、秒级时间及不同精度的日期时间。
console.log("formatDate:", formatDate("2026-07-15 09:30:45"));
console.log("formatTime:", formatTime("2026-07-15 09:30:45"));
console.log("formatTimeSecond:", formatTimeSecond("2026-07-15 09:30:45"));
console.log("formatDateMinute:", formatDateMinute("2026-07-15 09:30:45"));
console.log("formatDateSecond:", formatDateSecond("2026-07-15 09:30:45"));

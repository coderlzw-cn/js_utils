/**
 * 数字相关的跨运行时纯函数工具。
 */

/** 可安全转换为数字的输入类型。 */
export type NumberInput = number | string;

/** 数字字段验证配置。 */
export interface NumberValidationOptions {
  /** 允许的最小值，默认包含边界。 */
  readonly minimum?: number;
  /** 允许的最大值，默认包含边界。 */
  readonly maximum?: number;
  /** 是否要求值为整数。默认为 `false`。 */
  readonly integer?: boolean;
  /** 是否要求值为安全整数；启用时会同时要求值为整数。默认为 `false`。 */
  readonly safeInteger?: boolean;
  /** 是否排除 minimum 边界。默认为 `false`。 */
  readonly exclusiveMinimum?: boolean;
  /** 是否排除 maximum 边界。默认为 `false`。 */
  readonly exclusiveMaximum?: boolean;
}

/** 数字格式化配置。 */
export interface FormatNumberOptions {
  /**
   * 小数位数，取值范围为 0 到 20。
   *
   * @default 2
   */
  readonly precision?: number;
  /**
   * 是否使用千位分隔符。
   *
   * @default true
   */
  readonly useGrouping?: boolean;
  /** 追加到数字后的单位，例如 `kg`、`%` 或 `万元`。 */
  readonly unit?: string;
  /**
   * 自动缩放规则。显式提供 unit 时不会自动缩放。
   *
   * @default "none"
   */
  readonly autoScale?: "zh" | "en" | "none";
  /**
   * 数字与单位之间的间距。`auto` 会为常规英文单位添加空格，
   * 中文单位、百分号和温度符号等紧跟数字。
   *
   * @default "auto"
   */
  readonly space?: boolean | "auto";
  /**
   * `Intl.NumberFormat` 使用的区域设置。
   *
   * @default "en-US"
   */
  readonly locale?: Intl.LocalesArgument;
  /**
   * 输入无效时返回的文本。
   *
   * @default "--"
   */
  readonly fallback?: string;
}

/** 近似比较配置。 */
export interface NearlyEqualOptions {
  /**
   * 与数值大小无关的最大绝对误差。
   *
   * @default Number.EPSILON
   */
  readonly absoluteTolerance?: number;
  /**
   * 随数值大小变化的最大相对误差。
   *
   * @default Number.EPSILON
   */
  readonly relativeTolerance?: number;
}

/** 进制整数解析配置。 */
export interface BaseIntegerParseOptions {
  /**
   * 是否移除输入首尾的 Unicode 空白。
   *
   * @default true
   */
  readonly trimWhitespace?: boolean;
  /**
   * 是否允许与 radix 匹配的标准前缀：二进制 `0b`、八进制 `0o`、十六进制 `0x`。
   *
   * @default true
   */
  readonly allowPrefix?: boolean;
  /**
   * 最多允许的有效数字字符数，不包含正负号和进制前缀，用于限制不可信输入的资源消耗。
   *
   * @default 10000
   */
  readonly maxDigits?: number;
}

/** 进制整数格式化配置。 */
export interface BaseIntegerFormatOptions {
  /**
   * 是否使用大写英文字母表示 10 到 35。
   *
   * @default false
   */
  readonly uppercase?: boolean;
  /**
   * 是否为二、八、十六进制结果添加 `0b`、`0o`、`0x` 前缀。
   * 其他进制没有通用前缀，因此启用时会抛出 `RangeError`。
   *
   * @default false
   */
  readonly includePrefix?: boolean;
}

/** 进制转换配置。 */
export interface ConvertBaseOptions extends BaseIntegerParseOptions, BaseIntegerFormatOptions {}

/** 判断未知值是否为有限数字，排除 `NaN` 和正负无穷。 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 按规则验证未知值是否为合格的有限数字。
 *
 * 配置本身非法时会抛出 `RangeError`，而字段值不符合规则时返回 `false`。
 *
 * @example
 * isValidNumber(18, { minimum: 0, integer: true }); // true
 */
export function isValidNumber(value: unknown, options: NumberValidationOptions = {}): value is number {
  const resolvedOptions = resolveNumberValidationOptions(options);
  return isFiniteNumber(value) && matchesNumberValidation(value, resolvedOptions);
}

/**
 * 断言未知字段是符合规则的有限数字，并将其类型收窄为 `number`。
 *
 * 类型不正确或值不是有限数字时抛出 `TypeError`；数字不符合范围或整数规则时抛出
 * `RangeError`。`fieldName` 会出现在错误消息中，便于定位接口或配置字段。
 *
 * @example
 * assertNumber(payload.page, { minimum: 1, safeInteger: true }, "page");
 */
export function assertNumber(value: unknown, options: NumberValidationOptions = {}, fieldName = "value"): asserts value is number {
  const resolvedOptions = resolveNumberValidationOptions(options);

  if (!isFiniteNumber(value)) {
    throw new TypeError(`${fieldName} must be a finite number`);
  }

  if (!matchesNumberValidation(value, resolvedOptions)) {
    throw new RangeError(describeNumberRequirement(fieldName, resolvedOptions));
  }
}

/**
 * 判断字符串是否完整表示一个有限十进制数字。
 *
 * 支持首尾空白、正负号、小数和科学计数法；空字符串、十六进制、`Infinity`
 * 以及只包含部分数字的内容会返回 `false`。
 */
export function isNumericString(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && DECIMAL_NUMBER_PATTERN.test(normalized) && Number.isFinite(Number(normalized));
}

/**
 * 将数字或十进制数字字符串转换为有限数字。
 *
 * 与直接调用 `Number` 不同，空字符串不会被转换为 `0`，十六进制等非十进制
 * 字面量也不会被接受。转换失败时返回 `undefined`。
 */
export function toFiniteNumber(value: NumberInput | null | undefined): number | undefined {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value !== "string" || !isNumericString(value)) {
    return undefined;
  }

  return Number(value.trim());
}

/** 宽松数字转换配置。 */
export interface ToNumberOptions {
  /**
   * 无法解析为有限数字时返回的值。
   *
   * @default 0
   */
  readonly fallback?: number;
}

/**
 * 将未知输入转换为有限数字，解析失败时返回 `fallback`。
 *
 * 接受有限 `number`、十进制数字字符串，以及落在安全整数范围内的 `bigint`。
 * 空字符串、布尔值、对象、十六进制字面量和非有限值不会被当成 `0`，
 * 这一点与直接调用 `Number(...)` 不同。
 *
 * 需要区分“缺省”和“零”时应使用 `toFiniteNumber`。
 *
 * @throws {RangeError} fallback 不是有限数字。
 */
export function toNumber(value: unknown, options: ToNumberOptions = {}): number {
  const { fallback = 0 } = options;
  if (!isFiniteNumber(fallback)) {
    throw new RangeError("fallback must be a finite number");
  }

  if (typeof value === "bigint") {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
    return fallback;
  }

  if (value == null || typeof value === "number" || typeof value === "string") {
    return toFiniteNumber(value) ?? fallback;
  }

  return fallback;
}

/**
 * 判断字符串是否是指定进制下的合法整数。
 *
 * 字母不区分大小写，支持可选正负号；默认接受匹配的标准进制前缀，并限制输入为
 * 10000 个有效数字字符。输入内容非法时返回 `false`，配置非法时抛出异常。
 *
 * @example
 * isValidBaseInteger("-0xFF", 16); // true
 * isValidBaseInteger("102", 2); // false
 *
 * @throws {RangeError} radix 不在 2 到 36 之间，或 maxDigits 不是正安全整数。
 */
export function isValidBaseInteger(value: string, radix: number, options: BaseIntegerParseOptions = {}): boolean {
  assertRadix(radix);
  const resolvedOptions = resolveBaseParseOptions(options);
  return normalizeBaseInteger(value, radix, resolvedOptions) !== undefined;
}

/**
 * 将指定进制的整数字符串解析为 `bigint`，不会产生 `number` 的安全整数精度丢失。
 *
 * 返回值会规范化前导零和负零。若调用方需要普通 `number`，应在确认结果位于
 * `Number.MIN_SAFE_INTEGER` 到 `Number.MAX_SAFE_INTEGER` 后再显式转换。
 *
 * @example
 * parseBaseInteger("FFFFFFFFFFFFFFFF", 16); // 18446744073709551615n
 *
 * @throws {RangeError} radix 或 maxDigits 配置非法。
 * @throws {SyntaxError} 输入为空、包含当前进制不支持的字符、前缀不匹配或超过长度限制。
 */
export function parseBaseInteger(value: string, radix: number, options: BaseIntegerParseOptions = {}): bigint {
  assertRadix(radix);
  const resolvedOptions = resolveBaseParseOptions(options);
  const normalized = normalizeBaseInteger(value, radix, resolvedOptions);

  if (!normalized) {
    throw new SyntaxError(`value is not a valid base-${radix} integer`);
  }

  const radixValue = BigInt(radix);
  let result = 0n;
  for (const character of normalized.digits) {
    const digit = DIGIT_CHARACTERS.indexOf(character.toLowerCase());
    result = result * radixValue + BigInt(digit);
  }

  return normalized.negative && result !== 0n ? -result : result;
}

/**
 * 将 `bigint` 格式化为 2 到 36 进制的规范字符串。
 *
 * 结果不包含多余前导零；负号始终位于可选进制前缀之前，例如 `-0xFF`。
 *
 * @example
 * formatBaseInteger(255n, 16, { uppercase: true, includePrefix: true }); // "0xFF"
 *
 * @throws {RangeError} radix 不在 2 到 36 之间，或为非二、八、十六进制请求前缀。
 */
export function formatBaseInteger(value: bigint, radix: number, options: BaseIntegerFormatOptions = {}): string {
  assertRadix(radix);
  const { includePrefix = false, uppercase = false } = options;
  const prefix = includePrefix ? getRadixPrefix(radix) : "";
  const negative = value < 0n;
  let digits = (negative ? -value : value).toString(radix);

  if (uppercase) {
    digits = digits.toUpperCase();
  }

  return `${negative ? "-" : ""}${prefix}${digits}`;
}

/**
 * 在 2 到 36 进制之间转换整数，内部使用 `bigint` 保证大整数精度。
 *
 * 输出会被规范化：移除前导零、将负零转为零，并按 uppercase 配置统一字母大小写。
 * 本函数只处理整数；小数进制转换需要明确舍入策略，因此不在该 API 的职责范围内。
 *
 * @example
 * convertBase("11111111", 2, 16, { uppercase: true }); // "FF"
 * convertBase("-0xFF", 16, 10); // "-255"
 *
 * @throws {RangeError} 进制或配置非法。
 * @throws {SyntaxError} 输入不是合法的源进制整数。
 */
export function convertBase(value: string, fromRadix: number, toRadix: number, options: ConvertBaseOptions = {}): string {
  assertRadix(fromRadix);
  assertRadix(toRadix);
  const parsed = parseBaseInteger(value, fromRadix, options);
  return formatBaseInteger(parsed, toRadix, options);
}

/**
 * 将数字限制在闭区间 `[minimum, maximum]` 内。
 *
 * @throws {RangeError} 任一参数不是有限数字，或 minimum 大于 maximum。
 */
export function clamp(value: number, minimum: number, maximum: number): number {
  assertFiniteNumbers({ value, minimum, maximum });
  if (minimum > maximum) {
    throw new RangeError("minimum must be less than or equal to maximum");
  }

  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * 判断数字是否位于由两个端点构成的闭区间内。
 *
 * 端点顺序不受限制，因此 `isBetween(5, 10, 0)` 同样返回 `true`。
 *
 * @throws {RangeError} 任一参数不是有限数字。
 */
export function isBetween(value: number, endpointA: number, endpointB: number): boolean {
  assertFiniteNumbers({ value, endpointA, endpointB });
  const minimum = Math.min(endpointA, endpointB);
  const maximum = Math.max(endpointA, endpointB);
  return value >= minimum && value <= maximum;
}

/**
 * 按指定十进制位数四舍五入；负数 precision 可用于十位、百位等整数位。
 *
 * 例如 `roundTo(12.345, 2)` 返回 `12.35`，`roundTo(1234, -2)` 返回 `1200`。
 *
 * @throws {RangeError} value 不是有限数字，或 precision 不是 -15 到 15 的整数。
 */
export function roundTo(value: number, precision = 0): number {
  return applyPrecision(value, precision, Math.round);
}

/**
 * 按指定十进制位数向下取整；负数 precision 可用于整数位。
 *
 * @throws {RangeError} value 不是有限数字，或 precision 不是 -15 到 15 的整数。
 */
export function floorTo(value: number, precision = 0): number {
  return applyPrecision(value, precision, Math.floor);
}

/**
 * 按指定十进制位数向上取整；负数 precision 可用于整数位。
 *
 * @throws {RangeError} value 不是有限数字，或 precision 不是 -15 到 15 的整数。
 */
export function ceilTo(value: number, precision = 0): number {
  return applyPrecision(value, precision, Math.ceil);
}

/**
 * 使用绝对误差和相对误差判断两个有限数字是否近似相等。
 *
 * 适合处理 `0.1 + 0.2` 之类的浮点误差；它不等同于财务场景中的十进制精确计算。
 *
 * @throws {RangeError} 数字或容差不是有限值，或容差小于 0。
 */
export function nearlyEqual(first: number, second: number, options: NearlyEqualOptions = {}): boolean {
  const { absoluteTolerance = Number.EPSILON, relativeTolerance = Number.EPSILON } = options;
  assertFiniteNumbers({ first, second, absoluteTolerance, relativeTolerance });
  if (absoluteTolerance < 0 || relativeTolerance < 0) {
    throw new RangeError("tolerances must be non-negative");
  }

  if (first === second) {
    return true;
  }

  const difference = Math.abs(first - second);
  const scale = Math.max(Math.abs(first), Math.abs(second));
  return difference <= Math.max(absoluteTolerance, relativeTolerance * scale);
}

/**
 * 对有限数字求和，使用补偿求和降低大量浮点数累加产生的舍入误差。
 *
 * 空集合返回 `0`。
 *
 * @throws {RangeError} 集合中包含 `NaN` 或无穷值，或求和过程超出有限数字范围。
 */
export function sum(values: readonly number[]): number {
  let total = 0;
  let compensation = 0;

  for (const value of values) {
    assertFiniteNumber(value, "values item");
    // Neumaier 补偿求和在数量级差异较大时比直接相加更稳定。
    const next = total + value;
    compensation += Math.abs(total) >= Math.abs(value) ? total - next + value : value - next + total;
    total = next;
  }

  const result = total + compensation;
  if (!Number.isFinite(result)) {
    throw new RangeError("sum exceeds the finite number range");
  }
  return normalizeNegativeZero(result);
}

/**
 * 计算有限数字集合的算术平均值。
 *
 * 空集合返回 `undefined`，以便调用方明确处理无数据状态。
 *
 * @throws {RangeError} 集合中包含 `NaN` 或无穷值，或结果超出有限数字范围。
 */
export function average(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  // 先按数量缩放再求和，避免总和溢出但平均值本可表示的情况。
  return sum(values.map((value) => value / values.length));
}

/**
 * 计算部分值占总值的百分比数值。
 *
 * 例如 `percentage(1, 4)` 返回 `25`。total 为 `0` 时返回 `undefined`，
 * 避免业务层误用 `Infinity`；precision 的规则与 `roundTo` 相同。
 *
 * @throws {RangeError} 参数不是有效的有限数字、precision 超出支持范围，或结果溢出。
 */
export function percentage(part: number, total: number, precision = 2): number | undefined {
  assertFiniteNumbers({ part, total });
  if (total === 0) {
    return undefined;
  }

  const result = (part / total) * 100;
  assertFiniteNumber(result, "percentage result");
  return roundTo(result, precision);
}

/**
 * 将数字格式化为适合展示的文本。
 *
 * 支持中英文数量级自动缩放、国际化分组、固定小数位和单位智能间距。
 * 非法输入会返回 fallback，不会向 UI 泄漏 `NaN` 或 `Infinity`。
 *
 * @example
 * formatNumber(12345.6, { precision: 1, autoScale: "zh" }); // "1.2万"
 * formatNumber(1536, { precision: 0, unit: "MB" }); // "1,536 MB"
 *
 * @throws {RangeError} precision 超出支持范围，或 locale 不是有效的区域设置。
 */
export function formatNumber(value: NumberInput | null | undefined, options: FormatNumberOptions = {}): string {
  const { precision = 2, useGrouping = true, unit = "", autoScale = "none", space = "auto", locale = "en-US", fallback = "--" } = options;
  assertFormatPrecision(precision);

  const parsedValue = toFiniteNumber(value);
  if (parsedValue === undefined) {
    return fallback;
  }

  let finalValue = parsedValue;
  let finalUnit = unit;

  if (!unit && autoScale !== "none") {
    const scaled = scaleNumber(parsedValue, autoScale);
    finalValue = scaled.value;
    finalUnit = scaled.unit;
  }

  const formattedValue = new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
    useGrouping,
  }).format(finalValue);

  if (!finalUnit) {
    return formattedValue;
  }

  return shouldSeparateUnit(finalUnit, space) ? `${formattedValue} ${finalUnit}` : `${formattedValue}${finalUnit}`;
}

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;
const DIGIT_CHARACTERS = "0123456789abcdefghijklmnopqrstuvwxyz";
const MAX_DECIMAL_PRECISION = 15;
const MAX_FORMAT_PRECISION = 20;
const DEFAULT_MAX_BASE_DIGITS = 10_000;

interface ResolvedBaseIntegerParseOptions {
  readonly allowPrefix: boolean;
  readonly maxDigits: number;
  readonly trimWhitespace: boolean;
}

interface NormalizedBaseInteger {
  readonly digits: string;
  readonly negative: boolean;
}

function resolveBaseParseOptions(options: BaseIntegerParseOptions): ResolvedBaseIntegerParseOptions {
  const { allowPrefix = true, maxDigits = DEFAULT_MAX_BASE_DIGITS, trimWhitespace = true } = options;

  if (!Number.isSafeInteger(maxDigits) || maxDigits <= 0) {
    throw new RangeError("maxDigits must be a positive safe integer");
  }

  return { allowPrefix, maxDigits, trimWhitespace };
}

function normalizeBaseInteger(value: string, radix: number, options: ResolvedBaseIntegerParseOptions): NormalizedBaseInteger | undefined {
  let normalized = options.trimWhitespace ? value.trim() : value;
  let negative = false;

  if (normalized.startsWith("+") || normalized.startsWith("-")) {
    negative = normalized[0] === "-";
    normalized = normalized.slice(1);
  }

  const detectedPrefixRadix = getDetectedPrefixRadix(normalized);
  if (detectedPrefixRadix !== undefined) {
    if (!options.allowPrefix || detectedPrefixRadix !== radix) {
      return undefined;
    }
    normalized = normalized.slice(2);
  }

  if (normalized.length === 0 || normalized.length > options.maxDigits) {
    return undefined;
  }

  for (const character of normalized) {
    const digit = DIGIT_CHARACTERS.indexOf(character.toLowerCase());
    if (digit < 0 || digit >= radix) {
      return undefined;
    }
  }

  return { digits: normalized, negative };
}

function getDetectedPrefixRadix(value: string): number | undefined {
  const prefix = value.slice(0, 2).toLowerCase();
  if (prefix === "0b") return 2;
  if (prefix === "0o") return 8;
  if (prefix === "0x") return 16;
  return undefined;
}

function getRadixPrefix(radix: number): string {
  if (radix === 2) return "0b";
  if (radix === 8) return "0o";
  if (radix === 16) return "0x";
  throw new RangeError("includePrefix is only supported for radix 2, 8, or 16");
}

function assertRadix(radix: number): void {
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) {
    throw new RangeError("radix must be an integer between 2 and 36");
  }
}

function applyPrecision(value: number, precision: number, operation: (value: number) => number): number {
  assertFiniteNumber(value, "value");
  assertPrecision(precision);

  if (precision === 0) {
    return normalizeNegativeZero(operation(value));
  }

  // 通过科学计数法移动小数点，避免 1.005 * 100 得到
  // 100.49999999999999 这类二进制浮点乘法误差。
  const [coefficient, exponent = "0"] = value.toString().split("e");
  const shifted = Number(`${coefficient}e${Number(exponent) + precision}`);

  // 正精度移动可能使接近 Number.MAX_VALUE 的数字暂时溢出；此时指定的小数位
  // 远低于该值本身的有效位数，舍入不会改变其可表示结果。
  if (!Number.isFinite(shifted) && precision > 0) {
    return value;
  }

  const rounded = operation(shifted);
  const [roundedCoefficient, roundedExponent = "0"] = rounded.toString().split("e");
  const result = Number(`${roundedCoefficient}e${Number(roundedExponent) - precision}`);
  assertFiniteNumber(result, "rounded result");
  return normalizeNegativeZero(result);
}

function scaleNumber(value: number, scale: Exclude<FormatNumberOptions["autoScale"], "none" | undefined>): { value: number; unit: string } {
  const absoluteValue = Math.abs(value);
  const units =
    scale === "zh"
      ? ([
          [1e8, "亿"],
          [1e4, "万"],
        ] as const)
      : ([
          [1e9, "B"],
          [1e6, "M"],
          [1e3, "K"],
        ] as const);

  for (const [threshold, unit] of units) {
    if (absoluteValue >= threshold) {
      return { value: value / threshold, unit };
    }
  }

  return { value, unit: "" };
}

function shouldSeparateUnit(unit: string, space: boolean | "auto"): boolean {
  if (space !== "auto") {
    return space;
  }

  const containsChinese = /[\u3400-\u9fff]/u.test(unit);
  const isTightSymbol = /^[°%‰℃℉²³]+$/u.test(unit);
  return !containsChinese && !isTightSymbol;
}

function assertFiniteNumbers(values: Readonly<Record<string, number>>): void {
  for (const [name, value] of Object.entries(values)) {
    assertFiniteNumber(value, name);
  }
}

type ResolvedNumberValidationOptions = Required<NumberValidationOptions>;

function resolveNumberValidationOptions(options: NumberValidationOptions): ResolvedNumberValidationOptions {
  const { minimum = -Infinity, maximum = Infinity, integer = false, safeInteger = false, exclusiveMinimum = false, exclusiveMaximum = false } = options;

  if (Number.isNaN(minimum) || Number.isNaN(maximum)) {
    throw new RangeError("minimum and maximum must not be NaN");
  }
  if (minimum > maximum || (minimum === maximum && (exclusiveMinimum || exclusiveMaximum))) {
    throw new RangeError("minimum and maximum do not define a valid number range");
  }

  return {
    minimum,
    maximum,
    integer,
    safeInteger,
    exclusiveMinimum,
    exclusiveMaximum,
  };
}

function matchesNumberValidation(value: number, options: ResolvedNumberValidationOptions): boolean {
  if (options.safeInteger ? !Number.isSafeInteger(value) : options.integer && !Number.isInteger(value)) {
    return false;
  }

  const satisfiesMinimum = options.exclusiveMinimum ? value > options.minimum : value >= options.minimum;
  const satisfiesMaximum = options.exclusiveMaximum ? value < options.maximum : value <= options.maximum;
  return satisfiesMinimum && satisfiesMaximum;
}

function describeNumberRequirement(fieldName: string, options: ResolvedNumberValidationOptions): string {
  const requirements: string[] = [];
  if (options.safeInteger) {
    requirements.push("a safe integer");
  } else if (options.integer) {
    requirements.push("an integer");
  }
  if (options.minimum !== -Infinity) {
    requirements.push(`${options.exclusiveMinimum ? "greater than" : "at least"} ${options.minimum}`);
  }
  if (options.maximum !== Infinity) {
    requirements.push(`${options.exclusiveMaximum ? "less than" : "at most"} ${options.maximum}`);
  }

  return `${fieldName} must be ${requirements.join(" and ") || "a valid number"}`;
}

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

function assertPrecision(precision: number): void {
  if (!Number.isInteger(precision) || Math.abs(precision) > MAX_DECIMAL_PRECISION) {
    throw new RangeError(`precision must be an integer between -${MAX_DECIMAL_PRECISION} and ${MAX_DECIMAL_PRECISION}`);
  }
}

function assertFormatPrecision(precision: number): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_FORMAT_PRECISION) {
    throw new RangeError(`precision must be an integer between 0 and ${MAX_FORMAT_PRECISION}`);
  }
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

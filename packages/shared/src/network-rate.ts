/**
 * 网络速率的解析、转换、格式化与传输估算工具。
 *
 * 本模块仅依赖 ECMAScript 标准 API，可同时运行于现代 Node.js 和浏览器环境。
 * 所有换算均严格区分 bit（小写 b）与 Byte（大写 B），1 Byte = 8 bit。
 */

/** 十进制 SI 前缀。 */
export type DecimalNetworkRatePrefix = "K" | "M" | "G" | "T" | "P" | "E";

/** 二进制 IEC 前缀。 */
export type BinaryNetworkRatePrefix = "Ki" | "Mi" | "Gi" | "Ti" | "Pi" | "Ei";

/**
 * 规范网络速率单位。
 *
 * - `Mbps` 表示兆比特每秒，倍率为 1000。
 * - `MB/s` 表示兆字节每秒，倍率为 1000，且 1 Byte = 8 bit。
 * - `Mibps` 和 `MiB/s` 使用 1024 倍率。
 */
export type NetworkRateUnit =
  | "bps"
  | "B/s"
  | `${DecimalNetworkRatePrefix}bps`
  | `${DecimalNetworkRatePrefix}B/s`
  | `${BinaryNetworkRatePrefix}bps`
  | `${BinaryNetworkRatePrefix}B/s`;

/** 网络速率单位制。 */
export type NetworkRateUnitSystem = "si" | "iec";

/** 网络速率表示的基本量。 */
export type NetworkRateQuantity = "bit" | "byte";

/** 已解析的网络速率。 */
export interface ParsedNetworkRate {
  /** 输入中的数值。 */
  readonly value: number;
  /** 规范化后的单位。 */
  readonly unit: NetworkRateUnit;
  /** 换算后的 bit/s。 */
  readonly bitsPerSecond: number;
  /** 换算后的 Byte/s。 */
  readonly bytesPerSecond: number;
}

/** 网络速率格式化配置。 */
export interface FormatNetworkRateOptions {
  /**
   * 输入值的单位。
   *
   * @default "bps"
   */
  readonly inputUnit?: NetworkRateUnit;
  /**
   * 输出使用 bit 还是 Byte。
   *
   * @default "bit"
   */
  readonly quantity?: NetworkRateQuantity;
  /**
   * 输出使用十进制 SI 还是二进制 IEC 单位制。
   *
   * @default "si"
   */
  readonly unitSystem?: NetworkRateUnitSystem;
  /**
   * 最大小数位数，范围为 0 到 20。
   *
   * @default 2
   */
  readonly precision?: number;
  /**
   * 是否移除无意义的末尾零。关闭后会固定显示 precision 位小数。
   *
   * @default true
   */
  readonly trimTrailingZeros?: boolean;
  /**
   * 是否使用数字分组符。
   *
   * @default true
   */
  readonly useGrouping?: boolean;
  /**
   * 数字与单位之间是否添加空格。
   *
   * @default true
   */
  readonly space?: boolean;
  /**
   * `Intl.NumberFormat` 使用的区域设置。
   *
   * @default "en-US"
   */
  readonly locale?: Intl.LocalesArgument;
}

/** 网络传输耗时估算结果。 */
export interface TransferDurationEstimate {
  /** 估算秒数。 */
  readonly seconds: number;
  /** 估算毫秒数。 */
  readonly milliseconds: number;
}

/**
 * 将常见网络速率单位别名规范化。
 *
 * 前缀大小写不敏感，但用于区分 bit 和 Byte 的 `b`/`B` 严格区分。例如
 * `mbps`、`Mbit/s` 会规范为 `Mbps`，`MBps`、`MByte/s` 会规范为 `MB/s`。
 * 无法识别时返回 `undefined`。
 */
export function normalizeNetworkRateUnit(unit: string): NetworkRateUnit | undefined {
  const normalized = unit.trim();
  const baseShortMatch = /^([bB])(?:ps|\/s)$/iu.exec(normalized);
  if (baseShortMatch) {
    return baseShortMatch[1] === "B" ? "B/s" : "bps";
  }
  if (/^bits?\/s$/iu.test(normalized)) {
    return "bps";
  }
  if (/^bytes?\/s$/iu.test(normalized)) {
    return "B/s";
  }

  const shortMatch = /^([kmgtpe](?:i)?)([bB])(?:ps|\/s)$/iu.exec(normalized);
  if (shortMatch) {
    const [, rawPrefix = "", symbol = ""] = shortMatch;
    return createCanonicalUnit(rawPrefix, symbol === "B" ? "byte" : "bit");
  }

  const longMatch = /^([kmgtpe](?:i)?)(bit|bits|byte|bytes)\/s$/iu.exec(normalized);
  if (longMatch) {
    const [, rawPrefix = "", rawQuantity = ""] = longMatch;
    const quantity = rawQuantity.toLowerCase().startsWith("byte") ? "byte" : "bit";
    return createCanonicalUnit(rawPrefix, quantity);
  }

  return undefined;
}

/**
 * 解析包含数值和单位的网络速率文本。
 *
 * 支持首尾空白、小数和科学计数法，例如 `"100 Mbps"`、`"12.5MiB/s"`。
 * 负数、无穷值、缺少单位或无法识别的单位返回 `undefined`。
 *
 * @example
 * parseNetworkRate("100 Mbps");
 * // { value: 100, unit: "Mbps", bitsPerSecond: 100000000, bytesPerSecond: 12500000 }
 */
export function parseNetworkRate(input: string): ParsedNetworkRate | undefined {
  const match = NETWORK_RATE_PATTERN.exec(input);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const unit = normalizeNetworkRateUnit(match[2] ?? "");
  if (!Number.isFinite(value) || value < 0 || unit === undefined) {
    return undefined;
  }

  const bitsPerSecond = value * getBitsPerSecondFactor(unit);
  if (!Number.isFinite(bitsPerSecond)) {
    return undefined;
  }

  return {
    value,
    unit,
    bitsPerSecond,
    bytesPerSecond: bitsPerSecond / BITS_PER_BYTE,
  };
}

/**
 * 在网络速率单位之间转换。
 *
 * @example
 * convertNetworkRate(100, "Mbps", "MB/s"); // 12.5
 * convertNetworkRate(1, "GiB/s", "Gbps"); // 8.589934592
 *
 * @throws {RangeError} value 为负数、不是有限数字、单位非法或换算结果溢出。
 */
export function convertNetworkRate(
  value: number,
  fromUnit: NetworkRateUnit,
  toUnit: NetworkRateUnit,
): number {
  assertNonNegativeFiniteNumber(value, "value");
  // 先计算单位倍率之比，避免“大数 × 大单位 ÷ 大单位”的中间结果无意义溢出。
  const conversionFactor = getBitsPerSecondFactor(fromUnit) / getBitsPerSecondFactor(toUnit);
  const result = value * conversionFactor;
  if (!Number.isFinite(result)) {
    throw new RangeError("converted network rate exceeds the finite number range");
  }
  return normalizeNegativeZero(result);
}

/** 将网络速率转换为 bit/s。 */
export function toBitsPerSecond(value: number, unit: NetworkRateUnit): number {
  return convertNetworkRate(value, unit, "bps");
}

/** 将网络速率转换为 Byte/s。 */
export function toBytesPerSecond(value: number, unit: NetworkRateUnit): number {
  return convertNetworkRate(value, unit, "B/s");
}

/**
 * 根据输入速率自动选择易读单位并格式化。
 *
 * 零值使用基础单位；非零值选择绝对值不小于 1 的最大单位，最高为 E/Ei。
 *
 * @example
 * formatNetworkRate(125000000, { inputUnit: "bps" }); // "125 Mbps"
 * formatNetworkRate(1048576, { inputUnit: "B/s", quantity: "byte", unitSystem: "iec" });
 * // "1 MiB/s"
 *
 * @throws {RangeError} 数值、单位、精度或配置非法。
 */
export function formatNetworkRate(value: number, options: FormatNetworkRateOptions = {}): string {
  const {
    inputUnit = "bps",
    locale = "en-US",
    precision = 2,
    quantity = "bit",
    space = true,
    trimTrailingZeros = true,
    unitSystem = "si",
    useGrouping = true,
  } = options;
  assertNonNegativeFiniteNumber(value, "value");
  assertFormatPrecision(precision);
  assertFormatOptions(quantity, unitSystem);

  const bitsPerSecond = toBitsPerSecond(value, inputUnit);
  const baseValue = quantity === "bit" ? bitsPerSecond : bitsPerSecond / BITS_PER_BYTE;
  const scale = unitSystem === "si" ? SI_BASE : IEC_BASE;
  const prefixIndex = selectPrefixIndex(baseValue, scale);
  const scaledValue = baseValue / scale ** prefixIndex;
  const unit = createOutputUnit(prefixIndex, quantity, unitSystem);
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: precision,
    minimumFractionDigits: trimTrailingZeros ? 0 : precision,
    useGrouping,
  }).format(scaledValue);

  return `${formatted}${space ? " " : ""}${unit}`;
}

/**
 * 根据已传输字节数和耗时计算平均网络速率。
 *
 * durationMilliseconds 为 0 时无法形成有效采样窗口，返回 `undefined`。
 *
 * @example
 * calculateNetworkRate(12_500_000, 1000, "Mbps"); // 100
 *
 * @throws {RangeError} 参数为负数、不是有限数字、单位非法或结果溢出。
 */
export function calculateNetworkRate(
  transferredBytes: number,
  durationMilliseconds: number,
  outputUnit: NetworkRateUnit = "Mbps",
): number | undefined {
  assertNonNegativeFiniteNumber(transferredBytes, "transferredBytes");
  assertNonNegativeFiniteNumber(durationMilliseconds, "durationMilliseconds");
  getBitsPerSecondFactor(outputUnit);

  if (durationMilliseconds === 0) {
    return undefined;
  }

  const bytesPerSecond = transferredBytes / (durationMilliseconds / MILLISECONDS_PER_SECOND);
  return convertNetworkRate(bytesPerSecond, "B/s", outputUnit);
}

/**
 * 根据数据大小和恒定网络速率估算理论传输耗时。
 *
 * 数据大小为 0 时返回零耗时；速率为 0 且存在待传输数据时返回 `undefined`。
 * 结果不包含协议开销、延迟、重传、限速和速率波动，仅适合理论估算。
 *
 * @throws {RangeError} 参数为负数、不是有限数字、单位非法或结果溢出。
 */
export function estimateTransferDuration(
  sizeBytes: number,
  rate: number,
  rateUnit: NetworkRateUnit = "bps",
): TransferDurationEstimate | undefined {
  assertNonNegativeFiniteNumber(sizeBytes, "sizeBytes");
  assertNonNegativeFiniteNumber(rate, "rate");
  const bytesPerSecond = toBytesPerSecond(rate, rateUnit);

  if (sizeBytes === 0) {
    return { milliseconds: 0, seconds: 0 };
  }
  if (bytesPerSecond === 0) {
    return undefined;
  }

  const seconds = sizeBytes / bytesPerSecond;
  const milliseconds = seconds * MILLISECONDS_PER_SECOND;
  if (!Number.isFinite(seconds) || !Number.isFinite(milliseconds)) {
    throw new RangeError("estimated transfer duration exceeds the finite number range");
  }

  return { milliseconds, seconds };
}

/**
 * 根据恒定速率和持续时间估算可传输的字节数。
 *
 * @throws {RangeError} 参数为负数、不是有限数字、单位非法或结果溢出。
 */
export function estimateTransferredBytes(
  rate: number,
  durationMilliseconds: number,
  rateUnit: NetworkRateUnit = "bps",
): number {
  assertNonNegativeFiniteNumber(rate, "rate");
  assertNonNegativeFiniteNumber(durationMilliseconds, "durationMilliseconds");
  const bytesPerSecond = toBytesPerSecond(rate, rateUnit);
  const result = bytesPerSecond * (durationMilliseconds / MILLISECONDS_PER_SECOND);
  if (!Number.isFinite(result)) {
    throw new RangeError("estimated transferred bytes exceed the finite number range");
  }
  return normalizeNegativeZero(result);
}

const NETWORK_RATE_PATTERN = /^\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([^\s]+)\s*$/iu;
const BITS_PER_BYTE = 8;
const MILLISECONDS_PER_SECOND = 1000;
const SI_BASE = 1000;
const IEC_BASE = 1024;
const MAX_PREFIX_INDEX = 6;
const MAX_FORMAT_PRECISION = 20;
const DECIMAL_PREFIXES = ["", "K", "M", "G", "T", "P", "E"] as const;
const BINARY_PREFIXES = ["", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei"] as const;

function getBitsPerSecondFactor(unit: NetworkRateUnit): number {
  const metadata = parseCanonicalUnit(unit);
  if (!metadata) {
    throw new RangeError(`unsupported network rate unit: ${String(unit)}`);
  }

  const base = metadata.unitSystem === "iec" ? IEC_BASE : SI_BASE;
  const quantityFactor = metadata.quantity === "byte" ? BITS_PER_BYTE : 1;
  return base ** metadata.prefixIndex * quantityFactor;
}

function parseCanonicalUnit(unit: string):
  | {
      prefixIndex: number;
      quantity: NetworkRateQuantity;
      unitSystem: NetworkRateUnitSystem;
    }
  | undefined {
  if (unit === "bps") {
    return { prefixIndex: 0, quantity: "bit", unitSystem: "si" };
  }
  if (unit === "B/s") {
    return { prefixIndex: 0, quantity: "byte", unitSystem: "si" };
  }

  const match = /^([KMGTPE](?:i)?)(bps|B\/s)$/u.exec(unit);
  if (!match) {
    return undefined;
  }

  const prefix = match[1] ?? "";
  const unitSystem: NetworkRateUnitSystem = prefix.endsWith("i") ? "iec" : "si";
  const prefixSymbol = prefix[0] ?? "";
  const prefixIndex = DECIMAL_PREFIXES.indexOf(prefixSymbol as (typeof DECIMAL_PREFIXES)[number]);
  if (prefixIndex <= 0) {
    return undefined;
  }

  return {
    prefixIndex,
    quantity: match[2] === "B/s" ? "byte" : "bit",
    unitSystem,
  };
}

function createCanonicalUnit(
  rawPrefix: string,
  quantity: NetworkRateQuantity,
): NetworkRateUnit | undefined {
  const normalizedPrefix = rawPrefix.toLowerCase();
  const binary = normalizedPrefix.endsWith("i");
  const symbol = normalizedPrefix[0]?.toUpperCase();
  const prefixIndex = DECIMAL_PREFIXES.indexOf(symbol as (typeof DECIMAL_PREFIXES)[number]);
  if (prefixIndex <= 0) {
    return undefined;
  }

  const prefix = binary ? BINARY_PREFIXES[prefixIndex] : DECIMAL_PREFIXES[prefixIndex];
  return `${prefix}${quantity === "byte" ? "B/s" : "bps"}` as NetworkRateUnit;
}

function createOutputUnit(
  prefixIndex: number,
  quantity: NetworkRateQuantity,
  unitSystem: NetworkRateUnitSystem,
): NetworkRateUnit {
  if (prefixIndex === 0) {
    return quantity === "byte" ? "B/s" : "bps";
  }

  const prefix =
    unitSystem === "iec" ? BINARY_PREFIXES[prefixIndex] : DECIMAL_PREFIXES[prefixIndex];
  return `${prefix}${quantity === "byte" ? "B/s" : "bps"}` as NetworkRateUnit;
}

function selectPrefixIndex(value: number, base: number): number {
  if (value === 0) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_PREFIX_INDEX, Math.floor(Math.log(value) / Math.log(base))));
}

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

function assertFormatPrecision(precision: number): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_FORMAT_PRECISION) {
    throw new RangeError(`precision must be an integer between 0 and ${MAX_FORMAT_PRECISION}`);
  }
}

function assertFormatOptions(
  quantity: NetworkRateQuantity,
  unitSystem: NetworkRateUnitSystem,
): void {
  if (quantity !== "bit" && quantity !== "byte") {
    throw new RangeError('quantity must be either "bit" or "byte"');
  }
  if (unitSystem !== "si" && unitSystem !== "iec") {
    throw new RangeError('unitSystem must be either "si" or "iec"');
  }
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

import { assert, assertFiniteNumber, assertIntegerInRange, assertNonNegativeNumber, assertOneOf } from "./assert.js";

/**
 * 存储量与网络速率的解析、换算与格式化。
 *
 * 存储量单位之间可互转，速率单位之间可互转；两类量纲不得交叉换算。
 * 严格区分 bit（`b`）与 Byte（`B`），1 Byte = 8 bit。
 * SI 使用 1000 进制（KB、Mbps），IEC 使用 1024 进制（KiB、MiB/s）。
 *
 * 参数校验使用 AssertionError。其余逻辑只使用 ECMAScript 标准 API，可同时运行于 Node.js 与浏览器。
 */

/** 十进制 SI 前缀。 */
export type DecimalPrefix = "K" | "M" | "G" | "T" | "P" | "E" | "Z" | "Y";

/** 二进制 IEC 前缀。 */
export type BinaryPrefix = "Ki" | "Mi" | "Gi" | "Ti" | "Pi" | "Ei" | "Zi" | "Yi";

/** 规范存储量单位。 */
export type StorageUnit = "bit" | "B" | `${DecimalPrefix}bit` | `${DecimalPrefix}B` | `${BinaryPrefix}bit` | `${BinaryPrefix}B`;

/** 规范网络速率单位，一律以每秒为时间基准。 */
export type RateUnit = `${StorageUnit}/s`;

/** 单位制。 */
export type UnitSystem = "si" | "iec";

/** 以 bit 还是 Byte 表示。 */
export type Quantity = "bit" | "byte";

/** 已解析的存储量。 */
export interface ParsedStorage {
  /** 输入数值。 */
  readonly value: number;
  /** 规范化后的存储单位。 */
  readonly unit: StorageUnit;
  /** 换算后的 bit 数。 */
  readonly bits: number;
  /** 换算后的 Byte 数；不足整字节时可能含小数。 */
  readonly bytes: number;
}

/** 已解析的网络速率。 */
export interface ParsedRate {
  /** 输入数值。 */
  readonly value: number;
  /** 规范化后的速率单位。 */
  readonly unit: RateUnit;
  /** 换算后的 bit/s。 */
  readonly bitsPerSecond: number;
  /** 换算后的 Byte/s。 */
  readonly bytesPerSecond: number;
}

/** 格式化公共配置。 */
export interface FormatBinaryOptions {
  /**
   * 输出使用 bit 还是 Byte。
   */
  readonly quantity?: Quantity;
  /**
   * 输出采用 SI 还是 IEC。
   */
  readonly system?: UnitSystem;
  /**
   * 最大小数位数，范围为 0 到 20。
   *
   * @default 2
   */
  readonly precision?: number;
  /**
   * 是否移除无意义的末尾零。关闭时固定显示 precision 位小数。
   *
   * @default true
   */
  readonly trimZeros?: boolean;
  /**
   * 是否使用数字分组符。
   *
   * @default true
   */
  readonly grouping?: boolean;
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

/** 存储量格式化配置。 */
export interface FormatStorageOptions extends FormatBinaryOptions {
  /**
   * 输入值的单位。
   *
   * @default "B"
   */
  readonly from?: string;
  /**
   * 输出使用 bit 还是 Byte。
   *
   * @default "byte"
   */
  readonly quantity?: Quantity;
  /**
   * 输出采用 SI 还是 IEC。
   *
   * @default "iec"
   */
  readonly system?: UnitSystem;
}

/** 网络速率格式化配置。 */
export interface FormatRateOptions extends FormatBinaryOptions {
  /**
   * 输入值的单位。
   *
   * @default "bit/s"
   */
  readonly from?: string;
  /**
   * 输出使用 bit 还是 Byte。
   *
   * @default "bit"
   */
  readonly quantity?: Quantity;
  /**
   * 输出采用 SI 还是 IEC。
   *
   * @default "si"
   */
  readonly system?: UnitSystem;
}

const BITS_PER_BYTE = 8;
const BIGINT_BITS_PER_BYTE = 8n;
const SI_BASE = 1000;
const IEC_BASE = 1024;
const MAX_PREFIX_INDEX = 8;
const MAX_FORMAT_PRECISION = 20;
const DECIMAL_PREFIXES = ["", "K", "M", "G", "T", "P", "E", "Z", "Y"] as const;
const BINARY_PREFIXES = ["", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei", "Zi", "Yi"] as const;

const QUANTITY_VALUE_REGEX = /^\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(.+?)\s*$/iu;
const RATE_TIME_SUFFIX_REGEX = /(?:\s*(?:\/\s*(?:s(?:ec(?:ond)?s?)?|秒)|per\s+s(?:ec(?:ond)?s?)|每秒))\s*$/iu;
const SHORT_UNIT_REGEX = /^([kmgtpezy](?:i)?)([bB])$/iu;
const LONG_UNIT_REGEX = /^([kmgtpezy](?:i)?)(bits?|bytes?)$/iu;
const CANONICAL_STORAGE_UNIT_REGEX = /^([KMGTPEZY](?:i)?)(bit|B)$/u;
const BPS_UNIT_REGEX = /^([kmgtpezy](?:i)?)?([bB])ps$/iu;
const SI_LONG_PREFIX_REGEX = /^(kilo|mega|giga|tera|peta|exa|zetta|yotta)?(bits?|bytes?)$/iu;
const IEC_LONG_PREFIX_REGEX = /^(kibi|mebi|gibi|tebi|pebi|exbi|zebi|yobi)(bits?|bytes?)$/iu;

const SI_LONG_PREFIX_INDEX = {
  kilo: 1,
  mega: 2,
  giga: 3,
  tera: 4,
  peta: 5,
  exa: 6,
  zetta: 7,
  yotta: 8,
} as const;

const IEC_LONG_PREFIX_INDEX = {
  kibi: 1,
  mebi: 2,
  gibi: 3,
  tebi: 4,
  pebi: 5,
  exbi: 6,
  zebi: 7,
  yobi: 8,
} as const;

/** 全部规范存储单位，可用于下拉选项等场景。 */
export const STORAGE_UNITS = buildStorageUnits();

/** 全部规范速率单位，可用于下拉选项等场景。 */
export const RATE_UNITS = STORAGE_UNITS.map((unit) => `${unit}/s` as RateUnit);

/**
 * 将常见存储单位别名规范化为规范单位。
 *
 * 前缀大小写不敏感；末尾 `b`/`B` 严格区分 bit 与 Byte。
 * 例如 `mb`、`Mbit`、`megabit` → `Mbit`；`MB`、`MByte`、`megabyte` → `MB`。
 * 速率写法（如 `Mbps`、`MB/s`）不属于存储单位。
 *
 * @param unit - 存储单位或其别名。
 * @returns 规范存储单位。无法识别时返回 `undefined`。
 */
export function normalizeStorageUnit(unit: string): StorageUnit | undefined {
  return parseUnitToken(unit, "storage")?.unit;
}

/**
 * 将常见速率单位别名规范化为规范单位。
 *
 * 支持 `Mbps`、`MB/s`、`MBps`、`megabits per second` 等写法。
 * `Mbps` 为兆比特每秒，`MBps` / `MB/s` 为兆字节每秒。
 *
 * @param unit - 速率单位或其别名。
 * @returns 规范速率单位，一律以 `/s` 结尾。无法识别时返回 `undefined`。
 */
export function normalizeRateUnit(unit: string): RateUnit | undefined {
  const parsed = parseUnitToken(unit, "rate");
  return parsed ? `${parsed.unit}/s` : undefined;
}

/**
 * 判断字符串是否为可识别的存储单位（含别名）。
 *
 * @param unit - 待判断的单位字符串。
 * @returns 能规范化为 {@link StorageUnit} 时返回 `true`。
 */
export function isStorageUnit(unit: string): boolean {
  return normalizeStorageUnit(unit) !== undefined;
}

/**
 * 判断字符串是否为可识别的速率单位（含别名）。
 *
 * @param unit - 待判断的单位字符串。
 * @returns 能规范化为 {@link RateUnit} 时返回 `true`。
 */
export function isRateUnit(unit: string): boolean {
  return normalizeRateUnit(unit) !== undefined;
}

/**
 * 解析带单位的存储量字符串。
 *
 * 支持小数与科学计数法，例如 `"1.5 MiB"`、`"8e3 bit"`。
 * 负数、无穷值、缺少单位或单位非法时返回 `undefined`。
 *
 * @param input - 带存储单位的数量字符串。
 * @returns 解析结果，包含原数值和换算后的 bit、Byte。无法解析时返回 `undefined`。
 */
export function parseStorage(input: string): ParsedStorage | undefined {
  const parsed = parseQuantityInput(input, "storage");
  if (!parsed) {
    return undefined;
  }

  const bits = parsed.value * getNumberBitFactor(parsed.unit);
  if (!Number.isFinite(bits)) {
    return undefined;
  }

  return { bits, bytes: bits / BITS_PER_BYTE, unit: parsed.unit, value: parsed.value };
}

/**
 * 解析带单位的网络速率字符串。
 *
 * 例如 `"100 Mbps"`、`"12.5 MB/s"`、`"1e9 bit/s"`。
 * 负数、无穷值、缺少单位或单位非法时返回 `undefined`。
 *
 * @param input - 带速率单位的数量字符串。
 * @returns 解析结果，包含原数值和换算后的 bit/s、Byte/s。无法解析时返回 `undefined`。
 */
export function parseRate(input: string): ParsedRate | undefined {
  const parsed = parseQuantityInput(input, "rate");
  if (!parsed) {
    return undefined;
  }

  const bitsPerSecond = parsed.value * getNumberBitFactor(parsed.unit);
  if (!Number.isFinite(bitsPerSecond)) {
    return undefined;
  }

  return {
    bitsPerSecond,
    bytesPerSecond: bitsPerSecond / BITS_PER_BYTE,
    unit: `${parsed.unit}/s`,
    value: parsed.value,
  };
}

/**
 * 在存储单位之间转换。`number` 返回 `number`，`bigint` 返回 `bigint`。
 *
 * bigint 路径若无法整除会抛出异常，不会截断。例如 `1n bit` 无法精确转为 Byte。
 * 不接受速率单位。
 *
 * @param value - 非负数量。`number` 必须是有限值。
 * @param from - 输入存储单位或其别名。
 * @param to - 输出存储单位或其别名。
 * @returns 换算结果，类型与 `value` 相同。
 * @throws {AssertionError} 数值为负、非有限值、单位非法、结果溢出，或 bigint 结果不是整数。
 *
 * @example
 * convertStorage(1, "MiB", "B"); // 1048576
 * convertStorage(8n, "bit", "B"); // 1n
 * convertStorage(1, "GB", "GiB");
 */
export function convertStorage(value: number, from: string, to: string): number;
export function convertStorage(value: bigint, from: string, to: string): bigint;
export function convertStorage(value: number | bigint, from: string, to: string): number | bigint {
  return convertByStorageUnit(value, requireStorageUnit(from), requireStorageUnit(to));
}

/**
 * 在网络速率单位之间转换。`number` 返回 `number`，`bigint` 返回 `bigint`。
 *
 * 不接受纯存储单位。bigint 无法整除时抛出异常，不会截断。
 *
 * @param value - 非负速率。`number` 必须是有限值。
 * @param from - 输入速率单位或其别名。
 * @param to - 输出速率单位或其别名。
 * @returns 换算结果，类型与 `value` 相同。
 * @throws {AssertionError} 数值为负、非有限值、单位非法、结果溢出，或 bigint 结果不是整数。
 *
 * @example
 * convertRate(1, "MB/s", "Mbps"); // 8
 * convertRate(1000, "Mbps", "Gbps"); // 1
 */
export function convertRate(value: number, from: string, to: string): number;
export function convertRate(value: bigint, from: string, to: string): bigint;
export function convertRate(value: number | bigint, from: string, to: string): number | bigint {
  return convertByStorageUnit(value, requireRateBaseUnit(from), requireRateBaseUnit(to));
}

/**
 * 比较两个存储量。返回值语义与 `Array.prototype.sort` 比较函数相同。
 *
 * 两侧先换算为 bit 再比较，因此可以混用 SI 与 IEC、bit 与 Byte。
 *
 * @param left - 左侧非负有限数字。
 * @param leftFrom - 左侧存储单位或其别名。
 * @param right - 右侧非负有限数字。
 * @param rightFrom - 右侧存储单位或其别名。
 * @returns 左侧较小为 `-1`，相等为 `0`，左侧较大为 `1`。
 * @throws {AssertionError} 数值或单位非法。
 */
export function compareStorage(left: number, leftFrom: string, right: number, rightFrom: string): number {
  return Math.sign(convertStorage(left, leftFrom, "bit") - convertStorage(right, rightFrom, "bit"));
}

/**
 * 比较两个网络速率。返回值语义与 `Array.prototype.sort` 比较函数相同。
 *
 * 两侧先换算为 bit/s 再比较。
 *
 * @param left - 左侧非负有限数字。
 * @param leftFrom - 左侧速率单位或其别名。
 * @param right - 右侧非负有限数字。
 * @param rightFrom - 右侧速率单位或其别名。
 * @returns 左侧较小为 `-1`，相等为 `0`，左侧较大为 `1`。
 * @throws {AssertionError} 数值或单位非法。
 */
export function compareRate(left: number, leftFrom: string, right: number, rightFrom: string): number {
  return Math.sign(convertRate(left, leftFrom, "bit/s") - convertRate(right, rightFrom, "bit/s"));
}

/**
 * 自动选择易读单位并格式化存储量。
 *
 * 默认把输入视为 Byte，并按 IEC、Byte 输出，例如 `1536` → `"1.5 KiB"`。
 *
 * @param value - 非负存储量。`number` 必须是有限值。
 * @param options - 输入单位、输出单位制和数字格式。
 * @returns 带单位的本地化字符串。
 * @throws {AssertionError} 数值、单位、精度或配置非法。
 *
 * @example
 * formatStorage(1536); // "1.5 KiB"
 * formatStorage(1_000_000, { system: "si" }); // "1 MB"
 */
export function formatStorage(value: number | bigint, options: FormatStorageOptions = {}): string {
  const resolved = resolveFormatOptions(options, { quantity: "byte", system: "iec" });
  const bits = toBitsValue(value, requireStorageUnit(options.from ?? "B"));
  return formatBits(bits, resolved, "storage");
}

/**
 * 自动选择易读单位并格式化网络速率。
 *
 * 默认把输入视为 bit/s，并按 SI、bit 输出。bit + SI 使用 `bps`、`Mbps` 这类写法；其余组合使用 `/s`。
 *
 * @param value - 非负速率。`number` 必须是有限值。
 * @param options - 输入单位、输出单位制和数字格式。
 * @returns 带单位的本地化字符串。
 * @throws {AssertionError} 数值、单位、精度或配置非法。
 *
 * @example
 * formatRate(1_000_000); // "1 Mbps"
 * formatRate(1_048_576, { from: "B/s", quantity: "byte", system: "iec" }); // "1 MiB/s"
 */
export function formatRate(value: number | bigint, options: FormatRateOptions = {}): string {
  const resolved = resolveFormatOptions(options, { quantity: "bit", system: "si" });
  const bitsPerSecond = toBitsValue(value, requireRateBaseUnit(options.from ?? "bit/s"));
  return formatBits(bitsPerSecond, resolved, "rate");
}

/**
 * 将存储量转换为 Byte。
 *
 * bigint 输入不足整字节时抛出 `RangeError`，不会截断。
 *
 * @param value - 非负存储量。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 Byte，类型与 `value` 相同。
 * @throws {AssertionError} 数值或单位非法，或 bigint 结果不是整数。
 *
 * @example
 * toBytes(1, "MiB"); // 1048576
 */
export function toBytes(value: number, from?: string): number;
export function toBytes(value: bigint, from?: string): bigint;
export function toBytes(value: number | bigint, from = "B"): number | bigint {
  return typeof value === "bigint" ? convertStorage(value, from, "B") : convertStorage(value, from, "B");
}

/**
 * 将存储量转换为 bit。
 *
 * @param value - 非负存储量。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 bit，类型与 `value` 相同。
 * @throws {AssertionError} 数值或单位非法，或 bigint 结果不是整数。
 *
 * @example
 * toBits(1, "B"); // 8
 */
export function toBits(value: number, from?: string): number;
export function toBits(value: bigint, from?: string): bigint;
export function toBits(value: number | bigint, from = "B"): number | bigint {
  return typeof value === "bigint" ? convertStorage(value, from, "bit") : convertStorage(value, from, "bit");
}

/**
 * 将网络速率转换为 bit/s。
 *
 * 小写 `b` 表示 bit，与 {@link toBps} 的大写 `B`（Byte/s）相对。
 *
 * @param value - 非负速率。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 bit/s，类型与 `value` 相同。
 * @throws {AssertionError} 数值或单位非法，或 bigint 结果不是整数。
 *
 * @example
 * tobps(1, "Mbps"); // 1_000_000
 */
export function tobps(value: number, from?: string): number;
export function tobps(value: bigint, from?: string): bigint;
export function tobps(value: number | bigint, from = "bit/s"): number | bigint {
  return typeof value === "bigint" ? convertRate(value, from, "bit/s") : convertRate(value, from, "bit/s");
}

/**
 * 将网络速率转换为 Byte/s。
 *
 * 大写 `B` 表示 Byte，与 {@link tobps} 的 bit/s 相对。
 *
 * @param value - 非负速率。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 Byte/s，类型与 `value` 相同。
 * @throws {AssertionError} 数值或单位非法，或 bigint 结果不是整数。
 *
 * @example
 * toBps(8, "bit/s"); // 1
 */
export function toBps(value: number, from?: string): number;
export function toBps(value: bigint, from?: string): bigint;
export function toBps(value: number | bigint, from = "bit/s"): number | bigint {
  return typeof value === "bigint" ? convertRate(value, from, "B/s") : convertRate(value, from, "B/s");
}

/**
 * 将存储量转换为 KB（SI，1000 Byte）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 KB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toKB(value: number, from = "B"): number {
  return convertStorage(value, from, "KB");
}

/**
 * 将存储量转换为 MB（SI，1000 KB）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 MB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toMB(value: number, from = "B"): number {
  return convertStorage(value, from, "MB");
}

/**
 * 将存储量转换为 GB（SI）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 GB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toGB(value: number, from = "B"): number {
  return convertStorage(value, from, "GB");
}

/**
 * 将存储量转换为 TB（SI）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 TB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toTB(value: number, from = "B"): number {
  return convertStorage(value, from, "TB");
}

/**
 * 将存储量转换为 PB（SI）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 PB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toPB(value: number, from = "B"): number {
  return convertStorage(value, from, "PB");
}

/**
 * 将存储量转换为 KiB（IEC，1024 Byte）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 KiB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toKiB(value: number, from = "B"): number {
  return convertStorage(value, from, "KiB");
}

/**
 * 将存储量转换为 MiB（IEC）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 MiB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toMiB(value: number, from = "B"): number {
  return convertStorage(value, from, "MiB");
}

/**
 * 将存储量转换为 GiB（IEC）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 GiB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toGiB(value: number, from = "B"): number {
  return convertStorage(value, from, "GiB");
}

/**
 * 将存储量转换为 TiB（IEC）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 TiB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toTiB(value: number, from = "B"): number {
  return convertStorage(value, from, "TiB");
}

/**
 * 将存储量转换为 PiB（IEC）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入存储单位，默认 `"B"`。
 * @returns 换算后的 PiB。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toPiB(value: number, from = "B"): number {
  return convertStorage(value, from, "PiB");
}

/**
 * 将网络速率转换为 Kbps（SI，千比特每秒）。
 *
 * 名称里的 `bps` 表示 bit/s。字节每秒使用 {@link toKBps}。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 Kbps。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toKbps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "Kbit/s");
}

/**
 * 将网络速率转换为 Mbps（SI，兆比特每秒）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 Mbps。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toMbps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "Mbit/s");
}

/**
 * 将网络速率转换为 Gbps（SI，吉比特每秒）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 Gbps。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toGbps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "Gbit/s");
}

/**
 * 将网络速率转换为 Tbps（SI，太比特每秒）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 Tbps。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toTbps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "Tbit/s");
}

/**
 * 将网络速率转换为 KB/s（SI，千字节每秒）。
 *
 * 名称里的 `Bps` 表示 Byte/s，与 {@link toKbps} 的 bit/s 相对。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 KB/s。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toKBps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "KB/s");
}

/**
 * 将网络速率转换为 MB/s（SI，兆字节每秒）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 MB/s。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toMBps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "MB/s");
}

/**
 * 将网络速率转换为 GB/s（SI，吉字节每秒）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 GB/s。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toGBps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "GB/s");
}

/**
 * 将网络速率转换为 KiB/s（IEC，1024 Byte/s）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 KiB/s。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toKiBps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "KiB/s");
}

/**
 * 将网络速率转换为 MiB/s（IEC）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 MiB/s。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toMiBps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "MiB/s");
}

/**
 * 将网络速率转换为 GiB/s（IEC）。
 *
 * @param value - 非负有限数字。
 * @param from - 输入速率单位，默认 `"bit/s"`。
 * @returns 换算后的 GiB/s。
 * @throws {AssertionError} 数值或单位非法。
 */
export function toGiBps(value: number, from = "bit/s"): number {
  return convertRate(value, from, "GiB/s");
}

interface UnitMetadata {
  readonly prefixIndex: number;
  readonly quantity: Quantity;
  readonly unit: StorageUnit;
  readonly unitSystem: UnitSystem;
}

interface ResolvedFormatOptions {
  readonly grouping: boolean;
  readonly locale: Intl.LocalesArgument;
  readonly precision: number;
  readonly quantity: Quantity;
  readonly space: boolean;
  readonly system: UnitSystem;
  readonly trimZeros: boolean;
}

function buildStorageUnits(): readonly StorageUnit[] {
  const units: StorageUnit[] = ["bit", "B"];
  for (let index = 1; index <= MAX_PREFIX_INDEX; index += 1) {
    const decimalPrefix = DECIMAL_PREFIXES[index];
    const binaryPrefix = BINARY_PREFIXES[index];
    if (decimalPrefix === undefined || binaryPrefix === undefined) {
      continue;
    }
    units.push(`${decimalPrefix}bit`, `${decimalPrefix}B`, `${binaryPrefix}bit`, `${binaryPrefix}B`);
  }
  return units;
}

function parseQuantityInput(input: string, kind: "storage" | "rate"): { readonly unit: StorageUnit; readonly value: number } | undefined {
  const match = QUANTITY_VALUE_REGEX.exec(input);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const metadata = parseUnitToken(match[2] ?? "", kind);
  if (!Number.isFinite(value) || value < 0 || !metadata) {
    return undefined;
  }

  return { unit: metadata.unit, value };
}

function parseUnitToken(rawUnit: string, kind: "storage" | "rate"): UnitMetadata | undefined {
  const trimmed = rawUnit.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const stripped = stripRateSuffix(trimmed);
  if (kind === "storage") {
    if (stripped.hadRateSuffix || BPS_UNIT_REGEX.test(trimmed)) {
      return undefined;
    }
    return parseStorageToken(trimmed);
  }

  if (stripped.hadRateSuffix) {
    return parseStorageToken(stripped.body);
  }

  const bpsMatch = BPS_UNIT_REGEX.exec(trimmed);
  if (bpsMatch) {
    return createCanonicalUnit(bpsMatch[1] ?? "", bpsMatch[2] === "B" ? "byte" : "bit");
  }

  return undefined;
}

function stripRateSuffix(unit: string): { readonly body: string; readonly hadRateSuffix: boolean } {
  const stripped = unit.replace(RATE_TIME_SUFFIX_REGEX, "");
  if (stripped !== unit && stripped.trim().length > 0) {
    return { body: stripped.trim(), hadRateSuffix: true };
  }
  return { body: unit, hadRateSuffix: false };
}

function parseStorageToken(unit: string): UnitMetadata | undefined {
  const normalized = unit.trim();
  if (normalized === "b" || /^bits?$/iu.test(normalized)) {
    return { prefixIndex: 0, quantity: "bit", unit: "bit", unitSystem: "si" };
  }
  if (normalized === "B" || /^bytes?$/iu.test(normalized)) {
    return { prefixIndex: 0, quantity: "byte", unit: "B", unitSystem: "si" };
  }

  const iecLongMatch = IEC_LONG_PREFIX_REGEX.exec(normalized);
  if (iecLongMatch) {
    const prefixIndex = IEC_LONG_PREFIX_INDEX[iecLongMatch[1]?.toLowerCase() as keyof typeof IEC_LONG_PREFIX_INDEX];
    const quantity: Quantity = (iecLongMatch[2] ?? "").toLowerCase().startsWith("byte") ? "byte" : "bit";
    return metadataFromPrefix(prefixIndex, quantity, "iec");
  }

  const siLongMatch = SI_LONG_PREFIX_REGEX.exec(normalized);
  if (siLongMatch) {
    const rawPrefix = siLongMatch[1]?.toLowerCase();
    const prefixIndex = rawPrefix ? SI_LONG_PREFIX_INDEX[rawPrefix as keyof typeof SI_LONG_PREFIX_INDEX] : 0;
    const quantity: Quantity = (siLongMatch[2] ?? "").toLowerCase().startsWith("byte") ? "byte" : "bit";
    return metadataFromPrefix(prefixIndex, quantity, "si");
  }

  const shortMatch = SHORT_UNIT_REGEX.exec(normalized);
  if (shortMatch) {
    return createCanonicalUnit(shortMatch[1] ?? "", shortMatch[2] === "B" ? "byte" : "bit");
  }

  const longMatch = LONG_UNIT_REGEX.exec(normalized);
  if (longMatch) {
    const quantity: Quantity = (longMatch[2] ?? "").toLowerCase().startsWith("byte") ? "byte" : "bit";
    return createCanonicalUnit(longMatch[1] ?? "", quantity);
  }

  return parseCanonicalUnit(normalized);
}

function createCanonicalUnit(rawPrefix: string, quantity: Quantity): UnitMetadata | undefined {
  if (rawPrefix.length === 0) {
    return metadataFromPrefix(0, quantity, "si");
  }

  const normalizedPrefix = rawPrefix.toLowerCase();
  const unitSystem: UnitSystem = normalizedPrefix.endsWith("i") ? "iec" : "si";
  const symbol = normalizedPrefix[0]?.toUpperCase();
  const prefixIndex = DECIMAL_PREFIXES.indexOf(symbol as (typeof DECIMAL_PREFIXES)[number]);
  if (prefixIndex <= 0) {
    return undefined;
  }

  return metadataFromPrefix(prefixIndex, quantity, unitSystem);
}

function parseCanonicalUnit(unit: string): UnitMetadata | undefined {
  if (unit === "bit") {
    return { prefixIndex: 0, quantity: "bit", unit: "bit", unitSystem: "si" };
  }
  if (unit === "B") {
    return { prefixIndex: 0, quantity: "byte", unit: "B", unitSystem: "si" };
  }

  const match = CANONICAL_STORAGE_UNIT_REGEX.exec(unit);
  if (!match) {
    return undefined;
  }

  const prefix = match[1] ?? "";
  const prefixIndex = DECIMAL_PREFIXES.indexOf((prefix[0] ?? "") as (typeof DECIMAL_PREFIXES)[number]);
  if (prefixIndex <= 0) {
    return undefined;
  }

  return metadataFromPrefix(prefixIndex, match[2] === "B" ? "byte" : "bit", prefix.endsWith("i") ? "iec" : "si");
}

function metadataFromPrefix(prefixIndex: number, quantity: Quantity, unitSystem: UnitSystem): UnitMetadata | undefined {
  const unit = createOutputStorageUnit(prefixIndex, quantity, unitSystem);
  if (!unit) {
    return undefined;
  }
  return { prefixIndex, quantity, unit, unitSystem };
}

function requireStorageUnit(unit: string): StorageUnit {
  const normalized = normalizeStorageUnit(unit);
  assert(normalized, `unsupported storage unit: ${unit}`);
  return normalized;
}

function requireRateBaseUnit(unit: string): StorageUnit {
  const normalized = normalizeRateUnit(unit);
  assert(normalized, `unsupported rate unit: ${unit}`);
  return normalized.slice(0, -2) as StorageUnit;
}

function convertByStorageUnit(value: number | bigint, fromUnit: StorageUnit, toUnit: StorageUnit): number | bigint {
  if (typeof value === "bigint") {
    assert(value >= 0n, "value must be non-negative");
    const numerator = value * getBigIntBitFactor(fromUnit);
    const denominator = getBigIntBitFactor(toUnit);
    assert(numerator % denominator === 0n, "bigint conversion would produce a fractional result");
    return numerator / denominator;
  }

  assertNonNegativeNumber(value, { name: "value" });
  const result = value * (getNumberBitFactor(fromUnit) / getNumberBitFactor(toUnit));
  assertFiniteNumber(result, { message: "converted value exceeds the finite number range" });
  return normalizeNegativeZero(result);
}

function toBitsValue(value: number | bigint, unit: StorageUnit): number | bigint {
  if (typeof value === "bigint") {
    assert(value >= 0n, "value must be non-negative");
    return value * getBigIntBitFactor(unit);
  }

  assertNonNegativeNumber(value, { name: "value" });
  const bits = value * getNumberBitFactor(unit);
  assertFiniteNumber(bits, { message: "value exceeds the finite number range" });
  return normalizeNegativeZero(bits);
}

function getNumberBitFactor(unit: StorageUnit): number {
  return Number(getBigIntBitFactor(unit));
}

function getBigIntBitFactor(unit: StorageUnit): bigint {
  const metadata = parseCanonicalUnit(unit);
  assert(metadata, `unsupported unit: ${unit}`);
  const base = metadata.unitSystem === "iec" ? BigInt(IEC_BASE) : BigInt(SI_BASE);
  const quantityFactor = metadata.quantity === "byte" ? BIGINT_BITS_PER_BYTE : 1n;
  return base ** BigInt(metadata.prefixIndex) * quantityFactor;
}

function resolveFormatOptions(options: FormatStorageOptions | FormatRateOptions, defaults: { readonly quantity: Quantity; readonly system: UnitSystem }): ResolvedFormatOptions {
  const { grouping = true, locale = "en-US", precision = 2, quantity = defaults.quantity, space = true, system = defaults.system, trimZeros = true } = options;
  assertIntegerInRange(precision, 0, MAX_FORMAT_PRECISION, { name: "precision" });
  assertOneOf(quantity, ["bit", "byte"] as const);
  assertOneOf(system, ["si", "iec"] as const);
  return { grouping, locale, precision, quantity, space, system, trimZeros };
}

function formatBits(bits: number | bigint, options: ResolvedFormatOptions, kind: "storage" | "rate"): string {
  if (typeof bits === "bigint") {
    return formatBigIntBits(bits, options, kind);
  }
  return formatNumberBits(bits, options, kind);
}

function formatNumberBits(bits: number, options: ResolvedFormatOptions, kind: "storage" | "rate"): string {
  const base = options.system === "si" ? SI_BASE : IEC_BASE;
  const baseValue = options.quantity === "byte" ? bits / BITS_PER_BYTE : bits;
  let prefixIndex = selectNumberPrefixIndex(baseValue, base);
  let scaledValue = baseValue / base ** prefixIndex;
  if (prefixIndex < MAX_PREFIX_INDEX && Number(scaledValue.toFixed(options.precision)) >= base) {
    prefixIndex += 1;
    scaledValue = baseValue / base ** prefixIndex;
  }
  const formatted = new Intl.NumberFormat(options.locale, {
    maximumFractionDigits: options.precision,
    minimumFractionDigits: options.trimZeros ? 0 : options.precision,
    useGrouping: options.grouping,
  }).format(scaledValue);
  return `${formatted}${options.space ? " " : ""}${createOutputUnit(prefixIndex, options.quantity, options.system, kind)}`;
}

function formatBigIntBits(bits: bigint, options: ResolvedFormatOptions, kind: "storage" | "rate"): string {
  const base = BigInt(options.system === "si" ? SI_BASE : IEC_BASE);
  const baseFactor = options.quantity === "byte" ? BIGINT_BITS_PER_BYTE : 1n;
  let prefixIndex = selectBigIntPrefixIndex(bits, base, baseFactor);
  const decimalFactor = 10n ** BigInt(options.precision);
  let unitFactor = base ** BigInt(prefixIndex) * baseFactor;
  let scaledInteger = (bits * decimalFactor + unitFactor / 2n) / unitFactor;
  if (prefixIndex < MAX_PREFIX_INDEX && scaledInteger >= base * decimalFactor) {
    prefixIndex += 1;
    unitFactor = base ** BigInt(prefixIndex) * baseFactor;
    scaledInteger = (bits * decimalFactor + unitFactor / 2n) / unitFactor;
  }

  const integerPart = scaledInteger / decimalFactor;
  let fractionalPart = options.precision === 0 ? "" : (scaledInteger % decimalFactor).toString().padStart(options.precision, "0");
  if (options.trimZeros) {
    fractionalPart = fractionalPart.replace(/0+$/u, "");
  }

  const formattedInteger = new Intl.NumberFormat(options.locale, {
    maximumFractionDigits: 0,
    useGrouping: options.grouping,
  }).format(integerPart);
  const formattedFraction = localizeDigits(fractionalPart, options.locale);
  const decimalSeparator = fractionalPart.length === 0 ? "" : (new Intl.NumberFormat(options.locale).formatToParts(1.1).find(({ type }) => type === "decimal")?.value ?? ".");
  return `${formattedInteger}${decimalSeparator}${formattedFraction}${options.space ? " " : ""}${createOutputUnit(prefixIndex, options.quantity, options.system, kind)}`;
}

function localizeDigits(value: string, locale: Intl.LocalesArgument): string {
  if (value.length === 0) {
    return "";
  }
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const digits = Array.from({ length: 10 }, (_, digit) => formatter.format(digit));
  return value.replace(/\d/gu, (digit) => digits[Number(digit)] ?? digit);
}

function createOutputStorageUnit(prefixIndex: number, quantity: Quantity, unitSystem: UnitSystem): StorageUnit | undefined {
  if (prefixIndex < 0 || prefixIndex > MAX_PREFIX_INDEX) {
    return undefined;
  }
  if (prefixIndex === 0) {
    return quantity === "byte" ? "B" : "bit";
  }
  const prefix = unitSystem === "iec" ? BINARY_PREFIXES[prefixIndex] : DECIMAL_PREFIXES[prefixIndex];
  if (!prefix) {
    return undefined;
  }
  return `${prefix}${quantity === "byte" ? "B" : "bit"}`;
}

function createOutputUnit(prefixIndex: number, quantity: Quantity, system: UnitSystem, kind: "storage" | "rate"): string {
  const storageUnit = createOutputStorageUnit(prefixIndex, quantity, system);
  assert(storageUnit, "unsupported output unit");
  if (kind === "storage") {
    return storageUnit;
  }
  if (quantity === "bit" && system === "si") {
    return storageUnit === "bit" ? "bps" : `${storageUnit.slice(0, -3)}bps`;
  }
  return `${storageUnit}/s`;
}

function selectNumberPrefixIndex(value: number, base: number): number {
  if (value === 0) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_PREFIX_INDEX, Math.floor(Math.log(value) / Math.log(base))));
}

function selectBigIntPrefixIndex(bits: bigint, base: bigint, baseFactor: bigint): number {
  let prefixIndex = 0;
  while (prefixIndex < MAX_PREFIX_INDEX && bits >= baseFactor * base ** BigInt(prefixIndex + 1)) {
    prefixIndex += 1;
  }
  return prefixIndex;
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

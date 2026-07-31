/**
 * bit/Byte 大小的解析、精确转换、格式化与分片工具。
 *
 * 本模块只使用 ECMAScript 标准 API，可同时运行于现代 Node.js 和浏览器环境。
 * 所有 API 严格区分 bit（小写 b）与 Byte（大写 B），1 Byte = 8 bit。
 */

/** 十进制 SI 字节前缀。 */
export type DecimalBytePrefix = "K" | "M" | "G" | "T" | "P" | "E";

/** 二进制 IEC 字节前缀。 */
export type BinaryBytePrefix = "Ki" | "Mi" | "Gi" | "Ti" | "Pi" | "Ei";

/** 规范 bit/Byte 大小单位。 */
export type ByteSizeUnit =
  | "bit"
  | "B"
  | `${DecimalBytePrefix}bit`
  | `${DecimalBytePrefix}B`
  | `${BinaryBytePrefix}bit`
  | `${BinaryBytePrefix}B`;

/** 字节单位制。 */
export type ByteUnitSystem = "si" | "iec";

/** 大小使用 bit 还是 Byte 表示。 */
export type ByteQuantity = "bit" | "byte";

/** 已解析的普通数值大小。 */
export interface ParsedByteSize {
  /** 输入中的数值。 */
  readonly value: number;
  /** 规范化后的输入单位。 */
  readonly unit: ByteSizeUnit;
  /** 换算后的 bit 数。 */
  readonly bits: number;
  /** 换算后的 Byte 数；输入不足整字节时可能包含小数。 */
  readonly bytes: number;
}

/** 已解析的任意精度整数大小。 */
export interface ParsedExactByteSize {
  /** 输入中的任意精度整数。 */
  readonly value: bigint;
  /** 规范化后的输入单位。 */
  readonly unit: ByteSizeUnit;
  /** 精确 bit 数。 */
  readonly bits: bigint;
  /** 精确 Byte 数。 */
  readonly bytes: bigint;
}

/** 任意精度字节解析配置。 */
export interface ParseByteSizeExactOptions {
  /**
   * 输入整数最多允许的十进制数字数，用于限制不可信输入的资源消耗。
   *
   * @default 10000
   */
  readonly maxDigits?: number;
}

/** 字节大小格式化配置。 */
export interface FormatByteSizeOptions {
  /**
   * 输入值的单位。
   *
   * @default "B"
   */
  readonly inputUnit?: ByteSizeUnit;
  /**
   * 输出使用 bit 还是 Byte。
   *
   * @default "byte"
   */
  readonly quantity?: ByteQuantity;
  /**
   * 输出采用十进制 SI 还是二进制 IEC 单位制。
   *
   * @default "iec"
   */
  readonly unitSystem?: ByteUnitSystem;
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

/** 字节分片范围，采用左闭右开区间 `[start, endExclusive)`。 */
export interface ByteRange {
  /** 从 0 开始的分片序号。 */
  readonly index: number;
  /** 起始字节偏移，包含在分片中。 */
  readonly start: number;
  /** 结束字节偏移，不包含在分片中。 */
  readonly endExclusive: number;
  /** 当前分片字节数。 */
  readonly length: number;
}

/**
 * 将常见 bit/Byte 单位别名规范化。
 *
 * 前缀大小写不敏感，但末尾 `b`/`B` 严格区分 bit 与 Byte。例如 `mb`、
 * `Mbit` 规范为 `Mbit`，`MB`、`MByte` 规范为 `MB`。
 */
export function normalizeByteSizeUnit(unit: string): ByteSizeUnit | undefined {
  const normalized = unit.trim();
  if (normalized === "b" || /^bits?$/iu.test(normalized)) {
    return "bit";
  }
  if (normalized === "B" || /^bytes?$/iu.test(normalized)) {
    return "B";
  }

  const shortMatch = /^([kmgtpe](?:i)?)([bB])$/iu.exec(normalized);
  if (shortMatch) {
    const [, rawPrefix = "", symbol = ""] = shortMatch;
    return createCanonicalUnit(rawPrefix, symbol === "B" ? "byte" : "bit");
  }

  const longMatch = /^([kmgtpe](?:i)?)(bits?|bytes?)$/iu.exec(normalized);
  if (longMatch) {
    const [, rawPrefix = "", rawQuantity = ""] = longMatch;
    const quantity = rawQuantity.toLowerCase().startsWith("byte") ? "byte" : "bit";
    return createCanonicalUnit(rawPrefix, quantity);
  }

  return undefined;
}

/**
 * 解析普通数值的 bit/Byte 大小。
 *
 * 支持小数和科学计数法，例如 `"1.5 MiB"`、`"8e3 bit"`。负数、无穷值、
 * 缺少单位、换算溢出或单位非法时返回 `undefined`。超过安全整数范围且要求精确
 * 表示时，应改用 `parseByteSizeExact`。
 */
export function parseByteSize(input: string): ParsedByteSize | undefined {
  const match = BYTE_SIZE_PATTERN.exec(input);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const unit = normalizeByteSizeUnit(match[2] ?? "");
  if (!Number.isFinite(value) || value < 0 || unit === undefined) {
    return undefined;
  }

  const bits = value * getNumberBitFactor(unit);
  if (!Number.isFinite(bits)) {
    return undefined;
  }

  return { bits, bytes: bits / BITS_PER_BYTE, unit, value };
}

/**
 * 将整数字符串精确解析为任意精度字节大小。
 *
 * 只接受非负十进制整数，不接受小数或科学计数法。若输入最终不足一个完整 Byte，
 * 例如 `"1 bit"`，返回 `undefined`，避免静默截断。
 *
 * 超过 maxDigits 时返回 `undefined`。
 *
 * @example
 * parseByteSizeExact("9007199254740993 B");
 * // { value: 9007199254740993n, unit: "B", bits: 72057594037927944n, bytes: 9007199254740993n }
 *
 * @throws {RangeError} maxDigits 不是正安全整数。
 */
export function parseByteSizeExact(
  input: string,
  options: ParseByteSizeExactOptions = {},
): ParsedExactByteSize | undefined {
  const { maxDigits = DEFAULT_MAX_EXACT_DIGITS } = options;
  assertPositiveSafeInteger(maxDigits, "maxDigits");
  const match = EXACT_BYTE_SIZE_PATTERN.exec(input);
  if (!match) {
    return undefined;
  }

  const integerText = match[1] ?? "";
  if (integerText.length > maxDigits) {
    return undefined;
  }
  const unit = normalizeByteSizeUnit(match[2] ?? "");
  if (unit === undefined) {
    return undefined;
  }

  const value = BigInt(integerText);
  const bits = value * getBigIntBitFactor(unit);
  if (bits % BIGINT_BITS_PER_BYTE !== 0n) {
    return undefined;
  }

  return { bits, bytes: bits / BIGINT_BITS_PER_BYTE, unit, value };
}

/**
 * 在 bit/Byte 单位之间转换。`number` 输入返回 `number`，`bigint` 输入返回 `bigint`。
 *
 * bigint 转换若产生小数会抛出异常，不会执行截断。例如 1 bit 无法精确转换为 Byte。
 *
 * @example
 * convertByteSize(1, "MiB", "B"); // 1048576
 * convertByteSize(8n, "bit", "B"); // 1n
 *
 * @throws {RangeError} 数值为负、不是有限值、单位非法、结果溢出或 bigint 结果不为整数。
 */
export function convertByteSize(
  value: number,
  fromUnit: ByteSizeUnit,
  toUnit: ByteSizeUnit,
): number;
export function convertByteSize(
  value: bigint,
  fromUnit: ByteSizeUnit,
  toUnit: ByteSizeUnit,
): bigint;
export function convertByteSize(
  value: number | bigint,
  fromUnit: ByteSizeUnit,
  toUnit: ByteSizeUnit,
): number | bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new RangeError("value must be non-negative");
    }

    const numerator = value * getBigIntBitFactor(fromUnit);
    const denominator = getBigIntBitFactor(toUnit);
    if (numerator % denominator !== 0n) {
      throw new RangeError("bigint conversion would produce a fractional result");
    }
    return numerator / denominator;
  }

  assertNonNegativeFiniteNumber(value, "value");
  // 使用倍率之比，避免相同大单位转换时产生无意义的中间溢出。
  const factor = getNumberBitFactor(fromUnit) / getNumberBitFactor(toUnit);
  const result = value * factor;
  if (!Number.isFinite(result)) {
    throw new RangeError("converted byte size exceeds the finite number range");
  }
  return normalizeNegativeZero(result);
}

/** 将大小转换为 Byte；bigint 输入不足整字节时抛出 `RangeError`。 */
export function toBytes(value: number, unit: ByteSizeUnit): number;
export function toBytes(value: bigint, unit: ByteSizeUnit): bigint;
export function toBytes(value: number | bigint, unit: ByteSizeUnit): number | bigint {
  return typeof value === "bigint"
    ? convertByteSize(value, unit, "B")
    : convertByteSize(value, unit, "B");
}

/** 将大小转换为 bit。 */
export function toBits(value: number, unit: ByteSizeUnit): number;
export function toBits(value: bigint, unit: ByteSizeUnit): bigint;
export function toBits(value: number | bigint, unit: ByteSizeUnit): number | bigint {
  return typeof value === "bigint"
    ? convertByteSize(value, unit, "bit")
    : convertByteSize(value, unit, "bit");
}

/**
 * 自动选择易读单位并格式化 bit/Byte 大小。
 *
 * 同时支持 number 和任意大小的 bigint。bigint 路径使用整数运算完成缩放与四舍五入，
 * 不会为格式化而转换成 number。零值始终使用基础单位。
 *
 * @example
 * formatByteSize(1536); // "1.5 KiB"
 * formatByteSize(1_000_000, { unitSystem: "si" }); // "1 MB"
 * formatByteSize(9007199254740993n); // "8 PiB"
 *
 * @throws {RangeError} 数值、单位、精度或配置非法。
 */
export function formatByteSize(
  value: number | bigint,
  options: FormatByteSizeOptions = {},
): string {
  const {
    inputUnit = "B",
    locale = "en-US",
    precision = 2,
    quantity = "byte",
    space = true,
    trimTrailingZeros = true,
    unitSystem = "iec",
    useGrouping = true,
  } = options;
  assertFormatPrecision(precision);
  assertFormatOptions(quantity, unitSystem);
  const inputFactor = getBigIntBitFactor(inputUnit);

  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new RangeError("value must be non-negative");
    }
    const bits = value * inputFactor;
    return formatBigIntBits(bits, {
      locale,
      precision,
      quantity,
      space,
      trimTrailingZeros,
      unitSystem,
      useGrouping,
    });
  }

  assertNonNegativeFiniteNumber(value, "value");
  const bits = value * Number(inputFactor);
  if (!Number.isFinite(bits)) {
    throw new RangeError("byte size exceeds the finite number range");
  }
  return formatNumberBits(normalizeNegativeZero(bits), {
    locale,
    precision,
    quantity,
    space,
    trimTrailingZeros,
    unitSystem,
    useGrouping,
  });
}

/**
 * 计算总字节数需要的分片数量。
 *
 * @throws {RangeError} totalBytes 不是非负安全整数，或 chunkSize 不是正安全整数。
 */
export function calculateByteChunkCount(totalBytes: number, chunkSize: number): number {
  assertNonNegativeSafeInteger(totalBytes, "totalBytes");
  assertPositiveSafeInteger(chunkSize, "chunkSize");
  return Math.ceil(totalBytes / chunkSize);
}

/**
 * 惰性生成字节分片范围，适用于分片上传、下载和流式处理。
 *
 * 惰性迭代不会一次性分配全部范围；空数据不产生任何分片。范围采用左闭右开语义，
 * 可直接传给 `Blob.slice(start, endExclusive)`。
 *
 * @example
 * [...iterateByteRanges(10, 4)];
 * // [{ index: 0, start: 0, endExclusive: 4, length: 4 }, ...]
 *
 * @throws {RangeError} totalBytes 不是非负安全整数，或 chunkSize 不是正安全整数。
 */
export function* iterateByteRanges(
  totalBytes: number,
  chunkSize: number,
): Generator<ByteRange, void, undefined> {
  assertNonNegativeSafeInteger(totalBytes, "totalBytes");
  assertPositiveSafeInteger(chunkSize, "chunkSize");

  let index = 0;
  for (let start = 0; start < totalBytes; start += chunkSize) {
    const endExclusive = Math.min(start + chunkSize, totalBytes);
    yield { endExclusive, index, length: endExclusive - start, start };
    index += 1;
  }
}

interface ResolvedFormatOptions {
  readonly locale: Intl.LocalesArgument;
  readonly precision: number;
  readonly quantity: ByteQuantity;
  readonly space: boolean;
  readonly trimTrailingZeros: boolean;
  readonly unitSystem: ByteUnitSystem;
  readonly useGrouping: boolean;
}

const BYTE_SIZE_PATTERN = /^\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([^\s]+)\s*$/iu;
const EXACT_BYTE_SIZE_PATTERN = /^\s*\+?(\d+)\s*([^\s]+)\s*$/u;
const BITS_PER_BYTE = 8;
const BIGINT_BITS_PER_BYTE = 8n;
const SI_BASE = 1000;
const IEC_BASE = 1024;
const MAX_PREFIX_INDEX = 6;
const MAX_FORMAT_PRECISION = 20;
const DEFAULT_MAX_EXACT_DIGITS = 10_000;
const DECIMAL_PREFIXES = ["", "K", "M", "G", "T", "P", "E"] as const;
const BINARY_PREFIXES = ["", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei"] as const;

function getNumberBitFactor(unit: ByteSizeUnit): number {
  return Number(getBigIntBitFactor(unit));
}

function getBigIntBitFactor(unit: ByteSizeUnit): bigint {
  const metadata = parseCanonicalUnit(unit);
  if (!metadata) {
    throw new RangeError(`unsupported byte size unit: ${String(unit)}`);
  }

  const base = metadata.unitSystem === "iec" ? BigInt(IEC_BASE) : BigInt(SI_BASE);
  const quantityFactor = metadata.quantity === "byte" ? BIGINT_BITS_PER_BYTE : 1n;
  return base ** BigInt(metadata.prefixIndex) * quantityFactor;
}

function parseCanonicalUnit(unit: string):
  | {
      readonly prefixIndex: number;
      readonly quantity: ByteQuantity;
      readonly unitSystem: ByteUnitSystem;
    }
  | undefined {
  if (unit === "bit") {
    return { prefixIndex: 0, quantity: "bit", unitSystem: "si" };
  }
  if (unit === "B") {
    return { prefixIndex: 0, quantity: "byte", unitSystem: "si" };
  }

  const match = /^([KMGTPE](?:i)?)(bit|B)$/u.exec(unit);
  if (!match) {
    return undefined;
  }

  const prefix = match[1] ?? "";
  const prefixIndex = DECIMAL_PREFIXES.indexOf(
    (prefix[0] ?? "") as (typeof DECIMAL_PREFIXES)[number],
  );
  if (prefixIndex <= 0) {
    return undefined;
  }

  return {
    prefixIndex,
    quantity: match[2] === "B" ? "byte" : "bit",
    unitSystem: prefix.endsWith("i") ? "iec" : "si",
  };
}

function createCanonicalUnit(rawPrefix: string, quantity: ByteQuantity): ByteSizeUnit | undefined {
  const normalizedPrefix = rawPrefix.toLowerCase();
  const binary = normalizedPrefix.endsWith("i");
  const symbol = normalizedPrefix[0]?.toUpperCase();
  const prefixIndex = DECIMAL_PREFIXES.indexOf(symbol as (typeof DECIMAL_PREFIXES)[number]);
  if (prefixIndex <= 0) {
    return undefined;
  }

  const prefix = binary ? BINARY_PREFIXES[prefixIndex] : DECIMAL_PREFIXES[prefixIndex];
  return `${prefix}${quantity === "byte" ? "B" : "bit"}` as ByteSizeUnit;
}

function formatNumberBits(bits: number, options: ResolvedFormatOptions): string {
  const base = options.unitSystem === "si" ? SI_BASE : IEC_BASE;
  const baseValue = options.quantity === "byte" ? bits / BITS_PER_BYTE : bits;
  let prefixIndex = selectNumberPrefixIndex(baseValue, base);
  let scaledValue = baseValue / base ** prefixIndex;
  // 当前单位在展示精度下进位到一个完整 base 时，提升到下一单位，避免出现
  // “1024 KiB”或“1000 KB”这类边界输出。
  if (prefixIndex < MAX_PREFIX_INDEX && Number(scaledValue.toFixed(options.precision)) >= base) {
    prefixIndex += 1;
    scaledValue = baseValue / base ** prefixIndex;
  }
  const unit = createOutputUnit(prefixIndex, options.quantity, options.unitSystem);
  const formatted = new Intl.NumberFormat(options.locale, {
    maximumFractionDigits: options.precision,
    minimumFractionDigits: options.trimTrailingZeros ? 0 : options.precision,
    useGrouping: options.useGrouping,
  }).format(scaledValue);
  return `${formatted}${options.space ? " " : ""}${unit}`;
}

function formatBigIntBits(bits: bigint, options: ResolvedFormatOptions): string {
  const base = BigInt(options.unitSystem === "si" ? SI_BASE : IEC_BASE);
  const baseFactor = options.quantity === "byte" ? BIGINT_BITS_PER_BYTE : 1n;
  let prefixIndex = selectBigIntPrefixIndex(bits, base, baseFactor);
  const decimalFactor = 10n ** BigInt(options.precision);
  let unitFactor = base ** BigInt(prefixIndex) * baseFactor;
  // 整数除法前增加半个分母，实现非负数的 half-up 四舍五入。
  let scaledInteger = (bits * decimalFactor + unitFactor / 2n) / unitFactor;
  if (prefixIndex < MAX_PREFIX_INDEX && scaledInteger >= base * decimalFactor) {
    prefixIndex += 1;
    unitFactor = base ** BigInt(prefixIndex) * baseFactor;
    scaledInteger = (bits * decimalFactor + unitFactor / 2n) / unitFactor;
  }
  const integerPart = scaledInteger / decimalFactor;
  let fractionalPart =
    options.precision === 0
      ? ""
      : (scaledInteger % decimalFactor).toString().padStart(options.precision, "0");

  if (options.trimTrailingZeros) {
    fractionalPart = fractionalPart.replace(/0+$/u, "");
  }

  const integerFormatter = new Intl.NumberFormat(options.locale, {
    maximumFractionDigits: 0,
    useGrouping: options.useGrouping,
  });
  const formattedInteger = integerFormatter.format(integerPart);
  const formattedFraction = localizeDigits(fractionalPart, options.locale);
  const decimalSeparator =
    fractionalPart.length === 0
      ? ""
      : (new Intl.NumberFormat(options.locale)
          .formatToParts(1.1)
          .find(({ type }) => type === "decimal")?.value ?? ".");
  const unit = createOutputUnit(prefixIndex, options.quantity, options.unitSystem);
  return `${formattedInteger}${decimalSeparator}${formattedFraction}${options.space ? " " : ""}${unit}`;
}

function localizeDigits(value: string, locale: Intl.LocalesArgument): string {
  if (value.length === 0) {
    return "";
  }

  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const digits = Array.from({ length: 10 }, (_, digit) => formatter.format(digit));
  return value.replace(/\d/gu, (digit) => digits[Number(digit)] ?? digit);
}

function createOutputUnit(
  prefixIndex: number,
  quantity: ByteQuantity,
  unitSystem: ByteUnitSystem,
): ByteSizeUnit {
  if (prefixIndex === 0) {
    return quantity === "byte" ? "B" : "bit";
  }

  const prefix =
    unitSystem === "iec" ? BINARY_PREFIXES[prefixIndex] : DECIMAL_PREFIXES[prefixIndex];
  return `${prefix}${quantity === "byte" ? "B" : "bit"}` as ByteSizeUnit;
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

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertFormatPrecision(precision: number): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_FORMAT_PRECISION) {
    throw new RangeError(`precision must be an integer between 0 and ${MAX_FORMAT_PRECISION}`);
  }
}

function assertFormatOptions(quantity: ByteQuantity, unitSystem: ByteUnitSystem): void {
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

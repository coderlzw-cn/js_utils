/**
 * 字符串相关的跨运行时纯函数工具。
 */

export interface NormalizeWhitespaceOptions {
  /** 是否保留换行。默认为 `false`。 */
  preserveNewlines?: boolean;
  /** 是否移除首尾空白。默认为 `true`。 */
  trim?: boolean;
}

export interface MaskStringOptions {
  /** 保留开头的字素数量。默认为 `0`。 */
  visibleStart?: number;
  /** 保留结尾的字素数量。默认为 `0`。 */
  visibleEnd?: number;
  /** 用于遮罩的字符或字符串。默认为 `*`。 */
  mask?: string;
  /** 是否使每个被遮罩字素都对应一个遮罩。默认为 `true`。 */
  preserveLength?: boolean;
}

export interface WordCaseOptions {
  /** 大小写转换所使用的区域设置。 */
  locales?: Intl.LocalesArgument;
}

/** 字符串字段验证配置。 */
export interface StringValidationOptions {
  /** 是否禁止空字符串和仅包含 Unicode 空白的字符串。默认为 `false`。 */
  readonly nonBlank?: boolean;
  /** 最少字素数量，emoji 和组合字符按一个用户可感知字符计算。 */
  readonly minimumLength?: number;
  /** 最多字素数量，emoji 和组合字符按一个用户可感知字符计算。 */
  readonly maximumLength?: number;
  /** 字符串必须匹配的正则表达式。 */
  readonly pattern?: RegExp;
  /** 计算长度和匹配正则前是否移除首尾空白。默认为 `false`。 */
  readonly trim?: boolean;
}

const HTML_ESCAPE_LOOKUP: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 判断值是否为空字符串或仅包含 Unicode 空白。 */
export function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

/** 判断未知值是否为字符串，并提供 TypeScript 类型收窄。 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * 按规则验证未知值是否为合格的字符串。
 *
 * 长度按用户可感知字符计算，不会把一个 emoji 或组合音标拆成多个字符。配置非法时
 * 抛出 `RangeError`，字段值不符合规则时返回 `false`。
 */
export function isValidString(
  value: unknown,
  options: StringValidationOptions = {},
): value is string {
  const resolvedOptions = resolveStringValidationOptions(options);
  return typeof value === "string" && matchesStringValidation(value, resolvedOptions);
}

/**
 * 断言未知字段是符合规则的字符串，并将其类型收窄为 `string`。
 *
 * 非字符串值抛出 `TypeError`，不符合空白、长度或正则规则时抛出 `RangeError`。
 *
 * @example
 * assertString(payload.username, { nonBlank: true, maximumLength: 32 }, "username");
 */
export function assertString(
  value: unknown,
  options: StringValidationOptions = {},
  fieldName = "value",
): asserts value is string {
  const resolvedOptions = resolveStringValidationOptions(options);

  if (typeof value !== "string") {
    throw new TypeError(`${fieldName} must be a string`);
  }

  if (!matchesStringValidation(value, resolvedOptions)) {
    throw new RangeError(describeStringRequirement(fieldName, resolvedOptions));
  }
}

/**
 * 合并重复空白。保留换行时，会同时规范 CRLF 和每行两侧的水平空白。
 */
export function normalizeWhitespace(
  value: string,
  options: NormalizeWhitespaceOptions = {},
): string {
  const { preserveNewlines = false, trim = true } = options;

  if (!preserveNewlines) {
    const normalized = value.replace(/\s+/gu, " ");
    return trim ? normalized.trim() : normalized;
  }

  let normalized = value
    .replace(/\r\n?/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n");

  if (trim) {
    normalized = normalized.trim();
  }

  return normalized;
}

/** 将首个用户可感知字符转为大写。 */
export function capitalize(value: string, locales?: Intl.LocalesArgument): string {
  const [first = "", ...rest] = splitGraphemes(value, locales);
  return first.toLocaleUpperCase(locales) + rest.join("");
}

/** 将首个用户可感知字符转为小写。 */
export function uncapitalize(value: string, locales?: Intl.LocalesArgument): string {
  const [first = "", ...rest] = splitGraphemes(value, locales);
  return first.toLocaleLowerCase(locales) + rest.join("");
}

/**
 * 按用户可感知字符截断文本，不会拆分 emoji、组合音标等字素簇。
 * `maxLength` 包含省略标记的长度。
 */
export function truncate(value: string, maxLength: number, suffix = "…"): string {
  assertNonNegativeInteger(maxLength, "maxLength");

  const characters = splitGraphemes(value);
  if (characters.length <= maxLength) {
    return value;
  }

  const suffixCharacters = splitGraphemes(suffix);
  if (suffixCharacters.length >= maxLength) {
    return suffixCharacters.slice(0, maxLength).join("");
  }

  return characters.slice(0, maxLength - suffixCharacters.length).join("") + suffix;
}

/** 从中间截断文本，适用于文件名、ID 和路径展示。 */
export function truncateMiddle(value: string, maxLength: number, separator = "…"): string {
  assertNonNegativeInteger(maxLength, "maxLength");

  const characters = splitGraphemes(value);
  if (characters.length <= maxLength) {
    return value;
  }

  const separatorCharacters = splitGraphemes(separator);
  if (separatorCharacters.length >= maxLength) {
    return separatorCharacters.slice(0, maxLength).join("");
  }

  const availableLength = maxLength - separatorCharacters.length;
  const startLength = Math.ceil(availableLength / 2);
  const endLength = Math.floor(availableLength / 2);
  const start = characters.slice(0, startLength).join("");
  const end = endLength === 0 ? "" : characters.slice(-endLength).join("");
  return start + separator + end;
}

/** 将文本拆分为单词，可识别空白、标点、camelCase 和连续大写缩写。 */
export function words(value: string): string[] {
  return value
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

/** 转换为 camelCase。 */
export function toCamelCase(value: string, options: WordCaseOptions = {}): string {
  const [first, ...rest] = normalizedWords(value, options.locales);
  if (first === undefined) {
    return "";
  }

  return first + rest.map((word) => capitalize(word, options.locales)).join("");
}

/** 转换为 PascalCase。 */
export function toPascalCase(value: string, options: WordCaseOptions = {}): string {
  return normalizedWords(value, options.locales)
    .map((word) => capitalize(word, options.locales))
    .join("");
}

/** 转换为 kebab-case。 */
export function toKebabCase(value: string, options: WordCaseOptions = {}): string {
  return normalizedWords(value, options.locales).join("-");
}

/** 转换为 snake_case。 */
export function toSnakeCase(value: string, options: WordCaseOptions = {}): string {
  return normalizedWords(value, options.locales).join("_");
}

/** 转义 HTML 文本节点中具有特殊意义的字符。 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => HTML_ESCAPE_LOOKUP[character] ?? character);
}

/** 转义正则表达式元字符，使输入可安全嵌入 `RegExp` 模式。 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** 使用 Unicode NFD 分解移除拉丁文字母等字符的组合音标。 */
export function removeDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
}

/** 对敏感文本进行脱敏，长度计算同样遵循字素簇边界。 */
export function maskString(value: string, options: MaskStringOptions = {}): string {
  const { visibleStart = 0, visibleEnd = 0, mask = "*", preserveLength = true } = options;

  assertNonNegativeInteger(visibleStart, "visibleStart");
  assertNonNegativeInteger(visibleEnd, "visibleEnd");
  if (mask.length === 0) {
    throw new RangeError("mask must not be empty");
  }

  const characters = splitGraphemes(value);
  const hiddenLength = Math.max(0, characters.length - visibleStart - visibleEnd);
  if (hiddenLength === 0) {
    return value;
  }

  const start = characters.slice(0, visibleStart).join("");
  const end = visibleEnd === 0 ? "" : characters.slice(-visibleEnd).join("");
  return start + mask.repeat(preserveLength ? hiddenLength : 1) + end;
}

function normalizedWords(value: string, locales?: Intl.LocalesArgument): string[] {
  return words(value).map((word) => word.toLocaleLowerCase(locales));
}

interface ResolvedStringValidationOptions {
  readonly nonBlank: boolean;
  readonly minimumLength: number;
  readonly maximumLength: number;
  readonly pattern: RegExp | undefined;
  readonly trim: boolean;
}

function resolveStringValidationOptions(
  options: StringValidationOptions,
): ResolvedStringValidationOptions {
  const {
    nonBlank = false,
    minimumLength = 0,
    maximumLength = Infinity,
    pattern,
    trim = false,
  } = options;

  if (!Number.isSafeInteger(minimumLength) || minimumLength < 0) {
    throw new RangeError("minimumLength must be a non-negative safe integer");
  }
  if (
    maximumLength !== Infinity &&
    (!Number.isSafeInteger(maximumLength) || maximumLength < minimumLength)
  ) {
    throw new RangeError(
      "maximumLength must be Infinity or a safe integer greater than or equal to minimumLength",
    );
  }

  return { nonBlank, minimumLength, maximumLength, pattern, trim };
}

function matchesStringValidation(value: string, options: ResolvedStringValidationOptions): boolean {
  const normalized = options.trim ? value.trim() : value;
  if (options.nonBlank && normalized.trim().length === 0) {
    return false;
  }

  const length = splitGraphemes(normalized).length;
  if (length < options.minimumLength || length > options.maximumLength) {
    return false;
  }

  // 使用新的 RegExp 实例，避免全局或 sticky 表达式的 lastIndex 污染重复校验结果。
  return options.pattern === undefined
    ? true
    : new RegExp(options.pattern.source, options.pattern.flags).test(normalized);
}

function describeStringRequirement(
  fieldName: string,
  options: ResolvedStringValidationOptions,
): string {
  const requirements: string[] = [];
  if (options.nonBlank) {
    requirements.push("non-blank");
  }
  if (options.minimumLength > 0) {
    requirements.push(`at least ${options.minimumLength} characters long`);
  }
  if (options.maximumLength !== Infinity) {
    requirements.push(`at most ${options.maximumLength} characters long`);
  }
  if (options.pattern) {
    requirements.push(`matching ${options.pattern}`);
  }

  return `${fieldName} must be ${requirements.join(" and ") || "a valid string"}`;
}

/**
 * Intl.Segmenter 在现代运行时中用于正确处理字素簇；降级时至少保证不拆分代理对。
 */
function splitGraphemes(value: string, locales?: Intl.LocalesArgument): string[] {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locales, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }

  return Array.from(value);
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

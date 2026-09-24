/** Base64 使用的字符表。 */
export type Base64Alphabet = "standard" | "url";

/** Base64 解码时接受的字符表。 */
export type Base64DecodeAlphabet = Base64Alphabet | "auto";

/** 可直接编码的二进制输入。 */
export type Base64BinaryInput = ArrayBuffer | ArrayBufferView;

/** Base64 编码配置。 */
export interface EncodeBase64Options {
  /**
   * 输出标准 Base64 或 URL 安全的 Base64URL。
   * @default "standard"
   */
  readonly alphabet?: Base64Alphabet;
  /**
   * 是否保留末尾的 `=` 填充。Base64 默认保留，Base64URL 默认省略。
   */
  readonly padding?: boolean;
}

/** Base64 解码和校验配置。 */
export interface DecodeBase64Options {
  /**
   * 接受的字符表。`auto` 会自动识别，但仍会拒绝混用 `+/` 与 `-_`。
   *
   * @default "auto"
   */
  readonly alphabet?: Base64DecodeAlphabet;
  /**
   * 是否允许输入中包含 ASCII 空白。默认拒绝，避免配置或协议字段被悄悄修改。
   *
   * @default false
   */
  readonly allowWhitespace?: boolean;
  /**
   * 是否允许解码空字符串。
   *
   * @default true
   */
  readonly allowEmpty?: boolean;
  /**
   * 是否允许输入包含规范的 `=` 填充。
   *
   * @default true
   */
  readonly allowPadding?: boolean;
  /**
   * 是否要求输入包含规范的 `=` 填充。启用后，无填充输入长度必须已经是 4 的倍数。
   *
   * @default false
   */
  readonly requirePadding?: boolean;
  /**
   * 允许解码的最大字节数，用于限制不可信输入的内存消耗。默认不限制。
   */
  readonly maxDecodedBytes?: number;
  /** 可选的字段或数据名称，用于为解码错误补充上下文。 */
  readonly fieldName?: string;
}

/** UTF-8 Base64 解码配置。 */
export interface DecodeBase64TextOptions extends DecodeBase64Options {
  /**
   * 是否在遇到非法 UTF-8 字节时抛出异常。关闭时使用替换字符 `�`。
   *
   * @default true
   */
  readonly fatal?: boolean;
}

/** Base64 规范化配置。 */
export interface NormalizeBase64Options extends Omit<DecodeBase64Options, "alphabet"> {
  /** 输入使用的字符表。默认为自动识别。 */
  readonly inputAlphabet?: Base64DecodeAlphabet;
  /** 输出使用的字符表。默认为保留自动识别到的形式。 */
  readonly outputAlphabet?: Base64Alphabet;
  /** 是否保留输出末尾的 `=` 填充。默认遵循输出字符表的惯例。 */
  readonly padding?: boolean;
}

/** Base64URL 编码配置；字符表固定为 URL 安全形式。 */
export type EncodeBase64UrlOptions = Omit<EncodeBase64Options, "alphabet">;

/** Base64URL 解码配置；字符表固定为 URL 安全形式。 */
export type DecodeBase64UrlOptions = Omit<DecodeBase64Options, "alphabet">;

/** Base64URL UTF-8 解码配置；字符表固定为 URL 安全形式。 */
export type DecodeBase64UrlTextOptions = Omit<DecodeBase64TextOptions, "alphabet">;

/** 严格无填充 Base64URL 解码配置；填充策略由快捷方法固定。 */
export type DecodeUnpaddedBase64UrlOptions = Omit<DecodeBase64UrlOptions, "allowPadding" | "requirePadding">;

/** 严格无填充 Base64URL UTF-8 解码配置。 */
export type DecodeUnpaddedBase64UrlTextOptions = Omit<DecodeBase64UrlTextOptions, "allowPadding" | "requirePadding">;

const STANDARD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ASCII_WHITESPACE_PATTERN = /[\t\n\f\r ]/gu;
const ASCII_WHITESPACE_CHARACTER_PATTERN = /[\t\n\f\r ]/u;
const STANDARD_SYMBOL_PATTERN = /[+/]/u;
const URL_SYMBOL_PATTERN = /[-_]/u;

/**
 * 将二进制数据编码为 Base64 或 Base64URL。
 * ArrayBufferView 只编码视图覆盖的字节范围，不会意外包含底层缓冲区的其他数据。
 */
export function encodeBase64(input: Base64BinaryInput, options: EncodeBase64Options = {}) {
  const { alphabet = "standard", padding = alphabet === "standard" } = options;
  assertEncodeOptions(alphabet, padding);
  const bytes = toUint8Array(input);
  const characters = alphabet === "url" ? URL_ALPHABET : STANDARD_ALPHABET;
  const parts: string[] = [];

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const combined = (first << 16) | (second << 8) | third;
    const remaining = bytes.length - index;

    parts.push(characters[(combined >>> 18) & 0x3f] ?? "", characters[(combined >>> 12) & 0x3f] ?? "");

    if (remaining > 1) {
      parts.push(characters[(combined >>> 6) & 0x3f] ?? "");
    } else if (padding) {
      parts.push("=");
    }

    if (remaining > 2) {
      parts.push(characters[combined & 0x3f] ?? "");
    } else if (padding) {
      parts.push("=");
    }
  }

  return parts.join("");
}

/** 将 UTF-8 文本编码为 Base64 或 Base64URL。 */
export function encodeBase64Text(text: string, options: EncodeBase64Options = {}) {
  if (typeof text !== "string") {
    throw new TypeError("text must be a string");
  }
  return encodeBase64(new TextEncoder().encode(text), options);
}

/** 编码为 Base64URL；默认省略末尾的 `=` 填充。 */
export function encodeBase64Url(input: Base64BinaryInput, options: EncodeBase64UrlOptions = {}) {
  return encodeBase64(input, { ...options, alphabet: "url" });
}

/** 将 UTF-8 文本编码为 Base64URL；默认省略末尾的 `=` 填充。 */
export function encodeBase64UrlText(text: string, options: EncodeBase64UrlOptions = {}) {
  return encodeBase64Text(text, { ...options, alphabet: "url" });
}

/**
 * 严格解码 Base64 或 Base64URL 为独立的 Uint8Array。
 *
 * 会拒绝非法字符、错误填充、混用字符表和非零尾部填充位。`maxDecodedBytes` 可防止
 * 对不可信大输入进行超额内存分配。
 *
 * @throws {SyntaxError} 输入不是规范的 Base64/Base64URL。
 * @throws {RangeError} 配置非法或解码结果超过大小限制。
 */
export function decodeBase64(input: string, options: DecodeBase64Options = {}) {
  const parsed = (() => {
    try {
      return parseBase64(input, options);
    } catch (error) {
      throw addFieldContext(error, options.fieldName);
    }
  })();
  const output = new Uint8Array(parsed.decodedLength);
  let outputIndex = 0;

  for (let index = 0; index < parsed.content.length; index += 4) {
    const first = decodeCharacter(parsed.content[index] ?? "", parsed.alphabet);
    const second = decodeCharacter(parsed.content[index + 1] ?? "", parsed.alphabet);
    const thirdCharacter = parsed.content[index + 2];
    const fourthCharacter = parsed.content[index + 3];
    const third = thirdCharacter === undefined ? 0 : decodeCharacter(thirdCharacter, parsed.alphabet);
    const fourth = fourthCharacter === undefined ? 0 : decodeCharacter(fourthCharacter, parsed.alphabet);
    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;

    output[outputIndex] = (combined >>> 16) & 0xff;
    outputIndex += 1;
    if (outputIndex < output.length) {
      output[outputIndex] = (combined >>> 8) & 0xff;
      outputIndex += 1;
    }
    if (outputIndex < output.length) {
      output[outputIndex] = combined & 0xff;
      outputIndex += 1;
    }
  }

  return output;
}

/**
 * 将 Base64 或 Base64URL 解码为 UTF-8 文本。
 *
 * 默认拒绝非法 UTF-8，防止损坏数据被静默替换；可设置 `fatal: false` 获得
 * TextDecoder 的宽松替换行为。
 */
export function decodeBase64Text(input: string, options: DecodeBase64TextOptions = {}) {
  const { fatal = true, ...decodeOptions } = options;
  if (typeof fatal !== "boolean") {
    throw new TypeError("fatal must be a boolean");
  }
  const bytes = decodeBase64(input, decodeOptions);
  try {
    return new TextDecoder("utf-8", { fatal }).decode(bytes);
  } catch (error) {
    throw addFieldContext(error, options.fieldName);
  }
}

/** 解码 Base64URL，接受规范的有填充或无填充形式。 */
export function decodeBase64Url(input: string, options: DecodeBase64UrlOptions = {}) {
  return decodeBase64(input, { ...options, alphabet: "url" });
}

/** 解码严格无填充的 Base64URL，适用于 Go RawURLEncoding 等协议字段。 */
export function decodeUnpaddedBase64Url(input: string, options: DecodeUnpaddedBase64UrlOptions = {}) {
  return decodeBase64Url(input, {
    ...options,
    allowPadding: false,
    requirePadding: false,
  });
}

/** 将 Base64URL 解码为 UTF-8 文本。 */
export function decodeBase64UrlText(input: string, options: DecodeBase64UrlTextOptions = {}) {
  return decodeBase64Text(input, { ...options, alphabet: "url" });
}

/** 将严格无填充的 Base64URL 解码为 UTF-8 文本。 */
export function decodeUnpaddedBase64UrlText(input: string, options: DecodeUnpaddedBase64UrlTextOptions = {}) {
  return decodeBase64UrlText(input, {
    ...options,
    allowPadding: false,
    requirePadding: false,
  });
}

/** 判断字符串是否为符合指定规则的 Base64/Base64URL，不会因内容非法而抛出异常。 */
export function isValidBase64(input: string, options: DecodeBase64Options = {}) {
  try {
    parseBase64(input, options);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return false;
    }
    throw error;
  }
}

/** 判断字符串是否为符合指定规则的 Base64URL。 */
export function isValidBase64Url(input: string, options: DecodeBase64UrlOptions = {}) {
  return isValidBase64(input, { ...options, alphabet: "url" });
}

/** 判断字符串是否为严格无填充的 Base64URL。 */
export function isValidUnpaddedBase64Url(input: string, options: DecodeUnpaddedBase64UrlOptions = {}) {
  return isValidBase64Url(input, {
    ...options,
    allowPadding: false,
    requirePadding: false,
  });
}

/**
 * 将 Base64/Base64URL 转换为统一的字符表和填充形式。
 *
 * 转换前会进行完整校验，因此可安全地用于协议边界或持久化字段规范化。
 */
export function normalizeBase64(input: string, options: NormalizeBase64Options = {}) {
  const { inputAlphabet = "auto", outputAlphabet, allowWhitespace, allowEmpty, allowPadding, requirePadding, maxDecodedBytes, fieldName, padding } = options;
  const resolvedOutputAlphabet = outputAlphabet ?? (inputAlphabet === "auto" ? detectAlphabet(input) : inputAlphabet);
  const bytes = decodeBase64(input, {
    alphabet: inputAlphabet,
    ...(allowWhitespace === undefined ? {} : { allowWhitespace }),
    ...(allowEmpty === undefined ? {} : { allowEmpty }),
    ...(allowPadding === undefined ? {} : { allowPadding }),
    ...(requirePadding === undefined ? {} : { requirePadding }),
    ...(maxDecodedBytes === undefined ? {} : { maxDecodedBytes }),
    ...(fieldName === undefined ? {} : { fieldName }),
  });

  return encodeBase64(bytes, {
    alphabet: resolvedOutputAlphabet,
    ...(padding === undefined ? {} : { padding }),
  });
}

function parseBase64(input: string, options: DecodeBase64Options) {
  const { alphabet = "auto", allowWhitespace = false, allowEmpty = true, allowPadding = true, requirePadding = false, maxDecodedBytes = Infinity, fieldName } = options;
  assertDecodeOptions(alphabet, allowWhitespace, allowEmpty, allowPadding, requirePadding, maxDecodedBytes, fieldName);
  if (typeof input !== "string") {
    throw new TypeError("input must be a string");
  }

  if (!allowWhitespace && ASCII_WHITESPACE_CHARACTER_PATTERN.test(input)) {
    throw new SyntaxError("Base64 input must not contain whitespace");
  }

  const normalized = allowWhitespace ? input.replace(ASCII_WHITESPACE_PATTERN, "") : input;
  const resolvedAlphabet = resolveAlphabet(normalized, alphabet);
  const firstPaddingIndex = normalized.indexOf("=");
  const content = firstPaddingIndex === -1 ? normalized : normalized.slice(0, firstPaddingIndex);
  const paddingLength = firstPaddingIndex === -1 ? 0 : normalized.length - firstPaddingIndex;

  if (!allowEmpty && normalized.length === 0) {
    throw new SyntaxError("Base64 input must not be empty");
  }
  if (paddingLength > 2 || (firstPaddingIndex !== -1 && !/^=+$/u.test(normalized.slice(firstPaddingIndex)))) {
    throw new SyntaxError("Base64 input has invalid padding");
  }
  if (!allowPadding && paddingLength > 0) {
    throw new SyntaxError("Base64 input must not contain padding");
  }
  if (paddingLength > 0 && normalized.length % 4 !== 0) {
    throw new SyntaxError("Padded Base64 input length must be a multiple of 4");
  }
  if (requirePadding && paddingLength === 0 && content.length % 4 !== 0) {
    throw new SyntaxError("Base64 input requires padding");
  }

  const remainder = content.length % 4;
  if (remainder === 1) {
    throw new SyntaxError("Base64 input has an invalid length");
  }
  if ((paddingLength === 1 && remainder !== 3) || (paddingLength === 2 && remainder !== 2)) {
    throw new SyntaxError("Base64 input has inconsistent padding");
  }

  const decodedLength = Math.floor((content.length * 6) / 8);
  if (decodedLength > maxDecodedBytes) {
    throw new RangeError(`Decoded Base64 data exceeds the ${maxDecodedBytes} byte limit`);
  }

  for (const character of content) {
    decodeCharacter(character, resolvedAlphabet);
  }
  assertCanonicalTrailingBits(content, resolvedAlphabet);

  return { content, alphabet: resolvedAlphabet, decodedLength };
}

function resolveAlphabet(input: string, requestedAlphabet: Base64DecodeAlphabet) {
  const hasStandardSymbols = STANDARD_SYMBOL_PATTERN.test(input);
  const hasUrlSymbols = URL_SYMBOL_PATTERN.test(input);

  if (hasStandardSymbols && hasUrlSymbols) {
    throw new SyntaxError("Base64 input must not mix standard and URL-safe alphabets");
  }
  if (requestedAlphabet === "standard" && hasUrlSymbols) {
    throw new SyntaxError("Base64 input contains URL-safe characters");
  }
  if (requestedAlphabet === "url" && hasStandardSymbols) {
    throw new SyntaxError("Base64URL input contains standard Base64 characters");
  }

  return requestedAlphabet === "auto" ? (hasUrlSymbols ? "url" : "standard") : requestedAlphabet;
}

function detectAlphabet(input: string) {
  return URL_SYMBOL_PATTERN.test(input) ? "url" : "standard";
}

function decodeCharacter(character: string, alphabet: Base64Alphabet) {
  const value = (alphabet === "url" ? URL_ALPHABET : STANDARD_ALPHABET).indexOf(character);
  if (value === -1) {
    throw new SyntaxError(`Base64 input contains an invalid character: ${JSON.stringify(character)}`);
  }
  return value;
}

function assertCanonicalTrailingBits(content: string, alphabet: Base64Alphabet) {
  const remainder = content.length % 4;
  if (remainder === 0 || content.length === 0) {
    return;
  }

  const lastValue = decodeCharacter(content.at(-1) ?? "", alphabet);
  if ((remainder === 2 && (lastValue & 0x0f) !== 0) || (remainder === 3 && (lastValue & 0x03) !== 0)) {
    throw new SyntaxError("Base64 input has non-zero trailing padding bits");
  }
}

function toUint8Array(input: Base64BinaryInput) {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("input must be an ArrayBuffer or ArrayBufferView");
}

function assertEncodeOptions(alphabet: Base64Alphabet, padding: boolean) {
  if (alphabet !== "standard" && alphabet !== "url") {
    throw new RangeError('alphabet must be either "standard" or "url"');
  }
  if (typeof padding !== "boolean") {
    throw new TypeError("padding must be a boolean");
  }
}

function assertDecodeOptions(
  alphabet: Base64DecodeAlphabet,
  allowWhitespace: boolean,
  allowEmpty: boolean,
  allowPadding: boolean,
  requirePadding: boolean,
  maxDecodedBytes: number,
  fieldName: string | undefined,
) {
  if (alphabet !== "standard" && alphabet !== "url" && alphabet !== "auto") {
    throw new RangeError('alphabet must be "standard", "url", or "auto"');
  }
  for (const [name, value] of Object.entries({
    allowWhitespace,
    allowEmpty,
    allowPadding,
    requirePadding,
  })) {
    if (typeof value !== "boolean") {
      throw new TypeError(`${name} must be a boolean`);
    }
  }
  if (!allowPadding && requirePadding) {
    throw new RangeError("allowPadding and requirePadding cannot conflict");
  }
  if (maxDecodedBytes !== Infinity && (!Number.isSafeInteger(maxDecodedBytes) || maxDecodedBytes < 0)) {
    throw new RangeError("maxDecodedBytes must be Infinity or a non-negative safe integer");
  }
  if (fieldName !== undefined && (typeof fieldName !== "string" || fieldName.length === 0)) {
    throw new TypeError("fieldName must be a non-empty string");
  }
}

function addFieldContext(error: unknown, fieldName: string | undefined) {
  const resolvedError = error instanceof Error ? error : new Error(String(error));
  if (typeof fieldName !== "string" || fieldName.length === 0) {
    return resolvedError;
  }

  const message = `${fieldName}: ${resolvedError.message}`;
  if (resolvedError instanceof SyntaxError) {
    return new SyntaxError(message, { cause: resolvedError });
  }
  if (resolvedError instanceof RangeError) {
    return new RangeError(message, { cause: resolvedError });
  }
  if (resolvedError instanceof TypeError) {
    return new TypeError(message, { cause: resolvedError });
  }
  return new Error(message, { cause: resolvedError });
}

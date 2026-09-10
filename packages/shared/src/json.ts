import JSON5 from "json5";

export type JsonFormat = "json" | "json5";

/**
 * JSON 解析期间用于转换属性值的回调。
 *
 * 回调从最深层属性开始执行，最后处理根值；根值对应的 `key` 为空字符串。
 * 返回 `undefined` 会删除当前对象属性，数组中的对应位置则会变为空槽。
 */
export type JsonReviver = (this: unknown, key: string, value: unknown) => unknown;

/**
 * JSON 序列化期间用于转换属性值的回调。
 *
 * 根值会先以空字符串作为 `key` 调用一次。返回 `undefined` 时，对象属性会被忽略；
 * 在数组中则会被序列化为 `null`。
 */
export type JsonReplacer = (this: unknown, key: string, value: unknown) => unknown;

type JsonReplacerKeyList = readonly (string | number)[];

interface JsonParser {
  <T>(text: string, reviver?: JsonReviver): T;
}

// 原生 JSON.parse 的返回类型过于宽泛；在边界处按本工具公开的泛型契约收紧类型。
const parseStandardJson: JsonParser = JSON.parse;

/** JSON 解析配置。 */
export interface ParseJsonOptions {
  /**
   * 输入格式。默认使用 `json5`，同时兼容标准 JSON。
   *
   * @default "json5"
   */
  readonly format?: JsonFormat;
  /** 在返回解析结果前，自底向上转换每个属性值。 */
  readonly reviver?: JsonReviver;
  /**
   * 可选的字段或数据名称，用于为解析错误补充上下文。必须是非空字符串。配置后，语法错误会被包装为包含该名称的 `SyntaxError`。
   */
  readonly fieldName?: string;
}

/** JSON 序列化配置。 */
export interface StringifyJsonOptions {
  /* @default "json" */
  readonly format?: JsonFormat;
  /**
   * 控制输出属性或转换属性值。函数形式可转换每个值；字符串/数字数组形式仅保留同名对象属性。
   */
  readonly replacer?: JsonReplacer | readonly (string | number)[];
  /**
   * 缩进使用的空格数或字符串，行为与 `JSON.stringify` 一致。数字和字符串实际都最多使用 10 个空格或字符。
   */
  readonly space?: string | number;
  /**
   * 是否按字典序递归排列对象键。数组元素顺序不会改变。
   *
   * @default false
   */
  readonly sortKeys?: boolean;
  /**
   * 是否递归忽略对象中值为 `undefined` 或 `null` 的字段。仅影响对象属性；顶层值和数组元素仍遵循底层序列化器的标准行为。
   *
   * @default false
   */
  readonly omitNullish?: boolean;
}

/** 解析并重新输出 JSON 文本时使用的格式化配置。 */
export interface FormatJsonOptions {
  /** 输入文本的语法格式；默认为兼容范围更广的 `json5`。 */
  readonly inputFormat?: JsonFormat;
  /** 格式化后的语法格式；默认为标准 `json`。 */
  readonly outputFormat?: JsonFormat;
  /** 输出缩进；默认为 2 个空格。 */
  readonly space?: string | number;
  /** 是否按字典序递归排列每一层对象键；默认为 `false`。 */
  readonly sortKeys?: boolean;
}

/** JSON 解析成功后的结果。 */
export interface JsonParseSuccess<T> {
  readonly success: true;
  readonly data: T;
}

/** JSON 解析失败后的结果；原本抛出的值会被统一转换为 `Error`。 */
export interface JsonParseFailure {
  readonly success: false;
  readonly error: Error;
}

/** 可通过 `success` 判断成功或失败的 JSON 解析结果。 */
export type JsonParseResult<T> = JsonParseSuccess<T> | JsonParseFailure;

/**
 * 将标准 JSON 或 JSON5 文本解析为 JavaScript 值。
 *
 * 默认使用 JSON5，因此支持注释、尾逗号、单引号和未加引号的对象键。泛型仅用于
 * 描述调用方预期的结果类型，不会执行运行时校验；处理不可信数据时仍应校验结果。
 *
 * @template T 调用方预期的返回类型，默认为 `unknown`。
 * @param text 待解析的 JSON 或 JSON5 文本。
 * @param options 输入格式、值转换回调和错误上下文配置。
 * @returns 成功时返回 `{ success: true, data }`，失败时返回 `{ success: false, error }`。
 *
 * @example
 * parseJson<{ port: number }>("{ port: 3000, }");
 * // { success: true, data: { port: 3000 } }
 *
 * parseJson('{broken', { fieldName: '用户配置' });
 * // { success: false, error: SyntaxError('用户配置 不是有效的 JSON: ...') }
 */
export function parseJson<T = unknown>(
  text: string,
  options: ParseJsonOptions = {},
): JsonParseResult<T> {
  const { format = "json5", reviver, fieldName } = options;

  try {
    assertParseOptions(text, format, reviver, fieldName);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }

  try {
    const data =
      format === "json" ? parseStandardJson<T>(text, reviver) : JSON5.parse<T>(text, reviver);
    return { success: true, data };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      error:
        fieldName === undefined
          ? normalizedError
          : new SyntaxError(`${fieldName} 不是有效的 JSON: ${normalizedError.message}`, {
              cause: error,
            }),
    };
  }
}

/**
 * 将 JavaScript 值序列化为标准 JSON 或 JSON5 文本。
 *
 * 与原生 `JSON.stringify` 一样，顶层的 `undefined`、函数和 Symbol 可能得到
 * `undefined`，循环引用会抛出异常。`sortKeys` 只调整对象属性顺序，不会改变
 * 数组顺序；与属性白名单同时使用时，会先过滤属性再排序。启用
 * `omitNullish` 后会递归丢弃对象中的 `undefined` 和 `null` 字段，但不改变数组位置。
 *
 * @param value 待序列化的 JavaScript 值。
 * @param options 输出格式、属性转换、缩进和键排序配置。
 * @returns 序列化文本；顶层值无法表示为 JSON 时返回 `undefined`。
 * @throws {TypeError} 选项无效、存在循环引用或值无法序列化时抛出。
 * @throws {RangeError} `format` 或数值缩进无效时抛出。
 */
export function stringifyJson(value: unknown, options: StringifyJsonOptions = {}) {
  const { format = "json", replacer, space, sortKeys = false, omitNullish = false } = options;
  assertStringifyOptions(format, replacer, space, sortKeys, omitNullish);

  const effectiveReplacer = createReplacer(replacer, sortKeys, omitNullish);
  if (format === "json") {
    return isJsonReplacerKeyList(effectiveReplacer)
      ? JSON.stringify(value, [...effectiveReplacer], space)
      : JSON.stringify(value, effectiveReplacer, space);
  }

  return isJsonReplacerKeyList(effectiveReplacer)
    ? JSON5.stringify(value, [...effectiveReplacer], space)
    : JSON5.stringify(value, effectiveReplacer, space);
}

/**
 * 解析并重新格式化 JSON/JSON5 文本。
 *
 * 默认接受 JSON5 并输出缩进为 2 个空格的标准 JSON，可用于移除注释、尾逗号等
 * JSON5 特性。若解析结果无法序列化为文本，则抛出 `TypeError`。
 *
 * @param text 待格式化的 JSON 或 JSON5 文本。
 * @param options 输入/输出格式、缩进和键排序配置。
 * @returns 重新序列化后的 JSON 或 JSON5 文本。
 * @throws {SyntaxError} 输入文本语法错误时抛出。
 * @throws {TypeError} 配置无效或解析结果不能序列化为文本时抛出。
 */
export function formatJson(text: string, options: FormatJsonOptions = {}) {
  const { inputFormat = "json5", outputFormat = "json", space = 2, sortKeys = false } = options;
  const result = parseJson(text, { format: inputFormat });
  if (!result.success) throw result.error;

  const formatted = stringifyJson(result.data, {
    format: outputFormat,
    space,
    sortKeys,
  });

  return formatted;
}

function createReplacer(
  replacer: JsonReplacer | JsonReplacerKeyList | undefined,
  sortKeys: boolean,
  omitNullish: boolean,
): JsonReplacer | JsonReplacerKeyList | undefined {
  const keyList = isJsonReplacerKeyList(replacer) ? replacer : undefined;

  // 无需组合额外行为时保留底层序列化器的原生 replacer 处理方式。
  if (!sortKeys && !omitNullish) {
    return keyList ? [...keyList] : replacer;
  }

  const allowedKeys = keyList ? new Set(keyList.map((key) => String(key))) : undefined;
  const replacerFunction = typeof replacer === "function" ? replacer : undefined;
  const sortedObjects = new WeakMap<object, Record<string, unknown>>();
  let isRootCall = true;

  return function sortingReplacer(this: unknown, key: string, currentValue: unknown) {
    // 保持原生语义：先应用调用方的 replacer，再决定是否需要排序转换后的对象。
    const replacedValue = replacerFunction
      ? Reflect.apply(replacerFunction, this, [key, currentValue])
      : currentValue;
    const isRootValue = isRootCall;
    isRootCall = false;

    // 对象字段可被真正省略；数组元素返回 undefined 仍会输出为 null，因此保持标准语义。
    if (
      omitNullish &&
      !isRootValue &&
      !Array.isArray(this) &&
      (replacedValue === null || replacedValue === undefined)
    ) {
      return undefined;
    }

    if (!isJsonObject(replacedValue)) {
      return replacedValue;
    }
    const cached = sortedObjects.get(replacedValue);
    if (cached !== undefined) {
      return cached;
    }

    // 通过按序重新插入属性构造浅对象；后续递归和值序列化仍交给底层序列化器。
    // WeakMap 保证共享引用复用同一个代理对象，同时不会阻止源对象被垃圾回收。
    const propertyKeys = Object.keys(replacedValue).filter(
      (propertyKey) => allowedKeys === undefined || allowedKeys.has(propertyKey),
    );
    if (sortKeys) {
      propertyKeys.sort((first, second) => first.localeCompare(second));
    }
    const sortedObject: Record<string, unknown> = {};
    for (const propertyKey of propertyKeys) {
      sortedObject[propertyKey] = replacedValue[propertyKey];
    }

    sortedObjects.set(replacedValue, sortedObject);
    return sortedObject;
  };
}

function isJsonReplacerKeyList(
  value: JsonReplacer | JsonReplacerKeyList | undefined,
): value is JsonReplacerKeyList {
  return Array.isArray(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertJsonFormat(format: JsonFormat) {
  if (format !== "json" && format !== "json5") {
    throw new RangeError('format must be either "json" or "json5"');
  }
}

function assertParseOptions(
  text: string,
  format: JsonFormat,
  reviver: JsonReviver | undefined,
  fieldName: string | undefined,
) {
  if (typeof text !== "string") throw new TypeError("text must be a string");

  assertJsonFormat(format);
  if (reviver !== undefined && typeof reviver !== "function") {
    throw new TypeError("reviver must be a function");
  }
  if (fieldName !== undefined && (typeof fieldName !== "string" || fieldName.length === 0)) {
    throw new TypeError("fieldName must be a non-empty string");
  }
}

function assertStringifyOptions(
  format: JsonFormat,
  replacer: JsonReplacer | readonly (string | number)[] | undefined,
  space: string | number | undefined,
  sortKeys: boolean,
  omitNullish: boolean,
) {
  assertJsonFormat(format);
  if (replacer !== undefined && typeof replacer !== "function" && !Array.isArray(replacer)) {
    throw new TypeError("replacer must be a function or an array of property names");
  }
  if (
    Array.isArray(replacer) &&
    replacer.some((key) => typeof key !== "string" && typeof key !== "number")
  ) {
    throw new TypeError("replacer property names must be strings or numbers");
  }
  if (space !== undefined && typeof space !== "string" && typeof space !== "number") {
    throw new TypeError("space must be a string or number");
  }
  if (typeof space === "number" && !Number.isFinite(space)) {
    throw new RangeError("space must be a finite number");
  }
  if (typeof sortKeys !== "boolean") {
    throw new TypeError("sortKeys must be a boolean");
  }
  if (typeof omitNullish !== "boolean") {
    throw new TypeError("omitNullish must be a boolean");
  }
}

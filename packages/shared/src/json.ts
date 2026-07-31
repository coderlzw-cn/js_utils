import JSON5 from "json5";

/**
 * JSON 文本采用的语法格式。
 *
 * - `json`：严格遵循标准 JSON 语法。
 * - `json5`：额外支持注释、尾逗号、单引号和未加引号的对象键。
 */
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

/**
 * 将已经确认是 JSON 对象的未知字段反序列化为业务类型。
 *
 * 调用此回调前已经排除了 `null`、数组和基本类型。实现仍应校验所有必填、
 * 可选及未知字段，并在数据无效时抛出异常。
 *
 * @template T 反序列化后得到的业务类型。
 * @param value 已通过 JSON 对象结构检查的只读键值记录。
 * @param fieldName 字段或数据名称；未配置时为 `"JSON"`。
 * @returns 校验并转换后的业务对象。
 */
export type JsonObjectDeserializer<T> = (value: Readonly<Record<string, unknown>>, fieldName: string) => T;

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
   * 可选的字段或数据名称，用于为解析错误补充上下文。
   *
   * 必须是非空字符串。配置后，语法错误会被包装为包含该名称的 `SyntaxError`。
   */
  readonly fieldName?: string;
}

/** 在普通解析配置的基础上，将 JSON 对象校验并转换为业务类型。 */
export interface DeserializeJsonObjectOptions<T> extends ParseJsonOptions {
  /** 对已经确认是普通 JSON 对象的值执行运行时校验和类型转换。 */
  readonly deserialize: JsonObjectDeserializer<T>;
}

/** JSON 序列化配置。 */
export interface StringifyJsonOptions {
  /* @default "json" */
  readonly format?: JsonFormat;
  /**
   * 控制输出属性或转换属性值。
   *
   * 函数形式可转换每个值；字符串/数字数组形式仅保留同名对象属性。
   */
  readonly replacer?: JsonReplacer | readonly (string | number)[];
  /**
   * 缩进使用的空格数或字符串，行为与 `JSON.stringify` 一致。
   *
   * 数字和字符串实际都最多使用 10 个空格或字符。
   */
  readonly space?: string | number;
  /**
   * 是否按字典序递归排列对象键。数组元素顺序不会改变。
   *
   * @default false
   */
  readonly sortKeys?: boolean;
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

/** 安全解析成功后的结果；`data` 保留调用方指定或反序列化器返回的类型。 */
export interface JsonParseSuccess<T> {
  readonly success: true;
  readonly data: T;
}

/** 安全解析失败后的结果；原本抛出的值会被统一转换为 `Error`。 */
export interface JsonParseFailure {
  readonly success: false;
  readonly error: Error;
}

/** 可通过 `success` 判断成功或失败的安全解析结果。 */
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
 * @returns 解析并经过 `reviver` 转换后的 JavaScript 值。
 * @throws {TypeError} 参数类型不正确时抛出。
 * @throws {RangeError} `format` 不是 `"json"` 或 `"json5"` 时抛出。
 * @throws {SyntaxError} 文本不符合指定语法时抛出。
 *
 * @example
 * const config = parseJson<{ port: number }>("{ port: 3000, }");
 */
export function parseJson<T = unknown>(text: string, options: ParseJsonOptions = {}) {
  const { format = "json5", reviver, fieldName } = options;
  assertParseOptions(text, format, reviver, fieldName);

  try {
    return format === "json" ? (JSON.parse(text, reviver as Parameters<typeof JSON.parse>[1]) as T) : JSON5.parse<T>(text, reviver);
  } catch (error) {
    if (fieldName === undefined) {
      throw error;
    }
    throw new SyntaxError(`${fieldName} 不是有效的 JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/**
 * 将 JSON/JSON5 文本解析为对象，拒绝 null、数组和基本类型。
 *
 * 未提供 `deserialize` 时只检查结果是不是非空、非数组的对象，不会验证其中的
 * 字段类型；提供 `deserialize` 时，可在一次调用中完成结构校验和业务类型转换。
 * `fieldName` 存在时，语法错误和对象类型错误都会携带该名称。
 *
 * @template T 期望的对象类型或反序列化器返回的业务类型。
 * @param text 待解析的 JSON 或 JSON5 文本。
 * @param options 普通解析配置，或包含 `deserialize` 的业务反序列化配置。
 * @returns 解析后的对象，或 `deserialize` 的返回值。
 * @throws {TypeError} 解析结果不是 JSON 对象、参数无效或业务校验失败时抛出。
 * @throws {SyntaxError} 文本语法错误时抛出。
 */
export function parseJsonObject<T = Record<string, unknown>>(text: string, options: ParseJsonOptions | DeserializeJsonObjectOptions<T> = {}) {
  return parseJsonObjectValue(text, options) as T;
}

function parseJsonObjectValue(text: string, options: ParseJsonOptions | DeserializeJsonObjectOptions<unknown>) {
  const value = parseJson(text, options);
  if (!isJsonObject(value)) {
    throw new TypeError(`${options.fieldName ?? "JSON"} 必须是 JSON 对象`);
  }
  const objectValue = value as Record<string, unknown>;

  // 仅在调用方显式提供反序列化器时做业务转换；否则原样返回已检查的对象。
  if ("deserialize" in options) {
    if (typeof options.deserialize !== "function") {
      throw new TypeError("deserialize must be a function");
    }
    return options.deserialize(objectValue, options.fieldName ?? "JSON");
  }
  return objectValue;
}

/**
 * 尝试解析 JSON/JSON5，不会因语法错误抛出异常。
 *
 * 不仅语法错误，选项校验、`reviver` 等解析流程内的任何异常都会被捕获。成功与
 * 失败结果可通过 `success` 字段进行类型收窄。
 *
 * @template T 调用方预期的返回类型，默认为 `unknown`。
 * @param text 待解析的 JSON 或 JSON5 文本。
 * @param options 解析配置。
 * @returns 成功时包含 `data`，失败时包含标准化后的 `error`。
 */
export function safeParseJson<T = unknown>(text: string, options: ParseJsonOptions = {}) {
  return captureJsonParse(() => parseJson<T>(text, options));
}

/**
 * 安全解析 JSON/JSON5 对象，并保留普通泛型或反序列化器推断出的结果类型。
 *
 * 与 `parseJsonObject` 的校验规则相同，但会把语法错误、对象类型错误和业务
 * 反序列化错误包装到失败结果中，而不是向调用方抛出。
 *
 * @template T 期望的对象类型或反序列化器返回的业务类型。
 * @param text 待解析的 JSON 或 JSON5 文本。
 * @param options 普通解析配置，或包含 `deserialize` 的业务反序列化配置。
 * @returns 可通过 `success` 收窄的解析结果。
 */
export function safeParseJsonObject<T = Record<string, unknown>>(text: string, options: ParseJsonOptions | DeserializeJsonObjectOptions<T> = {}) {
  return captureJsonParse(() => parseJsonObjectValue(text, options) as T);
}

/**
 * 判断文本是否为合法的 JSON 或 JSON5。
 *
 * 默认按 JSON5 校验；传入 `{ format: "json" }` 可执行严格 JSON 校验。
 * 注意：只判断语法是否合法，因此数组、基本类型和 `null` 也可能返回 `true`。
 *
 * @param text 待校验的文本。
 * @param options 解析格式及可选的 `reviver` 配置。
 * @returns 文本可按指定配置成功解析时返回 `true`，否则返回 `false`。
 */
export function isValidJson(text: string, options: ParseJsonOptions = {}) {
  return safeParseJson(text, options).success;
}

/**
 * 判断文本是否为合法的 JSON/JSON5 对象。
 *
 * @param text 待校验的文本。
 * @param options 解析格式及可选的 `reviver` 配置。
 * @returns 文本合法且结果为非空、非数组对象时返回 `true`；数组、`null`、
 * 基本类型或语法错误均返回 `false`。
 */
export function isValidJsonObject(text: string, options: ParseJsonOptions = {}) {
  return safeParseJsonObject(text, options).success;
}

/**
 * 将 JavaScript 值序列化为标准 JSON 或 JSON5 文本。
 *
 * 与原生 `JSON.stringify` 一样，顶层的 `undefined`、函数和 Symbol 可能得到
 * `undefined`，循环引用会抛出异常。`sortKeys` 只调整对象属性顺序，不会改变
 * 数组顺序；与属性白名单同时使用时，会先过滤属性再排序。
 *
 * @param value 待序列化的 JavaScript 值。
 * @param options 输出格式、属性转换、缩进和键排序配置。
 * @returns 序列化文本；顶层值无法表示为 JSON 时返回 `undefined`。
 * @throws {TypeError} 选项无效、存在循环引用或值无法序列化时抛出。
 * @throws {RangeError} `format` 或数值缩进无效时抛出。
 */
export function stringifyJson(value: unknown, options: StringifyJsonOptions = {}) {
  const { format = "json", replacer, space, sortKeys = false } = options;
  assertStringifyOptions(format, replacer, space, sortKeys);

  const effectiveReplacer = createReplacer(replacer, sortKeys);
  if (format === "json") {
    return Array.isArray(effectiveReplacer) ? JSON.stringify(value, effectiveReplacer, space) : JSON.stringify(value, effectiveReplacer as JsonReplacer | undefined, space);
  }

  return Array.isArray(effectiveReplacer) ? JSON5.stringify(value, effectiveReplacer, space) : JSON5.stringify(value, effectiveReplacer as JsonReplacer | undefined, space);
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
  const value = parseJson(text, { format: inputFormat });
  const formatted = stringifyJson(value, {
    format: outputFormat,
    space,
    sortKeys,
  });

  return formatted;
}

function createReplacer(replacer: JsonReplacer | readonly (string | number)[] | undefined, sortKeys: boolean) {
  // 不排序时仅复制属性白名单，避免序列化期间意外依赖调用方后续修改的数组。
  if (!sortKeys) {
    return isKeyList(replacer) ? [...replacer] : replacer;
  }

  const allowedKeys = isKeyList(replacer) ? new Set(replacer.map((key) => String(key))) : undefined;
  const replacerFunction = typeof replacer === "function" ? replacer : undefined;
  const sortedObjects = new WeakMap<object, Record<string, unknown>>();

  return function sortingReplacer(this: unknown, key: string, currentValue: unknown) {
    // 保持原生语义：先应用调用方的 replacer，再决定是否需要排序转换后的对象。
    const replacedValue = replacerFunction ? replacerFunction.call(this, key, currentValue) : currentValue;

    if (!isJsonObject(replacedValue)) {
      return replacedValue;
    }
    const objectValue = replacedValue as Record<string, unknown>;
    const cached = sortedObjects.get(objectValue);
    if (cached !== undefined) {
      return cached;
    }

    // 通过按序重新插入属性构造浅对象；后续递归和值序列化仍交给底层序列化器。
    // WeakMap 保证共享引用复用同一个代理对象，同时不会阻止源对象被垃圾回收。
    const sortedObject = Object.fromEntries(
      Object.keys(objectValue)
        .filter((propertyKey) => allowedKeys === undefined || allowedKeys.has(propertyKey))
        .sort((first, second) => first.localeCompare(second))
        .map((propertyKey) => [propertyKey, objectValue[propertyKey]] as const),
    );

    sortedObjects.set(objectValue, sortedObject);
    return sortedObject;
  };
}

function isKeyList(value: JsonReplacer | readonly (string | number)[] | undefined) {
  return Array.isArray(value);
}

function isJsonObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertJsonFormat(format: JsonFormat) {
  if (format !== "json" && format !== "json5") {
    throw new RangeError('format must be either "json" or "json5"');
  }
}

function assertParseOptions(text: string, format: JsonFormat, reviver: JsonReviver | undefined, fieldName: string | undefined) {
  if (typeof text !== "string") throw new TypeError("text must be a string");

  assertJsonFormat(format);
  if (reviver !== undefined && typeof reviver !== "function") {
    throw new TypeError("reviver must be a function");
  }
  if (fieldName !== undefined && (typeof fieldName !== "string" || fieldName.length === 0)) {
    throw new TypeError("fieldName must be a non-empty string");
  }
}

function assertStringifyOptions(format: JsonFormat, replacer: JsonReplacer | readonly (string | number)[] | undefined, space: string | number | undefined, sortKeys: boolean) {
  assertJsonFormat(format);
  if (replacer !== undefined && typeof replacer !== "function" && !Array.isArray(replacer)) {
    throw new TypeError("replacer must be a function or an array of property names");
  }
  if (Array.isArray(replacer) && replacer.some((key) => typeof key !== "string" && typeof key !== "number")) {
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
}

function captureJsonParse<T>(operation: () => T) {
  try {
    return { success: true as const, data: operation() };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

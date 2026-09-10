/**
 * 通用类型守卫工具。
 *
 * 设计原则：
 * - 所有输入优先使用 unknown，避免 any；
 * - 类型守卫只负责运行时类型判断，不包含具体业务规则；
 * - 前后端通用，不依赖浏览器或 Node.js 专属 API；
 * - 对容易产生歧义的类型提供更细粒度的守卫；
 * - 提供组合型守卫，方便构造业务 DTO / API 响应校验。
 */

/* -------------------------------------------------------------------------- */
/*                                  基础类型                                   */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否为 null。
 *
 * @example
 * isNull(null); // true
 * isNull(undefined); // false
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * 判断值是否为 undefined。
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * 判断值是否为 null 或 undefined。
 *
 * `value == null` 是此场景下有意使用的宽松比较，
 * 它只会同时匹配 null 和 undefined。
 */
export function isNil(value: unknown): value is null | undefined {
  return value == null;
}

/**
 * 判断值是否既不是 null，也不是 undefined。
 */
export function isNonNil<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * 判断值是否为字符串。
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * 判断值是否为布尔值。
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * 判断值是否为 bigint。
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === "bigint";
}

/**
 * 判断值是否为 symbol。
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === "symbol";
}

/**
 * 判断值是否为 JavaScript 原始值。
 *
 * 包括：
 * - string
 * - number
 * - bigint
 * - boolean
 * - symbol
 * - null
 * - undefined
 */
export function isPrimitive(
  value: unknown,
): value is string | number | bigint | boolean | symbol | null | undefined {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

/* -------------------------------------------------------------------------- */
/*                                   数字                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否为有效 number。
 *
 * 排除 NaN，但允许 Infinity 和 -Infinity。
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * 判断值是否为 NaN。
 *
 * 与全局 isNaN 不同，不会进行隐式类型转换。
 */
export function isNaNValue(value: unknown): value is number {
  return typeof value === "number" && Number.isNaN(value);
}

/**
 * 判断值是否为有限数字。
 *
 * 排除：
 * - NaN
 * - Infinity
 * - -Infinity
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 判断值是否为整数。
 *
 * Number.isInteger 会自动排除 NaN 和 Infinity。
 */
export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * 判断值是否为安全整数。
 *
 * 范围：
 * Number.MIN_SAFE_INTEGER ~ Number.MAX_SAFE_INTEGER
 */
export function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * 判断值是否为正数。
 *
 * 不包含 0。
 */
export function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

/**
 * 判断值是否为非负数。
 *
 * 包含 0。
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

/**
 * 判断值是否为负数。
 *
 * 不包含 0。
 */
export function isNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value < 0;
}

/**
 * 判断值是否为正整数。
 */
export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

/**
 * 判断值是否为非负整数。
 *
 * 常用于：
 * - 数组索引
 * - 数量
 * - offset
 * - 分片索引
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

/**
 * 判断值是否为正安全整数。
 *
 * 常用于：
 * - 文件大小
 * - 分片大小
 * - 分页大小
 * - 数据长度
 */
export function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

/**
 * 判断值是否为非负安全整数。
 */
export function isNonNegativeSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

/**
 * 判断数字是否处于指定闭区间。
 *
 * @example
 * isNumberInRange(5, 1, 10); // true
 */
export function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

/**
 * 判断整数是否处于指定闭区间。
 */
export function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return isInteger(value) && value >= min && value <= max;
}

/* -------------------------------------------------------------------------- */
/*                                   字符串                                    */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为非空字符串。
 *
 * 注意：
 * 空格字符串 `"   "` 会返回 true。
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

/**
 * 判断是否为非空白字符串。
 *
 * 会忽略首尾空白。
 *
 * @example
 * isNonBlankString("hello"); // true
 * isNonBlankString("   ");   // false
 */
export function isNonBlankString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * 判断是否为空字符串。
 *
 * 仅匹配 ""。
 */
export function isEmptyString(value: unknown): value is "" {
  return value === "";
}

/**
 * 判断是否为空白字符串。
 *
 * 包括：
 * - ""
 * - " "
 * - "\t"
 * - "\n"
 */
export function isBlankString(value: unknown): value is string {
  return isString(value) && value.trim().length === 0;
}

/**
 * 判断字符串长度是否处于指定闭区间。
 */
export function isStringLengthInRange(value: unknown, min: number, max: number): value is string {
  return isString(value) && value.length >= min && value.length <= max;
}

/**
 * 判断字符串是否匹配指定正则表达式。
 */
export function matchesPattern(value: unknown, pattern: RegExp): value is string {
  if (!isString(value)) {
    return false;
  }

  // 避免带 g/y 标志的 RegExp 因 lastIndex 导致结果不稳定。
  pattern.lastIndex = 0;

  return pattern.test(value);
}

/* -------------------------------------------------------------------------- */
/*                                   函数                                      */
/* -------------------------------------------------------------------------- */

/**
 * 通用函数类型。
 */
export type AnyFunction = (...args: never[]) => unknown;

/**
 * 判断值是否为函数。
 */
export function isFunction(value: unknown): value is AnyFunction {
  return typeof value === "function";
}

/**
 * 判断值是否为构造函数。
 *
 * 这里只判断其运行时是否为函数，
 * JavaScript 无法完全可靠地区分普通函数和可 new 的构造函数。
 */
export function isConstructor(value: unknown): value is abstract new (...args: never[]) => unknown {
  return typeof value === "function";
}

/* -------------------------------------------------------------------------- */
/*                                   对象                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否为非 null 对象。
 *
 * 注意：
 * - [] -> true
 * - new Date() -> true
 * - new Map() -> true
 * - function -> false
 */
export function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * 判断是否为可通过字符串 key 访问的非数组对象。
 *
 * 排除：
 * - null
 * - Array
 *
 * 但不会排除：
 * - Date
 * - Map
 * - Set
 * - class 实例
 *
 * 对 API / JSON 等未知对象做属性读取时通常使用此守卫。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 判断是否为普通对象。
 *
 * 接受：
 * - {}
 * - { foo: "bar" }
 * - Object.create(null)
 *
 * 排除：
 * - Array
 * - Date
 * - Map
 * - Set
 * - RegExp
 * - class 实例
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/**
 * 判断对象是否没有任何自有可枚举字符串属性。
 *
 * 仅接受普通对象。
 */
export function isEmptyObject(value: unknown): value is Record<string, never> {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

/**
 * 判断对象是否至少包含一个自有可枚举字符串属性。
 */
export function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

/* -------------------------------------------------------------------------- */
/*                                   属性                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断对象是否拥有指定自有属性。
 *
 * 与 `key in value` 不同：
 * 不检查原型链。
 */
export function hasOwnProperty<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * 判断 unknown 值是否拥有指定自有属性。
 */
export function hasOwn<K extends PropertyKey>(value: unknown, key: K): value is Record<K, unknown> {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * 判断值是否拥有指定属性。
 *
 * 会检查原型链。
 *
 * 如果只想判断对象自己的字段，
 * 优先使用 hasOwn。
 */
export function hasProperty<K extends PropertyKey>(
  value: unknown,
  key: K,
): value is Record<K, unknown> {
  return isObject(value) && key in value;
}

/**
 * 判断对象是否同时拥有多个指定自有属性。
 */
export function hasOwnProperties<K extends PropertyKey>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, unknown> {
  return isObject(value) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/**
 * 判断 key 是否是对象已有属性。
 *
 * 主要用于解决 Object.keys / 动态 key 的类型收窄。
 */
export function isKeyOf<T extends object>(value: T, key: PropertyKey): key is keyof T {
  return key in value;
}

/* -------------------------------------------------------------------------- */
/*                                   数组                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为数组。
 *
 * 元素类型被收窄为 unknown。
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * 判断是否为空数组。
 */
export function isEmptyArray(value: unknown): value is [] {
  return Array.isArray(value) && value.length === 0;
}

/**
 * 判断是否为非空数组。
 *
 * 通过元组类型保证第一个元素一定存在。
 */
export function isNonEmptyArray<T = unknown>(value: unknown): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * 判断是否为指定类型元素组成的数组。
 *
 * @example
 * const value: unknown = ["a", "b"];
 *
 * if (isArrayOf(value, isString)) {
 *   // value: string[]
 * }
 */
export function isArrayOf<T>(value: unknown, guard: TypeGuard<T>): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/**
 * 判断是否为指定类型元素组成的非空数组。
 */
export function isNonEmptyArrayOf<T>(value: unknown, guard: TypeGuard<T>): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0 && value.every(guard);
}

/**
 * 判断数组长度是否为指定值。
 */
export function isArrayLength(value: unknown, length: number): value is unknown[] {
  return Array.isArray(value) && value.length === length;
}

/* -------------------------------------------------------------------------- */
/*                              内置对象 / 集合                                */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为有效 Date。
 *
 * 会排除 Invalid Date。
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * 判断是否为 RegExp。
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

/**
 * 判断是否为 Map。
 */
export function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

/**
 * 判断是否为 Set。
 */
export function isSet(value: unknown): value is Set<unknown> {
  return value instanceof Set;
}

/**
 * 判断是否为 WeakMap。
 */
export function isWeakMap(value: unknown): value is WeakMap<object, unknown> {
  return value instanceof WeakMap;
}

/**
 * 判断是否为 WeakSet。
 */
export function isWeakSet(value: unknown): value is WeakSet<object> {
  return value instanceof WeakSet;
}

/**
 * 判断是否为 Error 实例。
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * 判断是否为 ArrayBuffer。
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

/**
 * 判断是否为 DataView。
 */
export function isDataView(value: unknown): value is DataView {
  return value instanceof DataView;
}

/**
 * 判断是否为 TypedArray。
 *
 * 包括：
 * - Int8Array
 * - Uint8Array
 * - Uint8ClampedArray
 * - Int16Array
 * - Uint16Array
 * - Int32Array
 * - Uint32Array
 * - Float32Array
 * - Float64Array
 * - BigInt64Array
 * - BigUint64Array
 *
 * 排除 DataView。
 */
export function isTypedArray(value: unknown): value is Exclude<ArrayBufferView, DataView> {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/* -------------------------------------------------------------------------- */
/*                               Promise / 异步                                */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为原生 Promise。
 *
 * 注意：
 * iframe / realm 场景下 instanceof 可能失效。
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return value instanceof Promise;
}

/**
 * 判断是否为 PromiseLike / Thenable。
 *
 * 比 instanceof Promise 更适合：
 * - 第三方 Promise 实现
 * - 跨 realm
 * - 自定义 thenable
 */
export function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

/* -------------------------------------------------------------------------- */
/*                                  枚举 / 字面量                              */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否严格等于指定字面量。
 *
 * @example
 * isLiteral(value, "running")
 */
export function isLiteral<const T>(value: unknown, literal: T): value is T {
  return Object.is(value, literal);
}

/**
 * 判断值是否属于指定字面量集合。
 *
 * 非常适合替代大量：
 *
 * value === "a" || value === "b" || value === "c"
 *
 * @example
 * const STATUS = ["idle", "running", "success"] as const;
 *
 * if (isOneOf(value, STATUS)) {
 *   // value: "idle" | "running" | "success"
 * }
 */
export function isOneOf<const T extends readonly unknown[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return values.some((item) => Object.is(item, value));
}

/**
 * 判断字符串是否属于指定字符串字面量集合。
 */
export function isStringLiteral<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return isString(value) && values.includes(value);
}

/**
 * 判断数字是否属于指定数字字面量集合。
 */
export function isNumberLiteral<const T extends readonly number[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return isNumber(value) && values.includes(value);
}

/* -------------------------------------------------------------------------- */
/*                                类型守卫组合器                               */
/* -------------------------------------------------------------------------- */

/**
 * 标准类型守卫函数。
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * 提取类型守卫对应的目标类型。
 *
 * @example
 * type User = GuardType<typeof isUser>;
 */
export type GuardType<T> = T extends TypeGuard<infer U> ? U : never;

/**
 * 创建“可选值”类型守卫。
 *
 * 允许 undefined。
 *
 * @example
 * const isOptionalString = optional(isString);
 *
 * isOptionalString(undefined); // true
 * isOptionalString("abc");     // true
 */
export function optional<T>(guard: TypeGuard<T>): TypeGuard<T | undefined> {
  return (value: unknown): value is T | undefined => value === undefined || guard(value);
}

/**
 * 创建“可空值”类型守卫。
 *
 * 允许 null。
 */
export function nullable<T>(guard: TypeGuard<T>): TypeGuard<T | null> {
  return (value: unknown): value is T | null => value === null || guard(value);
}

/**
 * 创建允许 null 和 undefined 的类型守卫。
 */
export function nullish<T>(guard: TypeGuard<T>): TypeGuard<T | null | undefined> {
  return (value: unknown): value is T | null | undefined => value == null || guard(value);
}

/**
 * 创建数组类型守卫。
 *
 * @example
 * const isStringArray = arrayOf(isString);
 */
export function arrayOf<T>(guard: TypeGuard<T>): TypeGuard<T[]> {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(guard);
}

/**
 * 创建联合类型守卫。
 *
 * 只要任意一个守卫通过即可。
 *
 * @example
 * const isStringOrNumber = union(isString, isNumber);
 */
export function union<A, B>(guardA: TypeGuard<A>, guardB: TypeGuard<B>): TypeGuard<A | B>;

export function union<A, B, C>(
  guardA: TypeGuard<A>,
  guardB: TypeGuard<B>,
  guardC: TypeGuard<C>,
): TypeGuard<A | B | C>;

export function union(...guards: TypeGuard<unknown>[]): TypeGuard<unknown> {
  return (value: unknown): value is unknown => guards.some((guard) => guard(value));
}

/**
 * 创建指定字面量集合的类型守卫。
 *
 * @example
 * const isStatus = literalUnion(
 *   "idle",
 *   "running",
 *   "success",
 * );
 */
export function literalUnion<const T extends readonly unknown[]>(
  ...values: T
): TypeGuard<T[number]> {
  return (value: unknown): value is T[number] => values.some((item) => Object.is(item, value));
}

/**
 * 创建 instanceof 类型守卫。
 *
 * @example
 * const isCustomError = instanceOf(CustomError);
 */
export function instanceOf<T>(constructor: abstract new (...args: never[]) => T): TypeGuard<T> {
  return (value: unknown): value is T => value instanceof constructor;
}

/* -------------------------------------------------------------------------- */
/*                            Object Schema 类型守卫                           */
/* -------------------------------------------------------------------------- */

/**
 * 类型守卫 Schema。
 *
 * 每个属性对应一个字段类型守卫。
 */
export type GuardSchema = Record<string, TypeGuard<unknown>>;

/**
 * 根据 GuardSchema 推导对象类型。
 */
export type InferGuardSchema<T extends GuardSchema> = {
  [K in keyof T]: T[K] extends TypeGuard<infer U> ? U : never;
};

/**
 * 根据 Schema 校验普通对象。
 *
 * 适合校验 API 返回的轻量级 DTO。
 *
 * 注意：
 * - 只校验 Schema 中声明的属性；
 * - 不限制对象存在额外属性；
 * - 更复杂的业务校验建议使用 Zod / Valibot 等 Schema 库。
 *
 * @example
 * const isUser = objectOf({
 *   id: isString,
 *   name: isString,
 *   age: optional(isPositiveInteger),
 * });
 *
 * const data: unknown = {};
 *
 * if (isUser(data)) {
 *   data.id;
 *   data.name;
 * }
 */
export function objectOf<const T extends GuardSchema>(schema: T): TypeGuard<InferGuardSchema<T>> {
  return (value: unknown): value is InferGuardSchema<T> => {
    if (!isRecord(value)) {
      return false;
    }

    return Object.entries(schema).every(([key, guard]) => guard(value[key]));
  };
}

/* -------------------------------------------------------------------------- */
/*                                  JSON 类型                                  */
/* -------------------------------------------------------------------------- */

/**
 * JSON 原始类型。
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON 对象。
 */
export type JsonObject = {
  [key: string]: JsonValue;
};

/**
 * JSON 数组。
 */
export type JsonArray = JsonValue[];

/**
 * 任意合法 JSON 值。
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * 判断是否为 JSON 原始值。
 *
 * JSON 不支持：
 * - undefined
 * - bigint
 * - symbol
 * - function
 * - NaN
 * - Infinity
 */
export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || isString(value) || isBoolean(value) || isFiniteNumber(value);
}

/**
 * 判断是否为合法 JSON 值。
 *
 * 会递归检查对象和数组。
 *
 * 注意：
 * 对非常深层或循环引用对象不建议调用此函数。
 */
export function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonPrimitive(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/*                                 特殊值                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否为可迭代对象。
 *
 * 包括：
 * - Array
 * - String
 * - Map
 * - Set
 * - TypedArray
 * - 其他实现 Symbol.iterator 的对象
 */
export function isIterable(value: unknown): value is Iterable<unknown> {
  if (value == null) {
    return false;
  }

  return (
    typeof (
      value as {
        [Symbol.iterator]?: unknown;
      }
    )[Symbol.iterator] === "function"
  );
}

/**
 * 判断值是否为异步可迭代对象。
 */
export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (value == null) {
    return false;
  }

  return (
    typeof (
      value as {
        [Symbol.asyncIterator]?: unknown;
      }
    )[Symbol.asyncIterator] === "function"
  );
}

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
 * @param value - 待判断的值。
 * @returns 值为 `null` 时返回 `true`，并将类型收窄为 `null`。
 *
 * @example
 * isNull(null); // true
 * isNull(undefined); // false
 */
export const isNull = (value: unknown): value is null => value === null;

/**
 * 判断值是否为 undefined。
 *
 * @param value - 待判断的值。
 * @returns 值为 `undefined` 时返回 `true`，并将类型收窄为 `undefined`。
 *
 * @example
 * isUndefined(undefined); // true
 * isUndefined(null); // false
 */
export const isUndefined = (value: unknown): value is undefined => value === undefined;

/**
 * 判断值是否为 null 或 undefined。
 *
 * `value == null` 是此场景下有意使用的宽松比较，
 * 它只会同时匹配 null 和 undefined。
 *
 * @param value - 待判断的值。
 * @returns 值为 `null` 或 `undefined` 时返回 `true`。
 */
export const isNil = (value: unknown): value is null | undefined => value == null;

/**
 * 判断值是否既不是 null，也不是 undefined。
 *
 * @typeParam T - 排除空值后保留的类型。
 * @param value - 待判断的值。
 * @returns 值既不是 `null` 也不是 `undefined` 时返回 `true`，并将类型收窄为 `T`。
 */
export const isNonNil = <T>(value: T | null | undefined): value is T => value != null;

/**
 * 判断值是否为字符串。
 *
 * @param value - 待判断的值。
 * @returns 值为 `string` 时返回 `true`。
 */
export const isString = (value: unknown): value is string => typeof value === "string";

/**
 * 判断值是否为布尔值。
 *
 * @param value - 待判断的值。
 * @returns 值为 `boolean` 时返回 `true`。
 */
export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * 判断值是否为 bigint。
 *
 * @param value - 待判断的值。
 * @returns 值为 `bigint` 时返回 `true`。
 */
export const isBigInt = (value: unknown): value is bigint => typeof value === "bigint";

/**
 * 判断值是否为 symbol。
 *
 * @param value - 待判断的值。
 * @returns 值为 `symbol` 时返回 `true`。
 */
export const isSymbol = (value: unknown): value is symbol => typeof value === "symbol";

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
 *
 * @param value - 待判断的值。
 * @returns 值为原始类型时返回 `true`。
 */
export const isPrimitive = (value: unknown): value is string | number | bigint | boolean | symbol | null | undefined => value === null || (typeof value !== "object" && typeof value !== "function");

/* -------------------------------------------------------------------------- */
/*                                   数字                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否为有效 number。
 *
 * 排除 NaN，但允许 Infinity 和 -Infinity。
 *
 * @param value - 待判断的值。
 * @returns 值为非 `NaN` 的 `number` 时返回 `true`。
 */
export const isNumber = (value: unknown): value is number => typeof value === "number" && !Number.isNaN(value);

/**
 * 判断值是否为 NaN。
 *
 * 与全局 isNaN 不同，不会进行隐式类型转换。
 *
 * @param value - 待判断的值。
 * @returns 值为 `NaN` 时返回 `true`。
 */
export const isNaNValue = (value: unknown): value is number => typeof value === "number" && Number.isNaN(value);

/**
 * 判断值是否为有限数字。
 *
 * 排除：
 * - NaN
 * - Infinity
 * - -Infinity
 *
 * @param value - 待判断的值。
 * @returns 值为有限 `number` 时返回 `true`。
 */
export const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * 判断值是否为整数。
 *
 * Number.isInteger 会自动排除 NaN 和 Infinity。
 *
 * @param value - 待判断的值。
 * @returns 值为整数时返回 `true`。
 */
export const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/**
 * 判断值是否为安全整数。
 *
 * 范围：
 * Number.MIN_SAFE_INTEGER ~ Number.MAX_SAFE_INTEGER
 *
 * @param value - 待判断的值。
 * @returns 值为安全整数时返回 `true`。
 */
export const isSafeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

/**
 * 判断值是否为正数。
 *
 * 不包含 0。
 *
 * @param value - 待判断的值。
 * @returns 值为大于 0 的有限数字时返回 `true`。
 */
export const isPositiveNumber = (value: unknown): value is number => isFiniteNumber(value) && value > 0;

/**
 * 判断值是否为非负数。
 *
 * 包含 0。
 *
 * @param value - 待判断的值。
 * @returns 值为大于等于 0 的有限数字时返回 `true`。
 */
export const isNonNegativeNumber = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;

/**
 * 判断值是否为负数。
 *
 * 不包含 0。
 *
 * @param value - 待判断的值。
 * @returns 值为小于 0 的有限数字时返回 `true`。
 */
export const isNegativeNumber = (value: unknown): value is number => isFiniteNumber(value) && value < 0;

/**
 * 判断值是否为正整数。
 *
 * 不包含 0。
 *
 * @param value - 待判断的值。
 * @returns 值为大于 0 的整数时返回 `true`。
 */
export const isPositiveInteger = (value: unknown): value is number => isInteger(value) && value > 0;

/**
 * 判断值是否为非负整数。
 *
 * 常用于：
 * - 数组索引
 * - 数量
 * - offset
 * - 分片索引
 *
 * @param value - 待判断的值。
 * @returns 值为大于等于 0 的整数时返回 `true`。
 */
export const isNonNegativeInteger = (value: unknown): value is number => isInteger(value) && value >= 0;

/**
 * 判断值是否为正安全整数。
 *
 * 常用于：
 * - 文件大小
 * - 分片大小
 * - 分页大小
 * - 数据长度
 *
 * @param value - 待判断的值。
 * @returns 值为大于 0 的安全整数时返回 `true`。
 */
export const isPositiveSafeInteger = (value: unknown): value is number => isSafeInteger(value) && value > 0;

/**
 * 判断值是否为非负安全整数。
 *
 * 包含 0。
 *
 * @param value - 待判断的值。
 * @returns 值为大于等于 0 的安全整数时返回 `true`。
 */
export const isNonNegativeSafeInteger = (value: unknown): value is number => isSafeInteger(value) && value >= 0;

/**
 * 判断数字是否处于指定闭区间。
 *
 * 只接受有限数字。区间两端均包含。
 *
 * @param value - 待判断的值。
 * @param min - 区间下界（含）。
 * @param max - 区间上界（含）。
 * @returns 值为有限数字且满足 `min <= value <= max` 时返回 `true`。
 *
 * @example
 * isNumberInRange(5, 1, 10); // true
 */
export const isNumberInRange = (value: unknown, min: number, max: number): value is number => isFiniteNumber(value) && value >= min && value <= max;

/**
 * 判断整数是否处于指定闭区间。
 *
 * 区间两端均包含。
 *
 * @param value - 待判断的值。
 * @param min - 区间下界（含）。
 * @param max - 区间上界（含）。
 * @returns 值为整数且满足 `min <= value <= max` 时返回 `true`。
 */
export const isIntegerInRange = (value: unknown, min: number, max: number): value is number => isInteger(value) && value >= min && value <= max;

/* -------------------------------------------------------------------------- */
/*                                   字符串                                    */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为非空字符串。
 *
 * 注意：
 * 空格字符串 `"   "` 会返回 true。
 *
 * @param value - 待判断的值。
 * @returns 值为长度大于 0 的字符串时返回 `true`。
 */
export const isNonEmptyString = (value: unknown): value is string => isString(value) && value.length > 0;

/**
 * 判断是否为非空白字符串。
 *
 * 会忽略首尾空白。
 *
 * @param value - 待判断的值。
 * @returns 去除首尾空白后仍有内容时返回 `true`。
 *
 * @example
 * isNonBlankString("hello"); // true
 * isNonBlankString("   ");   // false
 */
export const isNonBlankString = (value: unknown): value is string => isString(value) && value.trim().length > 0;

/**
 * 判断是否为空字符串。
 *
 * 仅匹配 ""。
 *
 * @param value - 待判断的值。
 * @returns 值严格等于 `""` 时返回 `true`。
 */
export const isEmptyString = (value: unknown): value is "" => value === "";

/**
 * 判断是否为空白字符串。
 *
 * 包括：
 * - ""
 * - " "
 * - "\t"
 * - "\n"
 *
 * @param value - 待判断的值。
 * @returns 值为字符串且去除首尾空白后为空时返回 `true`。
 */
export const isBlankString = (value: unknown): value is string => isString(value) && value.trim().length === 0;

/**
 * 判断字符串长度是否处于指定闭区间。
 *
 * 按 UTF-16 码元计数，与 `String.prototype.length` 一致。区间两端均包含。
 *
 * @param value - 待判断的值。
 * @param min - 最小长度（含）。
 * @param max - 最大长度（含）。
 * @returns 值为字符串且长度满足 `min <= length <= max` 时返回 `true`。
 */
export const isStringLengthInRange = (value: unknown, min: number, max: number): value is string => isString(value) && value.length >= min && value.length <= max;

/**
 * 判断字符串是否匹配指定正则表达式。
 *
 * 调用前会把 `pattern.lastIndex` 重置为 0，避免带 `g` 或 `y` 标志的正则因上次匹配位置导致结果不稳定。该重置会修改传入的正则对象。
 *
 * @param value - 待判断的值。
 * @param pattern - 用于匹配的正则表达式。
 * @returns 值为字符串且匹配成功时返回 `true`。
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
 *
 * 参数列表为 `never[]`，避免在类型层面把任意参数传入未知函数。
 */
export type AnyFunction = (...args: never[]) => unknown;

/**
 * 判断值是否为函数。
 *
 * @param value - 待判断的值。
 * @returns 值为函数时返回 `true`。
 */
export const isFunction = (value: unknown): value is AnyFunction => typeof value === "function";

/**
 * 判断值是否为构造函数。
 *
 * 这里只判断其运行时是否为函数，
 * JavaScript 无法完全可靠地区分普通函数和可 new 的构造函数。
 *
 * @param value - 待判断的值。
 * @returns 值为函数时返回 `true`。只收窄为函数，不收窄为构造签名，因为运行时无法证明它可以 `new`。
 */
export const isConstructor = (value: unknown): value is AnyFunction => typeof value === "function";

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
 *
 * @param value - 待判断的值。
 * @returns 值为非 `null` 对象时返回 `true`。
 */
export const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

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
 *
 * @param value - 待判断的值。
 * @returns 值为非数组对象时返回 `true`，并将类型收窄为 `Record<string, unknown>`。
 */
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

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
 *
 * @param value - 待判断的值。
 * @returns 原型为 `Object.prototype` 或 `null` 时返回 `true`。
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

/**
 * 判断对象是否没有任何自有可枚举字符串属性。
 *
 * 仅接受普通对象。
 *
 * @param value - 待判断的值。
 * @returns 值为普通对象且 `Object.keys` 为空时返回 `true`。
 */
export const isEmptyObject = (value: unknown): value is Record<string, never> => isPlainObject(value) && Object.keys(value).length === 0;

/**
 * 判断对象是否至少包含一个自有可枚举字符串属性。
 *
 * 仅接受普通对象。
 *
 * @param value - 待判断的值。
 * @returns 值为普通对象且至少有一个自有可枚举字符串键时返回 `true`。
 */
export const isNonEmptyObject = (value: unknown): value is Record<string, unknown> => isPlainObject(value) && Object.keys(value).length > 0;

/* -------------------------------------------------------------------------- */
/*                                   属性                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断对象是否拥有指定自有属性。
 *
 * 与 `key in value` 不同：
 * 不检查原型链。
 *
 * @typeParam T - 对象类型。
 * @typeParam K - 属性键类型。
 * @param value - 已确认为对象的值。
 * @param key - 要检查的自有属性键。
 * @returns 对象拥有该自有属性时返回 `true`，并将类型收窄为包含该键的对象。
 */
export const hasOwnProperty = <T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> => Object.prototype.hasOwnProperty.call(value, key);

/**
 * 判断 unknown 值是否拥有指定自有属性。
 *
 * 非对象会直接返回 `false`。不检查原型链。
 *
 * @typeParam K - 属性键类型。
 * @param value - 待判断的值。
 * @param key - 要检查的自有属性键。
 * @returns 值为对象且拥有该自有属性时返回 `true`。
 */
export const hasOwn = <K extends PropertyKey>(value: unknown, key: K): value is Record<K, unknown> => isObject(value) && Object.prototype.hasOwnProperty.call(value, key);

/**
 * 判断值是否拥有指定属性。
 *
 * 会检查原型链。
 *
 * 如果只想判断对象自己的字段，
 * 优先使用 hasOwn。
 *
 * @typeParam K - 属性键类型。
 * @param value - 待判断的值。
 * @param key - 要检查的属性键，包含原型链上的属性。
 * @returns 值为对象且 `key in value` 成立时返回 `true`。
 */
export const hasProperty = <K extends PropertyKey>(value: unknown, key: K): value is Record<K, unknown> => isObject(value) && key in value;

/**
 * 判断对象是否同时拥有多个指定自有属性。
 *
 * 不检查原型链。`keys` 为空数组时，只要值是对象就返回 `true`。
 *
 * @typeParam K - 属性键类型。
 * @param value - 待判断的值。
 * @param keys - 必须全部存在的自有属性键。
 * @returns 值为对象且同时拥有这些自有属性时返回 `true`。
 */
export const hasOwnProperties = <K extends PropertyKey>(value: unknown, keys: readonly K[]): value is Record<K, unknown> =>
  isObject(value) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

/**
 * 判断 key 是否是对象已有属性。
 *
 * 主要用于解决 Object.keys / 动态 key 的类型收窄。会检查原型链。
 *
 * @typeParam T - 对象类型。
 * @param value - 已确认为对象的值。
 * @param key - 待收窄的属性键。
 * @returns `key in value` 成立时返回 `true`，并将 `key` 收窄为 `keyof T`。
 */
export const isKeyOf = <T extends object>(value: T, key: PropertyKey): key is keyof T => key in value;

/* -------------------------------------------------------------------------- */
/*                                   数组                                      */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为数组。
 *
 * 元素类型被收窄为 unknown。
 *
 * @param value - 待判断的值。
 * @returns 值为数组时返回 `true`。
 */
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

/**
 * 判断是否为空数组。
 *
 * @param value - 待判断的值。
 * @returns 值为长度为 0 的数组时返回 `true`，并将类型收窄为 `[]`。
 */
export const isEmptyArray = (value: unknown): value is [] => Array.isArray(value) && value.length === 0;

/**
 * 判断是否为非空数组。
 *
 * 通过元组类型保证第一个元素一定存在。元素类型保持 `unknown`，因为运行时不校验元素。
 *
 * @param value - 待判断的值。
 * @returns 值为长度大于 0 的数组时返回 `true`。
 */
export const isNonEmptyArray = (value: unknown): value is [unknown, ...unknown[]] => Array.isArray(value) && value.length > 0;

/**
 * 判断是否为指定类型元素组成的数组。
 *
 * @typeParam T - 元素类型。
 * @param value - 待判断的值。
 * @param guard - 用于校验每个元素的类型守卫。
 * @returns 值为数组且每个元素都通过 `guard` 时返回 `true`。
 *
 * @example
 * const value: unknown = ["a", "b"];
 *
 * if (isArrayOf(value, isString)) {
 *   // value: string[]
 * }
 */
export const isArrayOf = <T>(value: unknown, guard: TypeGuard<T>): value is T[] => Array.isArray(value) && value.every(guard);

/**
 * 判断是否为指定类型元素组成的非空数组。
 *
 * @typeParam T - 元素类型。
 * @param value - 待判断的值。
 * @param guard - 用于校验每个元素的类型守卫。
 * @returns 值为非空数组且每个元素都通过 `guard` 时返回 `true`。
 */
export const isNonEmptyArrayOf = <T>(value: unknown, guard: TypeGuard<T>): value is [T, ...T[]] => Array.isArray(value) && value.length > 0 && value.every(guard);

/**
 * 判断数组长度是否为指定值。
 *
 * @param value - 待判断的值。
 * @param length - 期望的数组长度。
 * @returns 值为数组且 `value.length === length` 时返回 `true`。
 */
export const isArrayLength = (value: unknown, length: number): value is unknown[] => Array.isArray(value) && value.length === length;

/* -------------------------------------------------------------------------- */
/*                              内置对象 / 集合                                */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为有效 Date。
 *
 * 会排除 Invalid Date。跨 realm 的 `Date` 实例可能无法通过 `instanceof`。
 *
 * @param value - 待判断的值。
 * @returns 值为 `Date` 且时间戳有效时返回 `true`。
 */
export const isDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

/**
 * 判断是否为 RegExp。
 *
 * @param value - 待判断的值。
 * @returns 值为 `RegExp` 实例时返回 `true`。
 */
export const isRegExp = (value: unknown): value is RegExp => value instanceof RegExp;

/**
 * 判断是否为 Map。
 *
 * @param value - 待判断的值。
 * @returns 值为 `Map` 实例时返回 `true`。键和值类型收窄为 `unknown`。
 */
export const isMap = (value: unknown): value is Map<unknown, unknown> => value instanceof Map;

/**
 * 判断是否为 Set。
 *
 * @param value - 待判断的值。
 * @returns 值为 `Set` 实例时返回 `true`。元素类型收窄为 `unknown`。
 */
export const isSet = (value: unknown): value is Set<unknown> => value instanceof Set;

/**
 * 判断是否为 WeakMap。
 *
 * @param value - 待判断的值。
 * @returns 值为 `WeakMap` 实例时返回 `true`。
 */
export const isWeakMap = (value: unknown): value is WeakMap<object, unknown> => value instanceof WeakMap;

/**
 * 判断是否为 WeakSet。
 *
 * @param value - 待判断的值。
 * @returns 值为 `WeakSet` 实例时返回 `true`。
 */
export const isWeakSet = (value: unknown): value is WeakSet<object> => value instanceof WeakSet;

/**
 * 判断是否为 Error 实例。
 *
 * 包括 `Error` 的子类，例如 `TypeError`。
 *
 * @param value - 待判断的值。
 * @returns 值为 `Error` 实例时返回 `true`。
 */
export const isError = (value: unknown): value is Error => value instanceof Error;

/**
 * 判断是否为 ArrayBuffer。
 *
 * @param value - 待判断的值。
 * @returns 值为 `ArrayBuffer` 实例时返回 `true`。
 */
export const isArrayBuffer = (value: unknown): value is ArrayBuffer => value instanceof ArrayBuffer;

/**
 * 判断是否为 DataView。
 *
 * @param value - 待判断的值。
 * @returns 值为 `DataView` 实例时返回 `true`。
 */
export const isDataView = (value: unknown): value is DataView => value instanceof DataView;

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
 *
 * @param value - 待判断的值。
 * @returns 值为 TypedArray 时返回 `true`。
 */
export const isTypedArray = (value: unknown): value is Exclude<ArrayBufferView, DataView> => ArrayBuffer.isView(value) && !(value instanceof DataView);

/* -------------------------------------------------------------------------- */
/*                               Promise / 异步                                */
/* -------------------------------------------------------------------------- */

/**
 * 判断是否为原生 Promise。
 *
 * 注意：
 * iframe / realm 场景下 instanceof 可能失效。
 *
 * 兑现值类型保持 `unknown`，因为运行时不校验兑现值。
 *
 * @param value - 待判断的值。
 * @returns 值为当前 realm 的 `Promise` 实例时返回 `true`。
 */
export const isPromise = (value: unknown): value is Promise<unknown> => value instanceof Promise;

/**
 * 判断是否为 PromiseLike / Thenable。
 *
 * 比 instanceof Promise 更适合：
 * - 第三方 Promise 实现
 * - 跨 realm
 * - 自定义 thenable
 *
 * 兑现值类型保持 `unknown`，因为运行时不校验兑现值。
 *
 * @param value - 待判断的值。
 * @returns 值为对象或函数，且拥有函数类型的 `then` 属性时返回 `true`。
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === "object" || typeof value === "function") && value !== null && "then" in value && typeof value.then === "function";
}

/* -------------------------------------------------------------------------- */
/*                                  枚举 / 字面量                              */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否严格等于指定字面量。
 *
 * 使用 `Object.is` 比较，因此 `NaN` 与 `NaN` 相等，`+0` 与 `-0` 不相等。
 *
 * @typeParam T - 字面量类型。
 * @param value - 待判断的值。
 * @param literal - 期望相等的字面量。
 * @returns 两者 `Object.is` 相等时返回 `true`，并将类型收窄为 `T`。
 *
 * @example
 * isLiteral(value, "running")
 */
export const isLiteral = <const T>(value: unknown, literal: T): value is T => Object.is(value, literal);

/**
 * 判断值是否属于指定字面量集合。
 *
 * 非常适合替代大量：
 *
 * value === "a" || value === "b" || value === "c"
 *
 * 使用 `Object.is` 逐项比较。
 *
 * @typeParam T - 字面量元组类型。
 * @param value - 待判断的值。
 * @param values - 允许的字面量集合。
 * @returns 集合中存在与 `value` 严格相等的项时返回 `true`。
 *
 * @example
 * const STATUS = ["idle", "running", "success"] as const;
 *
 * if (isOneOf(value, STATUS)) {
 *   // value: "idle" | "running" | "success"
 * }
 */
export const isOneOf = <const T extends readonly unknown[]>(value: unknown, values: T): value is T[number] => values.some((item) => Object.is(item, value));

/**
 * 判断字符串是否属于指定字符串字面量集合。
 *
 * @typeParam T - 字符串字面量元组类型。
 * @param value - 待判断的值。
 * @param values - 允许的字符串字面量集合。
 * @returns 值为字符串且包含在集合中时返回 `true`。
 */
export const isStringLiteral = <const T extends readonly string[]>(value: unknown, values: T): value is T[number] => isString(value) && values.includes(value);

/**
 * 判断数字是否属于指定数字字面量集合。
 *
 * 先要求值为有效 number（排除 `NaN`）。`NaN` 无法通过 `includes` 匹配。
 *
 * @typeParam T - 数字字面量元组类型。
 * @param value - 待判断的值。
 * @param values - 允许的数字字面量集合。
 * @returns 值为有效数字且包含在集合中时返回 `true`。
 */
export const isNumberLiteral = <const T extends readonly number[]>(value: unknown, values: T): value is T[number] => isNumber(value) && values.includes(value);

/* -------------------------------------------------------------------------- */
/*                                类型守卫组合器                               */
/* -------------------------------------------------------------------------- */

/**
 * 标准类型守卫函数。
 *
 * @typeParam T - 守卫通过后收窄到的类型。
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * 提取类型守卫对应的目标类型。
 *
 * 传入的类型不是 {@link TypeGuard} 时结果为 `never`。
 *
 * @typeParam T - 类型守卫函数的类型。
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
 * @typeParam T - 原守卫收窄到的类型。
 * @param guard - 用于校验非 `undefined` 值的类型守卫。
 * @returns 接受 `T | undefined` 的类型守卫。`undefined` 直接通过，其余值交给 `guard`。
 *
 * @example
 * const isOptionalString = optional(isString);
 *
 * isOptionalString(undefined); // true
 * isOptionalString("abc");     // true
 */
export const optional =
  <T>(guard: TypeGuard<T>): TypeGuard<T | undefined> =>
  (value: unknown): value is T | undefined =>
    value === undefined || guard(value);

/**
 * 创建“可空值”类型守卫。
 *
 * 允许 null。
 *
 * @typeParam T - 原守卫收窄到的类型。
 * @param guard - 用于校验非 `null` 值的类型守卫。
 * @returns 接受 `T | null` 的类型守卫。`null` 直接通过，其余值交给 `guard`。
 */
export const nullable =
  <T>(guard: TypeGuard<T>): TypeGuard<T | null> =>
  (value: unknown): value is T | null =>
    value === null || guard(value);

/**
 * 创建允许 null 和 undefined 的类型守卫。
 *
 * @typeParam T - 原守卫收窄到的类型。
 * @param guard - 用于校验非空值的类型守卫。
 * @returns 接受 `T | null | undefined` 的类型守卫。`null` 和 `undefined` 直接通过。
 */
export const nullish =
  <T>(guard: TypeGuard<T>): TypeGuard<T | null | undefined> =>
  (value: unknown): value is T | null | undefined =>
    value == null || guard(value);

/**
 * 创建数组类型守卫。
 *
 * 空数组会通过校验。
 *
 * @typeParam T - 数组元素类型。
 * @param guard - 用于校验每个元素的类型守卫。
 * @returns 接受 `T[]` 的类型守卫。
 *
 * @example
 * const isStringArray = arrayOf(isString);
 */
export const arrayOf =
  <T>(guard: TypeGuard<T>): TypeGuard<T[]> =>
  (value: unknown): value is T[] =>
    Array.isArray(value) && value.every(guard);

/**
 * 创建联合类型守卫。
 *
 * 只要任意一个守卫通过即可。声明了 2 个和 3 个守卫的重载，以便保留具体联合类型；更多守卫时结果为 `unknown`。
 *
 * @typeParam A - 第一个守卫的目标类型。
 * @typeParam B - 第二个守卫的目标类型。
 * @typeParam C - 第三个守卫的目标类型。
 * @param guardA - 第一个类型守卫。
 * @param guardB - 第二个类型守卫。
 * @param guardC - 第三个类型守卫。
 * @returns 任一守卫通过即返回 `true` 的联合类型守卫。
 *
 * @example
 * const isStringOrNumber = union(isString, isNumber);
 */
export function union<A, B>(guardA: TypeGuard<A>, guardB: TypeGuard<B>): TypeGuard<A | B>;

export function union<A, B, C>(guardA: TypeGuard<A>, guardB: TypeGuard<B>, guardC: TypeGuard<C>): TypeGuard<A | B | C>;

export function union(...guards: TypeGuard<unknown>[]): TypeGuard<unknown> {
  return (value: unknown): value is unknown => guards.some((guard) => guard(value));
}

/**
 * 创建指定字面量集合的类型守卫。
 *
 * 使用 `Object.is` 比较。
 *
 * @typeParam T - 字面量元组类型。
 * @param values - 允许的字面量。
 * @returns 值属于这些字面量之一时返回 `true` 的类型守卫。
 *
 * @example
 * const isStatus = literalUnion(
 *   "idle",
 *   "running",
 *   "success",
 * );
 */
export const literalUnion =
  <const T extends readonly unknown[]>(...values: T): TypeGuard<T[number]> =>
  (value: unknown): value is T[number] =>
    values.some((item) => Object.is(item, value));

/**
 * 创建 instanceof 类型守卫。
 *
 * 跨 realm 的实例可能无法通过 `instanceof`。
 *
 * @typeParam T - 构造函数的实例类型。
 * @param constructor - 用于 `instanceof` 判断的构造函数。
 * @returns 值为该构造函数实例时返回 `true` 的类型守卫。
 *
 * @example
 * const isCustomError = instanceOf(CustomError);
 */
export const instanceOf =
  <T>(constructor: abstract new (...args: never[]) => T): TypeGuard<T> =>
  (value: unknown): value is T =>
    value instanceof constructor;

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
 *
 * @typeParam T - 字段名到类型守卫的映射。
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
 * @typeParam T - Schema 类型。
 * @param schema - 字段名到类型守卫的映射。
 * @returns 校验通过时把值收窄为 {@link InferGuardSchema} 的类型守卫。
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
 *
 * 包括 `string`、`number`、`boolean` 和 `null`。
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON 对象。
 *
 * 键为字符串，值递归为 {@link JsonValue}。
 */
export type JsonObject = {
  [key: string]: JsonValue;
};

/**
 * JSON 数组。
 *
 * 元素递归为 {@link JsonValue}。
 */
export type JsonArray = JsonValue[];

/**
 * 任意合法 JSON 值。
 *
 * 由 {@link JsonPrimitive}、{@link JsonObject} 或 {@link JsonArray} 组成。
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
 *
 * @param value - 待判断的值。
 * @returns 值为 `null`、字符串、布尔值或有限数字时返回 `true`。
 */
export const isJsonPrimitive = (value: unknown): value is JsonPrimitive => value === null || isString(value) || isBoolean(value) || isFiniteNumber(value);

/**
 * 判断是否为合法 JSON 值。
 *
 * 会递归检查对象和数组。只接受普通对象，`Date`、`Map` 等内置对象返回 `false`。
 *
 * 注意：
 * 对非常深层或循环引用对象不建议调用此函数。循环引用会导致无限递归。
 *
 * @param value - 待判断的值。
 * @returns 值及其嵌套内容都是合法 JSON 时返回 `true`。
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
 *
 * `null` 和 `undefined` 返回 `false`。
 *
 * @param value - 待判断的值。
 * @returns 值实现了 `Symbol.iterator` 且其类型为函数时返回 `true`。
 */
export function isIterable(value: unknown): value is Iterable<unknown> {
  if (typeof value === "string") {
    return true;
  }

  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }

  return Symbol.iterator in value && typeof value[Symbol.iterator] === "function";
}

/**
 * 判断值是否为异步可迭代对象。
 *
 * `null` 和 `undefined` 返回 `false`。
 *
 * @param value - 待判断的值。
 * @returns 值实现了 `Symbol.asyncIterator` 且其类型为函数时返回 `true`。
 */
export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }

  return Symbol.asyncIterator in value && typeof value[Symbol.asyncIterator] === "function";
}

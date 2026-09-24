/**
 * 企业级断言工具。
 *
 * 断言在运行时校验失败时抛出 {@link AssertionError}，并在类型层面收窄值。
 * 判断逻辑复用类型守卫，不重复实现规则。
 *
 * 默认错误消息只描述期望类型和可选的字段名，不写入被校验的值，避免把凭证、
 * 个人数据或请求体带进日志与错误上报。
 */

import {
  type AnyFunction,
  type GuardSchema,
  type InferGuardSchema,
  type JsonPrimitive,
  type JsonValue,
  type TypeGuard,
  hasOwn,
  hasOwnProperties,
  hasOwnProperty,
  hasProperty,
  isArray,
  isArrayBuffer,
  isArrayLength,
  isArrayOf,
  isAsyncIterable,
  isBigInt,
  isBlankString,
  isBoolean,
  isDataView,
  isDate,
  isEmptyArray,
  isEmptyObject,
  isEmptyString,
  isError,
  isFiniteNumber,
  isFunction,
  isConstructor,
  isInteger,
  isIntegerInRange,
  isIterable,
  isJsonPrimitive,
  isJsonValue,
  isKeyOf,
  isLiteral,
  isMap,
  isNaNValue,
  isNegativeNumber,
  isNil,
  isNonBlankString,
  isNonEmptyArray,
  isNonEmptyArrayOf,
  isNonEmptyObject,
  isNonEmptyString,
  isNonNegativeInteger,
  isNonNegativeNumber,
  isNonNegativeSafeInteger,
  isNull,
  isNumber,
  isNumberInRange,
  isNumberLiteral,
  isObject,
  isOneOf,
  isPlainObject,
  isPositiveInteger,
  isPositiveNumber,
  isPositiveSafeInteger,
  isPrimitive,
  isPromise,
  isPromiseLike,
  isRecord,
  isRegExp,
  isSafeInteger,
  isSet,
  isString,
  isStringLengthInRange,
  isStringLiteral,
  isSymbol,
  isTypedArray,
  isUndefined,
  isWeakMap,
  isWeakSet,
  matchesPattern,
  objectOf,
} from "./type.js";

/** 断言失败时的附加选项。 */
export interface AssertOptions {
  /**
   * 覆盖默认错误消息。
   *
   * 不要把被校验的值写入消息。
   */
  readonly message?: string;
  /**
   * 被校验的参数或字段名，只参与默认消息。
   */
  readonly name?: string;
  /** 导致本次断言失败的原因。 */
  readonly cause?: unknown;
}

/**
 * 断言失败错误。
 *
 * `code` 固定为 `ASSERTION_FAILED`，便于日志和监控聚合。
 * `expected` 描述期望条件，`subject` 是调用方提供的字段名。
 */
export class AssertionError extends Error {
  readonly code = "ASSERTION_FAILED" as const;
  readonly expected: string;
  readonly subject: string | undefined;

  /**
   * @param expected - 期望条件的可读描述。
   * @param options - 消息、字段名和原因。
   */
  constructor(expected: string, options: AssertOptions = {}) {
    super(options.message ?? formatAssertMessage(options.name, expected), options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AssertionError";
    this.expected = expected;
    this.subject = options.name;
  }
}

/**
 * 断言条件为真。
 *
 * 只排除假值，不会按自定义类型守卫收窄。需要类型收窄时使用 {@link assertGuard}。
 *
 * @param condition - 必须为真的条件。
 * @param message - 失败时的错误消息。
 * @throws {@link AssertionError} 条件为假值时抛出。
 */
export function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) {
    throw new AssertionError("a truthy value", { message });
  }
}

/**
 * 用类型守卫断言值，并收窄为守卫的目标类型。
 *
 * @typeParam T - 守卫通过后的类型。
 * @param value - 待断言的值。
 * @param guard - 类型守卫。
 * @param expected - 失败消息中的期望描述。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 守卫不通过时抛出。
 */
export function assertGuard<T>(value: unknown, guard: TypeGuard<T>, expected: string, options?: AssertOptions): asserts value is T {
  if (!guard(value)) {
    throw new AssertionError(expected, options);
  }
}

/**
 * 标记按类型不可能到达的分支。
 *
 * @param value - 应当为 `never` 的值。运行时如果到达此处，说明调用方的类型收窄不完整。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 总是抛出。
 */
export function assertNever(value: never, options?: AssertOptions): never {
  void value;
  throw new AssertionError("an unreachable value", options);
}

/**
 * 断言值既不是 null 也不是 undefined。
 *
 * @typeParam T - 含空值的输入类型。
 * @param value - 待断言的值。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值为 `null` 或 `undefined` 时抛出。
 */
export function assertNonNil<T>(value: T, options?: AssertOptions): asserts value is NonNullable<T> {
  if (value == null) {
    throw new AssertionError("a non-nullish value", options);
  }
}

type ValueAssert<T> = (value: unknown, options?: AssertOptions) => asserts value is T;

function defineAssert<T>(guard: TypeGuard<T>, expected: string): ValueAssert<T> {
  return (value: unknown, options?: AssertOptions): asserts value is T => {
    assertGuard(value, guard, expected, options);
  };
}

/** 断言值为 null。失败时抛出 {@link AssertionError}。 */
export const assertNull: ValueAssert<null> = defineAssert(isNull, "null");

/** 断言值为 undefined。失败时抛出 {@link AssertionError}。 */
export const assertUndefined: ValueAssert<undefined> = defineAssert(isUndefined, "undefined");

/** 断言值为 null 或 undefined。失败时抛出 {@link AssertionError}。 */
export const assertNil: ValueAssert<null | undefined> = defineAssert(isNil, "null or undefined");

/** 断言值为字符串。失败时抛出 {@link AssertionError}。 */
export const assertString: ValueAssert<string> = defineAssert(isString, "a string");

/** 断言值为布尔值。失败时抛出 {@link AssertionError}。 */
export const assertBoolean: ValueAssert<boolean> = defineAssert(isBoolean, "a boolean");

/** 断言值为 bigint。失败时抛出 {@link AssertionError}。 */
export const assertBigInt: ValueAssert<bigint> = defineAssert(isBigInt, "a bigint");

/** 断言值为 symbol。失败时抛出 {@link AssertionError}。 */
export const assertSymbol: ValueAssert<symbol> = defineAssert(isSymbol, "a symbol");

/** 断言值为 JavaScript 原始值。失败时抛出 {@link AssertionError}。 */
export const assertPrimitive: ValueAssert<string | number | bigint | boolean | symbol | null | undefined> = defineAssert(isPrimitive, "a primitive");

/** 断言值为非 NaN 的 number。失败时抛出 {@link AssertionError}。 */
export const assertNumber: ValueAssert<number> = defineAssert(isNumber, "a number");

/** 断言值为 NaN。失败时抛出 {@link AssertionError}。 */
export const assertNaN: ValueAssert<number> = defineAssert(isNaNValue, "NaN");

/** 断言值为有限数字。失败时抛出 {@link AssertionError}。 */
export function assertFiniteNumber(value: unknown, options?: AssertOptions): asserts value is number {
  assertGuard(value, isFiniteNumber, "a finite number", options);
}

/** 断言值为整数。失败时抛出 {@link AssertionError}。 */
export const assertInteger: ValueAssert<number> = defineAssert(isInteger, "an integer");

/** 断言值为安全整数。失败时抛出 {@link AssertionError}。 */
export const assertSafeInteger: ValueAssert<number> = defineAssert(isSafeInteger, "a safe integer");

/** 断言值为大于 0 的有限数字。失败时抛出 {@link AssertionError}。 */
export const assertPositiveNumber: ValueAssert<number> = defineAssert(isPositiveNumber, "a positive number");

/** 断言值为大于等于 0 的有限数字。失败时抛出 {@link AssertionError}。 */
export function assertNonNegativeNumber(value: unknown, options?: AssertOptions): asserts value is number {
  assertGuard(value, isNonNegativeNumber, "a non-negative number", options);
}

/** 断言值为小于 0 的有限数字。失败时抛出 {@link AssertionError}。 */
export const assertNegativeNumber: ValueAssert<number> = defineAssert(isNegativeNumber, "a negative number");

/** 断言值为正整数。失败时抛出 {@link AssertionError}。 */
export const assertPositiveInteger: ValueAssert<number> = defineAssert(isPositiveInteger, "a positive integer");

/** 断言值为非负整数。失败时抛出 {@link AssertionError}。 */
export const assertNonNegativeInteger: ValueAssert<number> = defineAssert(isNonNegativeInteger, "a non-negative integer");

/** 断言值为正安全整数。失败时抛出 {@link AssertionError}。 */
export const assertPositiveSafeInteger: ValueAssert<number> = defineAssert(isPositiveSafeInteger, "a positive safe integer");

/** 断言值为非负安全整数。失败时抛出 {@link AssertionError}。 */
export const assertNonNegativeSafeInteger: ValueAssert<number> = defineAssert(isNonNegativeSafeInteger, "a non-negative safe integer");

/** 断言值为非空字符串。空白字符串可以通过。失败时抛出 {@link AssertionError}。 */
export const assertNonEmptyString: ValueAssert<string> = defineAssert(isNonEmptyString, "a non-empty string");

/** 断言值为去除首尾空白后仍非空的字符串。失败时抛出 {@link AssertionError}。 */
export const assertNonBlankString: ValueAssert<string> = defineAssert(isNonBlankString, "a non-blank string");

/** 断言值严格等于空字符串。失败时抛出 {@link AssertionError}。 */
export const assertEmptyString: ValueAssert<""> = defineAssert(isEmptyString, "an empty string");

/** 断言值为空白字符串。失败时抛出 {@link AssertionError}。 */
export const assertBlankString: ValueAssert<string> = defineAssert(isBlankString, "a blank string");

/** 断言值为函数。失败时抛出 {@link AssertionError}。 */
export const assertFunction: ValueAssert<AnyFunction> = defineAssert(isFunction, "a function");

/** 断言值为非 null 对象。数组可以通过，函数不行。失败时抛出 {@link AssertionError}。 */
export const assertObject: ValueAssert<object> = defineAssert(isObject, "a non-null object");

/** 断言值为非数组对象。失败时抛出 {@link AssertionError}。 */
export const assertRecord: ValueAssert<Record<string, unknown>> = defineAssert(isRecord, "a non-array object");

/** 断言值为普通对象。失败时抛出 {@link AssertionError}。 */
export const assertPlainObject: ValueAssert<Record<string, unknown>> = defineAssert(isPlainObject, "a plain object");

/** 断言值为没有自有可枚举字符串属性的普通对象。失败时抛出 {@link AssertionError}。 */
export const assertEmptyObject: ValueAssert<Record<string, never>> = defineAssert(isEmptyObject, "an empty plain object");

/** 断言值为至少有一个自有可枚举字符串属性的普通对象。失败时抛出 {@link AssertionError}。 */
export const assertNonEmptyObject: ValueAssert<Record<string, unknown>> = defineAssert(isNonEmptyObject, "a non-empty plain object");

/** 断言值为数组。失败时抛出 {@link AssertionError}。 */
export const assertArray: ValueAssert<unknown[]> = defineAssert(isArray, "an array");

/** 断言值为空数组。失败时抛出 {@link AssertionError}。 */
export const assertEmptyArray: ValueAssert<[]> = defineAssert(isEmptyArray, "an empty array");

/** 断言值为有效 Date。失败时抛出 {@link AssertionError}。 */
export const assertDate: ValueAssert<Date> = defineAssert(isDate, "a valid Date");

/** 断言值为 RegExp。失败时抛出 {@link AssertionError}。 */
export const assertRegExp: ValueAssert<RegExp> = defineAssert(isRegExp, "a RegExp");

/** 断言值为 Map。失败时抛出 {@link AssertionError}。 */
export const assertMap: ValueAssert<Map<unknown, unknown>> = defineAssert(isMap, "a Map");

/** 断言值为 Set。失败时抛出 {@link AssertionError}。 */
export const assertSet: ValueAssert<Set<unknown>> = defineAssert(isSet, "a Set");

/** 断言值为 WeakMap。失败时抛出 {@link AssertionError}。 */
export const assertWeakMap: ValueAssert<WeakMap<object, unknown>> = defineAssert(isWeakMap, "a WeakMap");

/** 断言值为 WeakSet。失败时抛出 {@link AssertionError}。 */
export const assertWeakSet: ValueAssert<WeakSet<object>> = defineAssert(isWeakSet, "a WeakSet");

/** 断言值为当前 realm 的 Error 实例。失败时抛出 {@link AssertionError}。 */
export const assertError: ValueAssert<Error> = defineAssert(isError, "an Error");

/** 断言值为 ArrayBuffer。失败时抛出 {@link AssertionError}。 */
export const assertArrayBuffer: ValueAssert<ArrayBuffer> = defineAssert(isArrayBuffer, "an ArrayBuffer");

/** 断言值为 DataView。失败时抛出 {@link AssertionError}。 */
export const assertDataView: ValueAssert<DataView> = defineAssert(isDataView, "a DataView");

/** 断言值为 TypedArray。失败时抛出 {@link AssertionError}。 */
export const assertTypedArray: ValueAssert<Exclude<ArrayBufferView, DataView>> = defineAssert(isTypedArray, "a TypedArray");

/** 断言值为 JSON 原始值。失败时抛出 {@link AssertionError}。 */
export const assertJsonPrimitive: ValueAssert<JsonPrimitive> = defineAssert(isJsonPrimitive, "a JSON primitive");

/** 断言值为合法 JSON 值。失败时抛出 {@link AssertionError}。 */
export const assertJsonValue: ValueAssert<JsonValue> = defineAssert(isJsonValue, "a JSON value");

/** 断言值为可迭代对象。失败时抛出 {@link AssertionError}。 */
export const assertIterable: ValueAssert<Iterable<unknown>> = defineAssert(isIterable, "an iterable");

/** 断言值为异步可迭代对象。失败时抛出 {@link AssertionError}。 */
export const assertAsyncIterable: ValueAssert<AsyncIterable<unknown>> = defineAssert(isAsyncIterable, "an async iterable");

/**
 * 断言值为非空数组。
 *
 * 不校验元素类型，元素保持 `unknown`。
 *
 * @param value - 待断言的值。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是非空数组时抛出。
 */
export function assertNonEmptyArray(value: unknown, options?: AssertOptions): asserts value is [unknown, ...unknown[]] {
  if (!isNonEmptyArray(value)) {
    throw new AssertionError("a non-empty array", options);
  }
}

/**
 * 断言值为当前 realm 的 Promise。
 *
 * 不校验兑现值的类型，兑现值保持 `unknown`。
 *
 * @param value - 待断言的值。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是 Promise 时抛出。
 */
export function assertPromise(value: unknown, options?: AssertOptions): asserts value is Promise<unknown> {
  if (!isPromise(value)) {
    throw new AssertionError("a Promise", options);
  }
}

/**
 * 断言值为 thenable。
 *
 * 兑现值保持 `unknown`，因为运行时不校验兑现值。
 *
 * @param value - 待断言的值。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值没有函数类型的 `then` 时抛出。
 */
export function assertPromiseLike(value: unknown, options?: AssertOptions): asserts value is PromiseLike<unknown> {
  if (!isPromiseLike(value)) {
    throw new AssertionError("a thenable", options);
  }
}

/**
 * 断言值为函数，并按构造签名收窄。
 *
 * 运行时无法可靠区分普通函数和可 `new` 的构造函数，因此只收窄为函数。
 *
 * @param value - 待断言的值。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是函数时抛出。
 */
export function assertConstructor(value: unknown, options?: AssertOptions): asserts value is AnyFunction {
  if (!isConstructor(value)) {
    throw new AssertionError("a constructor", options);
  }
}

/**
 * 断言有限数字处于指定闭区间。
 *
 * @param value - 待断言的值。
 * @param min - 区间下界（含）。
 * @param max - 区间上界（含）。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是该区间内的有限数字时抛出。
 */
export function assertNumberInRange(value: unknown, min: number, max: number, options?: AssertOptions): asserts value is number {
  if (!isNumberInRange(value, min, max)) {
    throw new AssertionError(`a finite number from ${min} to ${max}`, options);
  }
}

/**
 * 断言整数处于指定闭区间。
 *
 * @param value - 待断言的值。
 * @param min - 区间下界（含）。
 * @param max - 区间上界（含）。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是该区间内的整数时抛出。
 */
export function assertIntegerInRange(value: unknown, min: number, max: number, options?: AssertOptions): asserts value is number {
  if (!isIntegerInRange(value, min, max)) {
    throw new AssertionError(`an integer from ${min} to ${max}`, options);
  }
}

/**
 * 断言字符串长度处于指定闭区间。
 *
 * 长度按 UTF-16 码元计数。
 *
 * @param value - 待断言的值。
 * @param min - 最小长度（含）。
 * @param max - 最大长度（含）。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是该长度区间内的字符串时抛出。
 */
export function assertStringLengthInRange(value: unknown, min: number, max: number, options?: AssertOptions): asserts value is string {
  if (!isStringLengthInRange(value, min, max)) {
    throw new AssertionError(`a string with length from ${min} to ${max}`, options);
  }
}

/**
 * 断言字符串匹配正则。
 *
 * 会把 `pattern.lastIndex` 重置为 0。
 *
 * @param value - 待断言的值。
 * @param pattern - 用于匹配的正则表达式。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是字符串或匹配失败时抛出。
 */
export function assertPattern(value: unknown, pattern: RegExp, options?: AssertOptions): asserts value is string {
  if (!matchesPattern(value, pattern)) {
    throw new AssertionError("a string matching the pattern", options);
  }
}

/**
 * 断言对象拥有指定自有属性。
 *
 * @typeParam T - 对象类型。
 * @typeParam K - 属性键类型。
 * @param value - 已确认为对象的值。
 * @param key - 自有属性键。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 对象没有该自有属性时抛出。
 */
export function assertOwnProperty<T extends object, K extends PropertyKey>(value: T, key: K, options?: AssertOptions): asserts value is T & Record<K, unknown> {
  if (!hasOwnProperty(value, key)) {
    throw new AssertionError("an object with the own property", options);
  }
}

/**
 * 断言值为对象且拥有指定自有属性。
 *
 * @typeParam K - 属性键类型。
 * @param value - 待断言的值。
 * @param key - 自有属性键。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是对象或没有该自有属性时抛出。
 */
export function assertOwn<K extends PropertyKey>(value: unknown, key: K, options?: AssertOptions): asserts value is Record<K, unknown> {
  if (!hasOwn(value, key)) {
    throw new AssertionError("an object with the own property", options);
  }
}

/**
 * 断言值为对象且拥有指定属性，包含原型链。
 *
 * @typeParam K - 属性键类型。
 * @param value - 待断言的值。
 * @param key - 属性键。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是对象或属性不存在时抛出。
 */
export function assertProperty<K extends PropertyKey>(value: unknown, key: K, options?: AssertOptions): asserts value is Record<K, unknown> {
  if (!hasProperty(value, key)) {
    throw new AssertionError("an object with the property", options);
  }
}

/**
 * 断言值为对象且同时拥有多个自有属性。
 *
 * @typeParam K - 属性键类型。
 * @param value - 待断言的值。
 * @param keys - 必须全部存在的自有属性键。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 任一自有属性缺失时抛出。
 */
export function assertOwnProperties<K extends PropertyKey>(value: unknown, keys: readonly K[], options?: AssertOptions): asserts value is Record<K, unknown> {
  if (!hasOwnProperties(value, keys)) {
    throw new AssertionError("an object with the own properties", options);
  }
}

/**
 * 断言 key 属于对象的属性名，并收窄 key。
 *
 * @typeParam T - 对象类型。
 * @param value - 已确认为对象的值。
 * @param key - 待收窄的属性键。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} `key in value` 不成立时抛出。
 */
export function assertKeyOf<T extends object>(value: T, key: PropertyKey, options?: AssertOptions): asserts key is keyof T {
  if (!isKeyOf(value, key)) {
    throw new AssertionError("a key of the object", options);
  }
}

/**
 * 断言值为指定元素类型的数组。
 *
 * @typeParam T - 元素类型。
 * @param value - 待断言的值。
 * @param guard - 元素类型守卫。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是数组或任一元素不通过守卫时抛出。
 */
export function assertArrayOf<T>(value: unknown, guard: TypeGuard<T>, options?: AssertOptions): asserts value is T[] {
  if (!isArrayOf(value, guard)) {
    throw new AssertionError("an array of the expected item type", options);
  }
}

/**
 * 断言值为指定元素类型的非空数组。
 *
 * @typeParam T - 元素类型。
 * @param value - 待断言的值。
 * @param guard - 元素类型守卫。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是非空数组或任一元素不通过守卫时抛出。
 */
export function assertNonEmptyArrayOf<T>(value: unknown, guard: TypeGuard<T>, options?: AssertOptions): asserts value is [T, ...T[]] {
  if (!isNonEmptyArrayOf(value, guard)) {
    throw new AssertionError("a non-empty array of the expected item type", options);
  }
}

/**
 * 断言数组长度为指定值。
 *
 * @param value - 待断言的值。
 * @param length - 期望长度。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是该长度的数组时抛出。
 */
export function assertArrayLength(value: unknown, length: number, options?: AssertOptions): asserts value is unknown[] {
  if (!isArrayLength(value, length)) {
    throw new AssertionError(`an array of length ${length}`, options);
  }
}

/**
 * 断言值与字面量严格相等。
 *
 * 使用 `Object.is` 比较。
 *
 * @typeParam T - 字面量类型。
 * @param value - 待断言的值。
 * @param literal - 期望相等的字面量。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 两者不 `Object.is` 相等时抛出。
 */
export function assertLiteral<const T>(value: unknown, literal: T, options?: AssertOptions): asserts value is T {
  if (!isLiteral(value, literal)) {
    throw new AssertionError("the expected literal", options);
  }
}

/**
 * 断言值属于指定字面量集合。
 *
 * @typeParam T - 字面量元组类型。
 * @param value - 待断言的值。
 * @param values - 允许的字面量集合。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不在集合中时抛出。
 */
export function assertOneOf<const T extends readonly unknown[]>(value: unknown, values: T, options?: AssertOptions): asserts value is T[number] {
  if (!isOneOf(value, values)) {
    throw new AssertionError("one of the expected literals", options);
  }
}

/**
 * 断言字符串属于指定字符串字面量集合。
 *
 * @typeParam T - 字符串字面量元组类型。
 * @param value - 待断言的值。
 * @param values - 允许的字符串字面量集合。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是集合中的字符串时抛出。
 */
export function assertStringLiteral<const T extends readonly string[]>(value: unknown, values: T, options?: AssertOptions): asserts value is T[number] {
  if (!isStringLiteral(value, values)) {
    throw new AssertionError("one of the expected strings", options);
  }
}

/**
 * 断言数字属于指定数字字面量集合。
 *
 * @typeParam T - 数字字面量元组类型。
 * @param value - 待断言的值。
 * @param values - 允许的数字字面量集合。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是集合中的有效数字时抛出。
 */
export function assertNumberLiteral<const T extends readonly number[]>(value: unknown, values: T, options?: AssertOptions): asserts value is T[number] {
  if (!isNumberLiteral(value, values)) {
    throw new AssertionError("one of the expected numbers", options);
  }
}

/**
 * 断言值是指定构造函数的实例。
 *
 * @typeParam T - 实例类型。
 * @param value - 待断言的值。
 * @param constructor - 构造函数。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} `value instanceof constructor` 不成立时抛出。
 */
export function assertInstanceOf<T>(value: unknown, constructor: abstract new (...args: never[]) => T, options?: AssertOptions): asserts value is T {
  if (!(value instanceof constructor)) {
    throw new AssertionError(`an instance of ${constructor.name || "the constructor"}`, options);
  }
}

/**
 * 按 Schema 断言普通对象的已声明字段。
 *
 * 不限制额外属性。字段校验失败时不会在错误消息中包含字段值。
 *
 * @typeParam T - Schema 类型。
 * @param value - 待断言的值。
 * @param schema - 字段名到类型守卫的映射。
 * @param options - 消息、字段名和原因。
 * @throws {@link AssertionError} 值不是对象或任一声明字段校验失败时抛出。
 */
export function assertObjectOf<const T extends GuardSchema>(value: unknown, schema: T, options?: AssertOptions): asserts value is InferGuardSchema<T> {
  if (!objectOf(schema)(value)) {
    throw new AssertionError("an object matching the schema", options);
  }
}

function formatAssertMessage(name: string | undefined, expected: string): string {
  return name === undefined ? `Expected ${expected}` : `${name} must be ${expected}`;
}

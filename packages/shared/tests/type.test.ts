import { describe, expect, expectTypeOf, it } from "vitest";

import {
  arrayOf,
  type GuardType,
  hasOwn,
  hasOwnProperties,
  hasOwnProperty,
  hasProperty,
  instanceOf,
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
  isNonNil,
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
  literalUnion,
  matchesPattern,
  nullable,
  nullish,
  objectOf,
  optional,
  union,
} from "../src/type.js";

class User {
  constructor(readonly id: string) {}
}

describe("基础类型", () => {
  it("区分 null、undefined 和空值", () => {
    expect(isNull(null)).toBe(true);
    expect(isNull(undefined)).toBe(false);
    expect(isUndefined(undefined)).toBe(true);
    expect(isUndefined(null)).toBe(false);
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    expect(isNil(0)).toBe(false);
    expect(isNonNil(0)).toBe(true);
    expect(isNonNil("")).toBe(true);
    expect(isNonNil(null)).toBe(false);
    expect(isNonNil(undefined)).toBe(false);
  });

  it("识别原始值并排除对象与函数", () => {
    expect(isString("a")).toBe(true);
    expect(isString(new String("a"))).toBe(false);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(0)).toBe(false);
    expect(isBigInt(1n)).toBe(true);
    expect(isSymbol(Symbol("a"))).toBe(true);
    expect(isPrimitive("a")).toBe(true);
    expect(isPrimitive(1n)).toBe(true);
    expect(isPrimitive(null)).toBe(true);
    expect(isPrimitive(undefined)).toBe(true);
    expect(isPrimitive({})).toBe(false);
    expect(isPrimitive(() => undefined)).toBe(false);
    expect(isFunction(() => undefined)).toBe(true);
    expect(isFunction(class {})).toBe(true);
    expect(isFunction({})).toBe(false);
  });
});

describe("数字", () => {
  it("按 NaN、无穷和安全整数边界区分", () => {
    expect(isNumber(1)).toBe(true);
    expect(isNumber(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(false);
    expect(isNumber("1")).toBe(false);
    expect(isNaNValue(Number.NaN)).toBe(true);
    expect(isNaNValue("x")).toBe(false);
    expect(isFiniteNumber(1.5)).toBe(true);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isInteger(1.0)).toBe(true);
    expect(isInteger(1.5)).toBe(false);
    expect(isSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isPositiveNumber(0.1)).toBe(true);
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNonNegativeNumber(0)).toBe(true);
    expect(isNegativeNumber(-0.1)).toBe(true);
    expect(isNegativeNumber(-0)).toBe(false);
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isNonNegativeInteger(0)).toBe(true);
    expect(isPositiveSafeInteger(1)).toBe(true);
    expect(isNonNegativeSafeInteger(0)).toBe(true);
    expect(isNonNegativeSafeInteger(-1)).toBe(false);
  });

  it("闭区间包含端点并拒绝非数字", () => {
    expect(isNumberInRange(1, 1, 10)).toBe(true);
    expect(isNumberInRange(10, 1, 10)).toBe(true);
    expect(isNumberInRange(0, 1, 10)).toBe(false);
    expect(isNumberInRange(Number.NaN, 1, 10)).toBe(false);
    expect(isIntegerInRange(2, 1, 3)).toBe(true);
    expect(isIntegerInRange(1.5, 1, 3)).toBe(false);
  });
});

describe("字符串", () => {
  it("区分空字符串和空白字符串", () => {
    expect(isNonEmptyString(" ")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonBlankString(" a ")).toBe(true);
    expect(isNonBlankString(" \n\t ")).toBe(false);
    expect(isEmptyString("")).toBe(true);
    expect(isEmptyString(" ")).toBe(false);
    expect(isBlankString("")).toBe(true);
    expect(isBlankString("\t")).toBe(true);
    expect(isBlankString("a")).toBe(false);
    expect(isStringLengthInRange("ab", 1, 2)).toBe(true);
    expect(isStringLengthInRange("abc", 1, 2)).toBe(false);
    expect(isStringLengthInRange(1, 1, 2)).toBe(false);
  });

  it("匹配前重置 lastIndex，避免全局正则状态泄漏", () => {
    const pattern = /a/g;
    pattern.lastIndex = 1;
    expect(matchesPattern("a", pattern)).toBe(true);
    expect(matchesPattern("a", pattern)).toBe(true);
    expect(matchesPattern(1, /a/)).toBe(false);
  });
});

describe("对象与属性", () => {
  it("区分对象、记录和普通对象", () => {
    const plain = { id: 1 };
    expect(isObject([])).toBe(true);
    expect(isObject(new Date())).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject(() => undefined)).toBe(false);
    expect(isRecord(plain)).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(new Date())).toBe(true);
    expect(isPlainObject(plain)).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new User("1"))).toBe(false);
    expect(isEmptyObject({})).toBe(true);
    expect(isEmptyObject(Object.create(null))).toBe(true);
    expect(isEmptyObject(plain)).toBe(false);
    expect(isEmptyObject(new Date())).toBe(false);
    expect(isNonEmptyObject(plain)).toBe(true);
    expect(isNonEmptyObject({})).toBe(false);
  });

  it("自有属性和原型链属性分开判断", () => {
    const value = Object.create({ inherited: true }) as { inherited: boolean };
    value.own = 1;
    expect(hasOwnProperty(value, "own")).toBe(true);
    expect(hasOwnProperty(value, "inherited")).toBe(false);
    expect(hasOwn(value, "own")).toBe(true);
    expect(hasOwn(null, "own")).toBe(false);
    expect(hasProperty(value, "inherited")).toBe(true);
    expect(hasProperty(null, "inherited")).toBe(false);
    expect(hasOwnProperties(value, ["own"])).toBe(true);
    expect(hasOwnProperties(value, ["own", "missing"])).toBe(false);
    expect(hasOwnProperties({}, [])).toBe(true);
    expect(isKeyOf(value, "inherited")).toBe(true);
    expect(isKeyOf(value, "missing")).toBe(false);
  });
});

describe("数组与内置对象", () => {
  it("区分空数组、非空数组和元素类型", () => {
    expect(isArray([])).toBe(true);
    expect(isArray("a")).toBe(false);
    expect(isEmptyArray([])).toBe(true);
    expect(isEmptyArray([1])).toBe(false);
    expect(isNonEmptyArray([1])).toBe(true);
    expect(isNonEmptyArray([])).toBe(false);
    expect(isArrayOf(["a"], isString)).toBe(true);
    expect(isArrayOf(["a", 1], isString)).toBe(false);
    expect(isArrayOf("a", isString)).toBe(false);
    expect(isNonEmptyArrayOf(["a"], isString)).toBe(true);
    expect(isNonEmptyArrayOf([], isString)).toBe(false);
    expect(isArrayLength([1, 2], 2)).toBe(true);
    expect(isArrayLength([1], 2)).toBe(false);
  });

  it("识别内置实例并排除无效 Date 和 DataView", () => {
    expect(isDate(new Date("2020-01-01"))).toBe(true);
    expect(isDate(new Date("invalid"))).toBe(false);
    expect(isRegExp(/a/)).toBe(true);
    expect(isMap(new Map())).toBe(true);
    expect(isSet(new Set())).toBe(true);
    expect(isWeakMap(new WeakMap())).toBe(true);
    expect(isWeakSet(new WeakSet())).toBe(true);
    expect(isError(new TypeError("x"))).toBe(true);
    expect(isError({ name: "Error", message: "x" })).toBe(false);
    const buffer = new ArrayBuffer(1);
    expect(isArrayBuffer(buffer)).toBe(true);
    const view = new DataView(buffer);
    expect(isDataView(view)).toBe(true);
    expect(isTypedArray(new Uint8Array(1))).toBe(true);
    expect(isTypedArray(view)).toBe(false);
  });
});

describe("Promise、字面量和组合器", () => {
  it("区分原生 Promise 和 thenable", () => {
    expect(isPromise(Promise.resolve(1))).toBe(true);
    const thenable = { then: () => undefined };
    expect(isPromise(thenable)).toBe(false);
    expect(isPromiseLike(thenable)).toBe(true);
    expect(isPromiseLike({ then: true })).toBe(false);
    expect(isPromiseLike(null)).toBe(false);
  });

  it("按 Object.is 比较字面量", () => {
    expect(isLiteral(Number.NaN, Number.NaN)).toBe(true);
    expect(isLiteral(0, -0)).toBe(false);
    expect(isOneOf("running", ["idle", "running"] as const)).toBe(true);
    expect(isOneOf("failed", ["idle", "running"] as const)).toBe(false);
    expect(isStringLiteral("idle", ["idle"] as const)).toBe(true);
    expect(isStringLiteral(1, ["idle"] as const)).toBe(false);
    expect(isNumberLiteral(1, [1, 2] as const)).toBe(true);
    expect(isNumberLiteral(Number.NaN, [Number.NaN] as const)).toBe(false);
  });

  it("组合守卫保留通过条件", () => {
    const isOptionalString = optional(isString);
    const isNullableString = nullable(isString);
    const isNullishString = nullish(isString);
    expect(isOptionalString(undefined)).toBe(true);
    expect(isOptionalString(null)).toBe(false);
    expect(isNullableString(null)).toBe(true);
    expect(isNullableString(undefined)).toBe(false);
    expect(isNullishString(null)).toBe(true);
    expect(isNullishString(undefined)).toBe(true);
    expect(arrayOf(isString)([])).toBe(true);
    expect(arrayOf(isString)(["a", 1])).toBe(false);
    expect(union(isString, isNumber)(1)).toBe(true);
    expect(union(isString, isNumber, isBoolean)(false)).toBe(true);
    expect(union(isString, isNumber)(false)).toBe(false);
    expect(literalUnion("idle", "running")("idle")).toBe(true);
    expect(literalUnion("idle", "running")("failed")).toBe(false);
    expect(instanceOf(User)(new User("1"))).toBe(true);
    expect(instanceOf(User)({})).toBe(false);
  });

  it("objectOf 只校验声明字段并允许额外字段", () => {
    const isUser = objectOf({
      id: isString,
      age: optional(isPositiveInteger),
    });
    expect(isUser({ id: "1", extra: true })).toBe(true);
    expect(isUser({ id: "1", age: undefined })).toBe(true);
    expect(isUser({ id: 1 })).toBe(false);
    expect(isUser([])).toBe(false);
  });
});

describe("JSON 与可迭代对象", () => {
  it("只接受可序列化为 JSON 的值", () => {
    expect(isJsonPrimitive(null)).toBe(true);
    expect(isJsonPrimitive(1)).toBe(true);
    expect(isJsonPrimitive(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isJsonPrimitive(undefined)).toBe(false);
    expect(isJsonValue({ items: [1, "a", true, null] })).toBe(true);
    expect(isJsonValue({ value: undefined })).toBe(false);
    expect(isJsonValue([undefined])).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);
    expect(isJsonValue(() => undefined)).toBe(false);
  });

  it("识别同步和异步可迭代对象", () => {
    expect(isIterable("ab")).toBe(true);
    expect(isIterable(new Set())).toBe(true);
    expect(isIterable(null)).toBe(false);
    expect(isIterable({})).toBe(false);
    expect(isAsyncIterable((async function* () {})())).toBe(true);
    expect(isAsyncIterable([])).toBe(false);
  });
});

describe("类型推导", () => {
  it("从类型守卫提取目标类型", () => {
    expectTypeOf<GuardType<typeof isString>>().toEqualTypeOf<string>();
    expectTypeOf<GuardType<typeof isNonEmptyArray>>().toEqualTypeOf<[unknown, ...unknown[]]>();
  });
});

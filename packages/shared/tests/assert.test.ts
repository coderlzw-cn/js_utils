import { describe, expect, expectTypeOf, it } from "vitest";

import {
  assert,
  assertArray,
  assertArrayLength,
  assertArrayOf,
  assertAsyncIterable,
  assertBigInt,
  assertBlankString,
  assertBoolean,
  assertConstructor,
  assertDataView,
  assertDate,
  assertEmptyArray,
  assertEmptyObject,
  assertEmptyString,
  assertError,
  assertFiniteNumber,
  assertFunction,
  assertGuard,
  assertInstanceOf,
  assertInteger,
  assertIntegerInRange,
  assertIterable,
  assertJsonPrimitive,
  assertJsonValue,
  assertKeyOf,
  assertLiteral,
  assertMap,
  assertNaN,
  assertNegativeNumber,
  assertNever,
  assertNil,
  assertNonBlankString,
  assertNonEmptyArray,
  assertNonEmptyArrayOf,
  assertNonEmptyObject,
  assertNonEmptyString,
  assertNonNegativeInteger,
  assertNonNegativeNumber,
  assertNonNegativeSafeInteger,
  assertNonNil,
  assertNull,
  assertNumber,
  assertNumberInRange,
  assertNumberLiteral,
  assertObject,
  assertObjectOf,
  assertOneOf,
  assertOwn,
  assertOwnProperties,
  assertOwnProperty,
  assertPattern,
  assertPlainObject,
  assertPositiveInteger,
  assertPositiveNumber,
  assertPositiveSafeInteger,
  assertPrimitive,
  assertPromise,
  assertPromiseLike,
  assertProperty,
  assertRecord,
  assertRegExp,
  assertSafeInteger,
  assertSet,
  assertString,
  assertStringLengthInRange,
  assertStringLiteral,
  assertSymbol,
  assertTypedArray,
  assertUndefined,
  assertWeakMap,
  assertWeakSet,
  AssertionError,
  assertArrayBuffer,
} from "../src/assert.js";
import { isString, optional, isPositiveInteger } from "../src/type.js";

const SECRET = "SECRET_VALUE";

class Box {
  constructor(readonly value: number) {}
}

function expectFailure(run: () => void, message: string): AssertionError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AssertionError);
    const assertionError = error as AssertionError;
    expect(assertionError.code).toBe("ASSERTION_FAILED");
    expect(assertionError.message).toBe(message);
    expect(assertionError.message).not.toContain(SECRET);
    return assertionError;
  }
  throw new Error("Expected assertion to throw");
}

describe("AssertionError", () => {
  it("默认消息只描述期望，字段名参与消息", () => {
    const error = expectFailure(() => assertString(1), "Expected a string");
    expect(error.expected).toBe("a string");
    expect(error.subject).toBeUndefined();
    expect(error.name).toBe("AssertionError");

    const named = expectFailure(() => assertString(1, { name: "id" }), "id must be a string");
    expect(named.subject).toBe("id");
  });

  it("自定义消息覆盖默认消息并保留 cause", () => {
    const cause = new Error("upstream");
    const error = expectFailure(() => assertString(1, { message: "id 无效", cause }), "id 无效");
    expect(error.cause).toBe(cause);
  });
});

describe("通用断言", () => {
  it("assert 只接受真值", () => {
    expect(() => assert(1)).not.toThrow();
    expectFailure(() => assert(0), "Assertion failed");
    expectFailure(() => assert(false, "条件不成立"), "条件不成立");
  });

  it("assertGuard 使用传入的类型守卫", () => {
    const value: unknown = "ok";
    assertGuard(value, isString, "a string");
    expect(value).toBe("ok");
    expectFailure(() => assertGuard(1, isString, "a string", { name: "label" }), "label must be a string");
  });

  it("assertNonNil 排除 null 和 undefined", () => {
    const value = 0 as number | null;
    assertNonNil(value);
    expect(value).toBe(0);
    expectFailure(() => assertNonNil(null, { name: "user" }), "user must be a non-nullish value");
  });

  it("assertNever 总是抛出且不把值写入消息", () => {
    expectFailure(() => assertNever(SECRET as never), "Expected an unreachable value");
  });
});

describe("单值断言", () => {
  it.each([
    ["null", assertNull, null],
    ["undefined", assertUndefined, undefined],
    ["nil", assertNil, null],
    ["string", assertString, "a"],
    ["boolean", assertBoolean, false],
    ["bigint", assertBigInt, 1n],
    ["symbol", assertSymbol, Symbol("a")],
    ["primitive", assertPrimitive, 1],
    ["number", assertNumber, Number.POSITIVE_INFINITY],
    ["NaN", assertNaN, Number.NaN],
    ["finite number", assertFiniteNumber, 1.5],
    ["integer", assertInteger, 2],
    ["safe integer", assertSafeInteger, Number.MAX_SAFE_INTEGER],
    ["positive number", assertPositiveNumber, 0.1],
    ["non-negative number", assertNonNegativeNumber, 0],
    ["negative number", assertNegativeNumber, -1],
    ["positive integer", assertPositiveInteger, 1],
    ["non-negative integer", assertNonNegativeInteger, 0],
    ["positive safe integer", assertPositiveSafeInteger, 1],
    ["non-negative safe integer", assertNonNegativeSafeInteger, 0],
    ["non-empty string", assertNonEmptyString, " "],
    ["non-blank string", assertNonBlankString, " a "],
    ["empty string", assertEmptyString, ""],
    ["blank string", assertBlankString, "\n"],
    ["function", assertFunction, () => undefined],
    ["object", assertObject, []],
    ["record", assertRecord, { id: 1 }],
    ["plain object", assertPlainObject, Object.create(null)],
    ["empty object", assertEmptyObject, {}],
    ["non-empty object", assertNonEmptyObject, { id: 1 }],
    ["array", assertArray, [1]],
    ["empty array", assertEmptyArray, []],
    ["date", assertDate, new Date("2020-01-01")],
    ["regexp", assertRegExp, /a/],
    ["map", assertMap, new Map()],
    ["set", assertSet, new Set()],
    ["weak map", assertWeakMap, new WeakMap()],
    ["weak set", assertWeakSet, new WeakSet()],
    ["error", assertError, new Error("x")],
    ["array buffer", assertArrayBuffer, new ArrayBuffer(1)],
    ["data view", assertDataView, new DataView(new ArrayBuffer(1))],
    ["typed array", assertTypedArray, new Uint8Array(1)],
    ["json primitive", assertJsonPrimitive, null],
    ["json value", assertJsonValue, { items: [1, true, null] }],
    ["iterable", assertIterable, "ab"],
    ["async iterable", assertAsyncIterable, (async function* () {})()],
  ] as const)("通过：%s", (_label, assertValue, value) => {
    expect(() => assertValue(value)).not.toThrow();
  });

  it("拒绝不符合期望的值，并且消息不包含该值", () => {
    expectFailure(() => assertNumber(SECRET), "Expected a number");
    expectFailure(() => assertNumber(Number.NaN), "Expected a number");
    expectFailure(() => assertFiniteNumber(Number.POSITIVE_INFINITY), "Expected a finite number");
    expectFailure(() => assertPositiveNumber(0), "Expected a positive number");
    expectFailure(() => assertNonBlankString("  "), "Expected a non-blank string");
    expectFailure(() => assertPlainObject(new Date()), "Expected a plain object");
    expectFailure(() => assertRecord([]), "Expected a non-array object");
    expectFailure(() => assertDate(new Date("invalid")), "Expected a valid Date");
    expectFailure(() => assertTypedArray(new DataView(new ArrayBuffer(1))), "Expected a TypedArray");
    expectFailure(() => assertJsonValue({ token: 1n }), "Expected a JSON value");
    expectFailure(() => assertError({ name: "Error", message: SECRET }), "Expected an Error");
  });
});

describe("带参数的断言", () => {
  it("收窄数组、区间、属性和字面量", () => {
    const items: unknown = ["a"];
    assertNonEmptyArray(items);
    expect(items[0]).toBe("a");
    expectFailure(() => assertNonEmptyArray([]), "Expected a non-empty array");

    assertArrayOf(["a"], isString);
    expectFailure(() => assertArrayOf([SECRET, 1], isString), "Expected an array of the expected item type");
    assertNonEmptyArrayOf(["a"], isString);
    expectFailure(() => assertNonEmptyArrayOf([], isString), "Expected a non-empty array of the expected item type");
    assertArrayLength([1, 2], 2);
    expectFailure(() => assertArrayLength([1], 2), "Expected an array of length 2");

    assertNumberInRange(1, 1, 10);
    expectFailure(() => assertNumberInRange(SECRET, 1, 10), "Expected a finite number from 1 to 10");
    assertIntegerInRange(2, 1, 3);
    expectFailure(() => assertIntegerInRange(1.5, 1, 3), "Expected an integer from 1 to 3");
    assertStringLengthInRange("ab", 1, 2);
    expectFailure(() => assertStringLengthInRange(SECRET, 1, 2), "Expected a string with length from 1 to 2");

    const pattern = /a/g;
    pattern.lastIndex = 1;
    assertPattern("a", pattern);
    assertPattern("a", pattern);

    const target = { id: 1 };
    assertOwnProperty(target, "id");
    assertOwn(target, "id");
    expectFailure(() => assertOwn(null, "id"), "Expected an object with the own property");
    const inherited = Object.create({ kind: "user" }) as { kind: string };
    assertProperty(inherited, "kind");
    expectFailure(() => assertOwn(inherited, "kind"), "Expected an object with the own property");
    assertOwnProperties(target, ["id"]);
    expect(() => assertOwnProperties({}, [])).not.toThrow();
    expectFailure(() => assertOwnProperties(target, ["missing"]), "Expected an object with the own properties");

    const key: PropertyKey = "id";
    assertKeyOf(target, key);
    expect(key).toBe("id");
    expectFailure(() => assertKeyOf(target, "missing"), "Expected a key of the object");

    assertLiteral("running", "running");
    expectFailure(() => assertLiteral(0, -0), "Expected the expected literal");
    assertOneOf("idle", ["idle", "running"] as const);
    expectFailure(() => assertOneOf(SECRET, ["idle"] as const), "Expected one of the expected literals");
    assertStringLiteral("idle", ["idle"] as const);
    assertNumberLiteral(1, [1, 2] as const);
    expectFailure(() => assertNumberLiteral(Number.NaN, [Number.NaN] as const), "Expected one of the expected numbers");
  });

  it("断言 Promise、构造函数、实例和 Schema", () => {
    expect(() => assertPromise(Promise.resolve(1))).not.toThrow();
    const thenable = { then: () => undefined };
    expect(() => assertPromiseLike(thenable)).not.toThrow();
    expectFailure(() => assertPromise(thenable), "Expected a Promise");
    expect(() => assertConstructor(class {})).not.toThrow();
    expectFailure(() => assertConstructor({}), "Expected a constructor");

    const box: unknown = new Box(1);
    assertInstanceOf(box, Box);
    expect(box.value).toBe(1);
    expectFailure(() => assertInstanceOf({}, Box), "Expected an instance of Box");

    const data: unknown = { id: "1", age: 2, extra: true };
    assertObjectOf(data, { id: isString, age: optional(isPositiveInteger) });
    expect(data.id).toBe("1");
    expectFailure(() => assertObjectOf({ id: SECRET }, { id: isPositiveInteger }, { name: "payload" }), "payload must be an object matching the schema");
  });
});

describe("断言签名", () => {
  it("失败错误带有稳定错误码", () => {
    expectTypeOf<AssertionError["code"]>().toEqualTypeOf<"ASSERTION_FAILED">();
  });
});

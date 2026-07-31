/**
 * 对象的读取、转换、克隆、比较与合并工具。
 *
 * 本模块只使用 ECMAScript 标准 API，可同时运行于现代 Node.js 和浏览器环境。
 */

/** 字符串、数字或 Symbol 属性键。 */
export type ObjectPathKey = PropertyKey;

/** 深度合并配置。 */
export interface DeepMergeOptions {
  /**
   * 数组的合并方式。`replace` 使用后出现的数组替换已有数组，`concat` 按顺序拼接。
   *
   * @default "replace"
   */
  readonly arrayStrategy?: "replace" | "concat";
  /**
   * 是否忽略值为 `undefined` 的属性，避免可选配置意外覆盖默认值。
   *
   * @default true
   */
  readonly skipUndefined?: boolean;
}

/** 判断未知值是否为非 null 对象或函数。 */
export function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * 判断未知值是否为普通对象。
 *
 * 仅接受原型为 `Object.prototype` 或 `null` 的对象；数组、类实例、日期、Map 等
 * 均返回 `false`。该判断适合配置合并和 JSON 风格数据校验。
 */
export function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype === null) {
    return true;
  }

  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  return (
    typeof constructor === "function" &&
    Function.prototype.toString.call(constructor) === OBJECT_CONSTRUCTOR_SOURCE
  );
}

/**
 * 类型安全地判断对象是否直接拥有指定属性，不会受属性名覆盖或原型链影响。
 */
export function hasOwn<Key extends PropertyKey>(
  value: object,
  key: Key,
): value is object & Record<Key, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * 从对象中选择指定的自有属性，并保留其属性描述符。
 *
 * 不存在或位于原型链上的属性会被忽略；`__proto__` 等特殊键通过属性描述符安全写入，
 * 不会修改结果对象的原型。
 */
export function pick<T extends object, Key extends keyof T>(
  value: T,
  keys: readonly Key[],
): Pick<T, Key> {
  const result: Partial<Pick<T, Key>> = {};

  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor) {
      Object.defineProperty(result, key, descriptor);
    }
  }

  return result as Pick<T, Key>;
}

/**
 * 创建排除指定自有属性后的浅拷贝，并保留其余属性描述符和 Symbol 属性。
 *
 * 与对象展开语法不同，本函数也会保留不可枚举属性及 getter/setter。
 */
export function omit<T extends object, Key extends keyof T>(
  value: T,
  keys: readonly Key[],
): Omit<T, Key> {
  const excludedKeys = new Set<PropertyKey>(keys);
  const result = {};

  for (const key of Reflect.ownKeys(value)) {
    if (excludedKeys.has(key)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor) {
      Object.defineProperty(result, key, descriptor);
    }
  }

  return result as Omit<T, Key>;
}

/**
 * 按属性键数组安全读取深层自有属性。
 *
 * 仅遍历自有属性，不读取原型链，因而不会通过 `constructor.prototype` 等路径访问
 * 继承对象。路径不存在时返回 fallback。
 *
 * @example
 * getIn({ user: { profile: { name: "Ada" } } }, ["user", "profile", "name"]); // "Ada"
 */
export function getIn<Result = unknown>(
  value: unknown,
  path: readonly ObjectPathKey[],
): Result | undefined;
export function getIn<Result = unknown, Fallback = undefined>(
  value: unknown,
  path: readonly ObjectPathKey[],
  fallback: Fallback,
): Result | Fallback;
export function getIn<Result = unknown, Fallback = undefined>(
  value: unknown,
  path: readonly ObjectPathKey[],
  fallback?: Fallback,
): Result | Fallback {
  let current = value;

  for (const key of path) {
    if (!isObjectLike(current) || !hasOwn(current, key)) {
      return fallback as Fallback;
    }
    current = current[key];
  }

  return current as Result;
}

/**
 * 转换对象的所有可枚举自有属性值，保留字符串键和 Symbol 键。
 *
 * 回调会依次收到属性值、属性键和原对象。输出为普通对象，所有结果属性均为
 * 可写、可枚举、可配置的数据属性。
 */
export function mapValues<T extends object, Result>(
  value: T,
  mapper: (propertyValue: T[keyof T], key: keyof T, source: T) => Result,
): Record<keyof T, Result> {
  const result = {} as Record<keyof T, Result>;

  for (const key of getEnumerableOwnKeys(value) as (keyof T)[]) {
    defineDataProperty(result, key, mapper(value[key], key, value));
  }

  return result;
}

/**
 * 深度克隆常见 ECMAScript 数据结构，并正确保留循环引用和共享引用关系。
 *
 * 支持普通对象、数组、Date、RegExp、Map、Set、ArrayBuffer、SharedArrayBuffer、
 * DataView、TypedArray、URL、URLSearchParams、装箱原始值，以及将状态存储在自有
 * 属性中的类实例。类的语言私有字段无法枚举，不在克隆范围内。函数和 Symbol
 * 等不可变值按引用保留。Promise、WeakMap、WeakSet、WeakRef 和
 * FinalizationRegistry 无法可靠复制，因此会抛出 `TypeError`。
 *
 * @example
 * const source = { createdAt: new Date(), items: new Map([["id", 1]]) };
 * const cloned = deepClone(source);
 *
 * @throws {TypeError} 遇到无法可靠复制的弱引用结构或 Promise。
 */
export function deepClone<T>(value: T): T {
  return cloneValue(value, new WeakMap<object, unknown>());
}

/**
 * 深度比较两个值是否相等，支持循环引用和常见 ECMAScript 数据结构。
 *
 * 对象需具有相同原型、相同自有属性键及属性描述符；Map 和 Set 按迭代顺序比较，
 * 因而顺序不同但成员相同的集合会被视为不相等。函数按引用比较。
 */
export function deepEqual(first: unknown, second: unknown): boolean {
  return compareValues(first, second, new WeakMap<object, WeakSet<object>>());
}

/**
 * 深度合并一组普通对象，并返回与输入完全解耦的新对象。
 *
 * 仅普通对象会递归合并；Date、Map、Set、类实例等值会被深度克隆后整体替换。
 * 默认忽略 `undefined` 并替换数组。全部属性均通过安全的数据属性写入，包含
 * `__proto__`、`constructor` 的输入也不会污染对象原型。
 *
 * @example
 * deepMerge([{ api: { timeout: 1000 } }, { api: { retries: 3 } }]);
 * // { api: { timeout: 1000, retries: 3 } }
 *
 * @throws {TypeError} sources 包含非普通对象，或遇到无法克隆的数据结构。
 * @throws {RangeError} arrayStrategy 不是 `replace` 或 `concat`。
 */
export function deepMerge<T extends Record<PropertyKey, unknown>>(
  sources: readonly Partial<T>[],
  options: DeepMergeOptions = {},
): T {
  const { arrayStrategy = "replace", skipUndefined = true } = options;
  if (arrayStrategy !== "replace" && arrayStrategy !== "concat") {
    throw new RangeError('arrayStrategy must be either "replace" or "concat"');
  }
  let result: Record<PropertyKey, unknown> = {};

  for (const source of sources) {
    if (!isPlainObject(source)) {
      throw new TypeError("deepMerge sources must contain only plain objects");
    }

    result = mergePlainObjects(result, source, arrayStrategy, skipUndefined);
  }

  return result as T;
}

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (!isObjectLike(value) || typeof value === "function") {
    return value;
  }

  const cached = seen.get(value);
  if (cached !== undefined || seen.has(value)) {
    return cached as T;
  }

  if (isReferenceOnlyObject(value)) {
    throw new TypeError(`${Object.prototype.toString.call(value)} cannot be deep-cloned`);
  }

  if (isBoxedPrimitive(value)) {
    const cloned = Object(getBoxedPrimitiveValue(value));
    seen.set(value, cloned);
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  if (value instanceof Date) {
    const cloned = new Date(value.getTime());
    seen.set(value, cloned);
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  if (value instanceof RegExp) {
    const cloned = new RegExp(value.source, value.flags);
    seen.set(value, cloned);
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  if (value instanceof ArrayBuffer) {
    const cloned = value.slice(0);
    seen.set(value, cloned);
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  if (isSharedArrayBuffer(value)) {
    const cloned = value.slice(0);
    seen.set(value, cloned);
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  if (isUrl(value)) {
    return new URL(value.href) as T;
  }

  if (isUrlSearchParams(value)) {
    return new URLSearchParams(value) as T;
  }

  if (value instanceof DataView) {
    const buffer = value.buffer.slice(0);
    const cloned = new DataView(buffer, value.byteOffset, value.byteLength);
    seen.set(value, cloned);
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  if (ArrayBuffer.isView(value)) {
    // DataView 已在上方处理，其余 TypedArray 均提供保留元素类型的 slice()。
    const cloned = (value as unknown as { slice(): T }).slice();
    seen.set(value, cloned);
    copyOwnProperties(value, cloned as object, seen);
    return cloned;
  }

  if (value instanceof Map) {
    const cloned = new Map<unknown, unknown>();
    seen.set(value, cloned);
    for (const [key, entryValue] of value) {
      cloned.set(cloneValue(key, seen), cloneValue(entryValue, seen));
    }
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  if (value instanceof Set) {
    const cloned = new Set<unknown>();
    seen.set(value, cloned);
    for (const entryValue of value) {
      cloned.add(cloneValue(entryValue, seen));
    }
    copyOwnProperties(value, cloned, seen);
    return cloned as T;
  }

  const cloned = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value) as object | null);
  seen.set(value, cloned);
  copyOwnProperties(value, cloned, seen);
  return cloned as T;
}

function copyOwnProperties(
  source: object,
  target: object,
  seen: WeakMap<object, unknown>,
  shouldSkip: (key: PropertyKey) => boolean = () => false,
): void {
  for (const key of Reflect.ownKeys(source)) {
    if (shouldSkip(key)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) {
      continue;
    }

    if ("value" in descriptor) {
      descriptor.value = cloneValue(descriptor.value, seen);
    }
    Object.defineProperty(target, key, descriptor);
  }
}

function compareValues(
  first: unknown,
  second: unknown,
  compared: WeakMap<object, WeakSet<object>>,
): boolean {
  if (Object.is(first, second)) {
    return true;
  }
  if (!isObjectLike(first) || !isObjectLike(second)) {
    return false;
  }
  // 函数及无法枚举内部状态的弱集合和 Promise 仅支持引用相等。
  if (
    typeof first === "function" ||
    typeof second === "function" ||
    isReferenceOnlyObject(first) ||
    isReferenceOnlyObject(second)
  ) {
    return false;
  }
  if (Object.getPrototypeOf(first) !== Object.getPrototypeOf(second)) {
    return false;
  }

  const previousMatches = compared.get(first);
  if (previousMatches?.has(second)) {
    return true;
  }
  if (previousMatches) {
    previousMatches.add(second);
  } else {
    compared.set(first, new WeakSet([second]));
  }

  if (first instanceof Date && second instanceof Date) {
    return (
      Object.is(first.getTime(), second.getTime()) && compareOwnProperties(first, second, compared)
    );
  }
  if (first instanceof RegExp && second instanceof RegExp) {
    return (
      first.source === second.source &&
      first.flags === second.flags &&
      compareOwnProperties(first, second, compared)
    );
  }
  if (first instanceof ArrayBuffer && second instanceof ArrayBuffer) {
    return (
      compareBytes(new Uint8Array(first), new Uint8Array(second)) &&
      compareOwnProperties(first, second, compared)
    );
  }
  if (isSharedArrayBuffer(first) && isSharedArrayBuffer(second)) {
    return (
      compareBytes(new Uint8Array(first), new Uint8Array(second)) &&
      compareOwnProperties(first, second, compared)
    );
  }
  if (isUrl(first) && isUrl(second)) {
    return first.href === second.href;
  }
  if (isUrlSearchParams(first) && isUrlSearchParams(second)) {
    return first.toString() === second.toString();
  }
  if (isBoxedPrimitive(first) && isBoxedPrimitive(second)) {
    return (
      Object.is(getBoxedPrimitiveValue(first), getBoxedPrimitiveValue(second)) &&
      compareOwnProperties(first, second, compared)
    );
  }
  if (ArrayBuffer.isView(first) && ArrayBuffer.isView(second)) {
    return (
      first.constructor === second.constructor &&
      compareBytes(
        new Uint8Array(first.buffer, first.byteOffset, first.byteLength),
        new Uint8Array(second.buffer, second.byteOffset, second.byteLength),
      ) &&
      compareOwnProperties(first, second, compared)
    );
  }
  if (first instanceof Map && second instanceof Map) {
    if (first.size !== second.size) return false;
    const firstEntries = first.entries();
    const secondEntries = second.entries();
    for (let index = 0; index < first.size; index += 1) {
      const firstEntry = firstEntries.next().value as [unknown, unknown] | undefined;
      const secondEntry = secondEntries.next().value as [unknown, unknown] | undefined;
      if (
        !firstEntry ||
        !secondEntry ||
        !compareValues(firstEntry[0], secondEntry[0], compared) ||
        !compareValues(firstEntry[1], secondEntry[1], compared)
      ) {
        return false;
      }
    }
  } else if (first instanceof Set && second instanceof Set) {
    if (first.size !== second.size) return false;
    const firstValues = first.values();
    const secondValues = second.values();
    for (let index = 0; index < first.size; index += 1) {
      if (!compareValues(firstValues.next().value, secondValues.next().value, compared)) {
        return false;
      }
    }
  }

  return compareOwnProperties(first, second, compared);
}

function compareOwnProperties(
  first: object,
  second: object,
  compared: WeakMap<object, WeakSet<object>>,
): boolean {
  const firstKeys = Reflect.ownKeys(first);
  const secondKeys = Reflect.ownKeys(second);
  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  for (const key of firstKeys) {
    if (!secondKeys.includes(key)) {
      return false;
    }

    const firstDescriptor = Object.getOwnPropertyDescriptor(first, key);
    const secondDescriptor = Object.getOwnPropertyDescriptor(second, key);
    if (
      !firstDescriptor ||
      !secondDescriptor ||
      !compareDescriptors(firstDescriptor, secondDescriptor, compared)
    ) {
      return false;
    }
  }

  return true;
}

function compareDescriptors(
  first: PropertyDescriptor,
  second: PropertyDescriptor,
  compared: WeakMap<object, WeakSet<object>>,
): boolean {
  if (
    first.configurable !== second.configurable ||
    first.enumerable !== second.enumerable ||
    first.writable !== second.writable ||
    first.get !== second.get ||
    first.set !== second.set
  ) {
    return false;
  }

  const firstIsDataDescriptor = "value" in first;
  if (firstIsDataDescriptor !== "value" in second) {
    return false;
  }

  return !firstIsDataDescriptor || compareValues(first.value, second.value, compared);
}

function compareBytes(first: Uint8Array, second: Uint8Array): boolean {
  if (first.byteLength !== second.byteLength) {
    return false;
  }
  for (let index = 0; index < first.byteLength; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }
  return true;
}

function mergePlainObjects(
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>,
  arrayStrategy: NonNullable<DeepMergeOptions["arrayStrategy"]>,
  skipUndefined: boolean,
): Record<PropertyKey, unknown> {
  const result = cloneValue(target, new WeakMap<object, unknown>());

  for (const key of getEnumerableOwnKeys(source)) {
    const sourceValue = source[key];
    if (skipUndefined && sourceValue === undefined) {
      continue;
    }

    const targetValue = result[key];
    let mergedValue: unknown;
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      mergedValue = mergePlainObjects(targetValue, sourceValue, arrayStrategy, skipUndefined);
    } else if (
      arrayStrategy === "concat" &&
      Array.isArray(targetValue) &&
      Array.isArray(sourceValue)
    ) {
      mergedValue = cloneValue([...targetValue, ...sourceValue], new WeakMap<object, unknown>());
    } else {
      mergedValue = cloneValue(sourceValue, new WeakMap<object, unknown>());
    }

    defineDataProperty(result, key, mergedValue);
  }

  return result;
}

function getEnumerableOwnKeys(value: object): PropertyKey[] {
  return Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
}

function defineDataProperty(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function isReferenceOnlyObject(value: object): boolean {
  return (
    value instanceof Promise ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    (typeof WeakRef !== "undefined" && value instanceof WeakRef) ||
    (typeof FinalizationRegistry !== "undefined" && value instanceof FinalizationRegistry)
  );
}

function isSharedArrayBuffer(value: object): value is SharedArrayBuffer {
  return typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer;
}

function isUrl(value: object): value is URL {
  return typeof URL !== "undefined" && value instanceof URL;
}

function isUrlSearchParams(value: object): value is URLSearchParams {
  return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
}

function isBoxedPrimitive(value: object): boolean {
  return BOXED_PRIMITIVE_TAGS.has(Object.prototype.toString.call(value));
}

function getBoxedPrimitiveValue(value: object): string | number | boolean | bigint | symbol {
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object String]") return String.prototype.valueOf.call(value);
  if (tag === "[object Number]") return Number.prototype.valueOf.call(value);
  if (tag === "[object Boolean]") return Boolean.prototype.valueOf.call(value);
  if (tag === "[object BigInt]") return BigInt.prototype.valueOf.call(value);
  if (tag === "[object Symbol]") return Symbol.prototype.valueOf.call(value);
  throw new TypeError("value is not a boxed primitive");
}

const OBJECT_CONSTRUCTOR_SOURCE = Function.prototype.toString.call(Object);
const BOXED_PRIMITIVE_TAGS = new Set([
  "[object String]",
  "[object Number]",
  "[object Boolean]",
  "[object BigInt]",
  "[object Symbol]",
]);

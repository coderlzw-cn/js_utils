/**
 * 数组与集合相关的跨运行时纯函数工具。
 *
 * 本模块不依赖 Node.js 或 DOM API，可同时运行于现代 Node.js 和浏览器环境。
 */

/** 至少包含一个元素的只读数组。 */
export type NonEmptyArray<T> = readonly [T, ...T[]];

/** 数组元素比较器。返回负数、零或正数表示 first 小于、等于或大于 second。 */
export type ArrayComparator<T> = (first: T, second: T) => number;

/** `keyBy` 遇到重复键时的处理配置。 */
export interface KeyByOptions {
  /**
   * 重复键处理方式：覆盖已有值、保留首个值或抛出异常。
   *
   * @default "overwrite"
   */
  readonly onDuplicate?: "overwrite" | "keep-first" | "throw";
}

/** 分页结果。 */
export interface PaginationResult<T> {
  /** 当前页的数据副本。 */
  readonly items: T[];
  /** 当前页码，从 1 开始。 */
  readonly page: number;
  /** 每页最大元素数。 */
  readonly pageSize: number;
  /** 原数组元素总数。 */
  readonly totalItems: number;
  /** 总页数；空数组为 0。 */
  readonly totalPages: number;
  /** 是否存在上一页。 */
  readonly hasPreviousPage: boolean;
  /** 是否存在下一页。 */
  readonly hasNextPage: boolean;
}

/** 判断未知值是否为至少包含一个元素的数组。 */
export function isNonEmptyArray<T>(value: readonly T[]): value is NonEmptyArray<T>;
export function isNonEmptyArray(value: unknown): value is NonEmptyArray<unknown>;
export function isNonEmptyArray(value: unknown): value is NonEmptyArray<unknown> {
  return Array.isArray(value) && value.length > 0;
}

/** 返回数组首个元素；空数组返回 `undefined`。 */
export function first<T>(values: readonly T[]): T | undefined {
  return values[0];
}

/** 返回数组最后一个元素；空数组返回 `undefined`。 */
export function last<T>(values: readonly T[]): T | undefined {
  return values.length === 0 ? undefined : values[values.length - 1];
}

/**
 * 将数组拆分为固定大小的独立分块，不修改原数组。
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
 *
 * @throws {RangeError} size 不是正安全整数。
 */
export function chunk<T>(values: readonly T[], size: number): T[][] {
  assertPositiveSafeInteger(size, "size");
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/**
 * 移除数组中的 `null` 和 `undefined`，同时通过类型守卫缩窄元素类型。
 *
 * 与常见的 compact 实现不同，`false`、`0`、`NaN` 和空字符串会被保留。
 */
export function compactNullish<T>(values: readonly T[]): NonNullable<T>[] {
  return values.filter((value): value is NonNullable<T> => value !== null && value !== undefined);
}

/**
 * 按 SameValueZero 语义去重并保留首次出现顺序。
 *
 * 因而所有 `NaN` 被视为同一个值，`0` 与 `-0` 也被视为相同。
 */
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** 按选择器返回的键去重，保留每个键首次对应的元素和原始顺序。 */
export function uniqueBy<T, Key>(
  values: readonly T[],
  selector: (value: T, index: number, source: readonly T[]) => Key,
): T[] {
  const seen = new Set<Key>();
  const result: T[] = [];

  values.forEach((value, index) => {
    const key = selector(value, index, values);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  });

  return result;
}

/**
 * 按选择器将元素分组为 `Map`。
 *
 * 使用 Map 可支持对象和 Symbol 键，也不会产生 `__proto__` 原型污染。组内元素
 * 保持原始顺序，返回的分组数组均为新数组。
 */
export function groupBy<T, Key>(
  values: readonly T[],
  selector: (value: T, index: number, source: readonly T[]) => Key,
): Map<Key, T[]> {
  const groups = new Map<Key, T[]>();

  values.forEach((value, index) => {
    const key = selector(value, index, values);
    const group = groups.get(key);
    if (group) {
      group.push(value);
    } else {
      groups.set(key, [value]);
    }
  });

  return groups;
}

/**
 * 按选择器将数组索引为 `Map`，支持任意类型的键。
 *
 * @throws {Error} onDuplicate 为 `throw` 且出现重复键。
 * @throws {RangeError} onDuplicate 不是支持的策略。
 */
export function keyBy<T, Key>(
  values: readonly T[],
  selector: (value: T, index: number, source: readonly T[]) => Key,
  options: KeyByOptions = {},
): Map<Key, T> {
  const { onDuplicate = "overwrite" } = options;
  if (onDuplicate !== "overwrite" && onDuplicate !== "keep-first" && onDuplicate !== "throw") {
    throw new RangeError("onDuplicate must be overwrite, keep-first, or throw");
  }

  const indexed = new Map<Key, T>();
  values.forEach((value, index) => {
    const key = selector(value, index, values);
    if (!indexed.has(key)) {
      indexed.set(key, value);
      return;
    }

    if (onDuplicate === "throw") {
      throw new Error(`duplicate key encountered at index ${index}`);
    }
    if (onDuplicate === "overwrite") {
      indexed.set(key, value);
    }
  });

  return indexed;
}

/**
 * 按断言将数组拆分为 `[匹配项, 未匹配项]`，两组均保持原始顺序。
 */
export function partition<T, Matched extends T>(
  values: readonly T[],
  predicate: (value: T, index: number, source: readonly T[]) => value is Matched,
): [matched: Matched[], unmatched: Exclude<T, Matched>[]];
export function partition<T>(
  values: readonly T[],
  predicate: (value: T, index: number, source: readonly T[]) => boolean,
): [matched: T[], unmatched: T[]];
export function partition<T>(
  values: readonly T[],
  predicate: (value: T, index: number, source: readonly T[]) => boolean,
): [matched: T[], unmatched: T[]] {
  const matched: T[] = [];
  const unmatched: T[] = [];

  values.forEach((value, index) => {
    (predicate(value, index, values) ? matched : unmatched).push(value);
  });

  return [matched, unmatched];
}

/**
 * 返回只出现在 values 中的唯一元素，使用 SameValueZero 语义并保留首次出现顺序。
 */
export function difference<T>(values: readonly T[], excluded: readonly T[]): T[] {
  const excludedValues = new Set(excluded);
  return unique(values).filter((value) => !excludedValues.has(value));
}

/** 按选择器键计算差集，结果保留 values 中每个键首次对应的元素。 */
export function differenceBy<T, Key>(
  values: readonly T[],
  excluded: readonly T[],
  selector: (value: T) => Key,
): T[] {
  const excludedKeys = new Set(excluded.map(selector));
  const seen = new Set<Key>();
  const result: T[] = [];

  for (const value of values) {
    const key = selector(value);
    if (!seen.has(key)) {
      seen.add(key);
      if (!excludedKeys.has(key)) {
        result.push(value);
      }
    }
  }

  return result;
}

/**
 * 返回同时出现在两个数组中的唯一元素，使用 SameValueZero 语义并遵循 firstValues 顺序。
 */
export function intersection<T>(firstValues: readonly T[], secondValues: readonly T[]): T[] {
  const secondSet = new Set(secondValues);
  return unique(firstValues).filter((value) => secondSet.has(value));
}

/** 按选择器键计算交集，结果保留 firstValues 中每个键首次对应的元素。 */
export function intersectionBy<T, Key>(
  firstValues: readonly T[],
  secondValues: readonly T[],
  selector: (value: T) => Key,
): T[] {
  const secondKeys = new Set(secondValues.map(selector));
  const seen = new Set<Key>();
  const result: T[] = [];

  for (const value of firstValues) {
    const key = selector(value);
    if (!seen.has(key)) {
      seen.add(key);
      if (secondKeys.has(key)) {
        result.push(value);
      }
    }
  }

  return result;
}

/** 合并多个数组并去重，使用 SameValueZero 语义且保持首次出现顺序。 */
export function union<T>(...arrays: readonly (readonly T[])[]): T[] {
  const result: T[] = [];
  const seen = new Set<T>();

  for (const values of arrays) {
    for (const value of values) {
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
  }

  return result;
}

/**
 * 使用比较器进行稳定排序并返回新数组。
 *
 * 即使运行时排序实现发生变化，相等元素仍会保持原始顺序。原数组不会被修改。
 *
 * @throws {TypeError} 比较器返回 `NaN` 或无穷值。
 */
export function stableSort<T>(values: readonly T[], comparator: ArrayComparator<T>): T[] {
  return values
    .map((value, index) => ({ index, value }))
    .sort((firstEntry, secondEntry) => {
      const comparison = comparator(firstEntry.value, secondEntry.value);
      if (!Number.isFinite(comparison)) {
        throw new TypeError("comparator must return a finite number");
      }
      return comparison === 0 ? firstEntry.index - secondEntry.index : comparison;
    })
    .map(({ value }) => value);
}

/**
 * 在已按 comparator 升序排列的数组中执行二分查找。
 *
 * 找到时返回第一个匹配元素的索引，否则返回 `-1`。为保持 O(log n)，函数不会
 * 验证整个输入是否已排序。
 *
 * @throws {TypeError} 比较器返回 `NaN` 或无穷值。
 */
export function binarySearch<T>(
  values: readonly T[],
  target: T,
  comparator: ArrayComparator<T>,
): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const value = values[middle] as T;
    const comparison = comparator(value, target);
    if (!Number.isFinite(comparison)) {
      throw new TypeError("comparator must return a finite number");
    }

    if (comparison < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  if (low >= values.length) {
    return -1;
  }
  const comparison = comparator(values[low] as T, target);
  if (!Number.isFinite(comparison)) {
    throw new TypeError("comparator must return a finite number");
  }
  return comparison === 0 ? low : -1;
}

/**
 * 返回元素移动后的新数组，索引从 0 开始，原数组不会被修改。
 *
 * @throws {RangeError} fromIndex 或 toIndex 不是数组内的有效安全整数索引。
 */
export function move<T>(values: readonly T[], fromIndex: number, toIndex: number): T[] {
  assertArrayIndex(fromIndex, values.length, "fromIndex");
  assertArrayIndex(toIndex, values.length, "toIndex");

  const result = [...values];
  if (fromIndex === toIndex) {
    return result;
  }

  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item as T);
  return result;
}

/**
 * 将两个数组按索引配对，结果长度等于较长数组长度。
 *
 * 较短数组缺失的位置使用 `undefined`，不会截断业务数据。
 */
export function zip<First, Second>(
  firstValues: readonly First[],
  secondValues: readonly Second[],
): Array<readonly [First | undefined, Second | undefined]> {
  const length = Math.max(firstValues.length, secondValues.length);
  return Array.from({ length }, (_, index) => [firstValues[index], secondValues[index]] as const);
}

/**
 * 按从 1 开始的页码对数组分页，并返回完整分页元数据。
 *
 * 页码超过总页数时 items 为空，但仍保留请求页码，便于接口层识别越界请求。
 *
 * @throws {RangeError} page 或 pageSize 不是正安全整数。
 */
export function paginate<T>(
  values: readonly T[],
  page: number,
  pageSize: number,
): PaginationResult<T> {
  assertPositiveSafeInteger(page, "page");
  assertPositiveSafeInteger(pageSize, "pageSize");

  const totalItems = values.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize;
  const items = start < totalItems ? values.slice(start, start + pageSize) : [];

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
    hasNextPage: page < totalPages,
  };
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertArrayIndex(index: number, length: number, name: string): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`${name} must be a valid array index`);
  }
}

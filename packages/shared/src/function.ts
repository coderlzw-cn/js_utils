/**
 * 函数组合、缓存与执行频率控制工具。
 *
 * 本模块只使用 ECMAScript 标准 API，可同时运行于现代 Node.js 和浏览器环境。
 */

export { awaitTo, sleep } from "./promise.js";
export type { AwaitToOptions, AwaitToResult, DelayOptions } from "./promise.js";

/** 可由本模块包装的函数类型。 */
export type CallableFunction = (...args: never[]) => unknown;

/** 单参数转换函数。 */
export type UnaryFunction<Input, Output> = (input: Input) => Output;

/** debounce/throttle 的通用控制能力。 */
export interface ScheduledFunctionControls<Result> {
  /** 取消尚未执行的尾调用并释放参数引用。 */
  cancel(): void;
  /** 立即执行尚未触发的尾调用；没有待处理调用时返回最近结果。 */
  flush(): Result | undefined;
  /** 当前是否存在活跃的防抖或限流等待窗口。 */
  pending(): boolean;
}

/** 保留原函数参数、this 和返回值类型的 debounce 函数。 */
export type DebouncedFunction<Fn extends CallableFunction> = ScheduledFunctionControls<ReturnType<Fn>> & ((this: ThisParameterType<Fn>, ...args: Parameters<Fn>) => ReturnType<Fn> | undefined);

/** 保留原函数参数、this 和返回值类型的 throttle 函数。 */
export type ThrottledFunction<Fn extends CallableFunction> = DebouncedFunction<Fn>;

/** debounce 配置。 */
export interface DebounceOptions {
  /**
   * 是否在等待窗口开始时立即执行。
   *
   * @default false
   */
  readonly leading?: boolean;
  /**
   * 是否在等待窗口结束时执行最后一次调用。
   *
   * @default true
   */
  readonly trailing?: boolean;
}

/** throttle 配置。 */
export interface ThrottleOptions {
  /**
   * 是否在限流窗口开始时立即执行。
   *
   * @default true
   */
  readonly leading?: boolean;
  /**
   * 限流窗口内出现额外调用时，是否在窗口结束后执行最后一次调用。
   *
   * @default true
   */
  readonly trailing?: boolean;
}

/** memoize 配置。 */
export interface MemoizeOptions<Fn extends CallableFunction> {
  /**
   * 根据调用参数和 this 生成缓存键。默认使用首个参数；无参数调用使用内部固定键。
   * 多参数函数应显式提供 resolver。
   */
  readonly resolver?: (this: ThisParameterType<Fn>, ...args: Parameters<Fn>) => unknown;
  /**
   * 最大缓存项数。超出后按最近最少使用顺序淘汰。
   *
   * @default 1000
   */
  readonly maxSize?: number;
  /**
   * 缓存存活时间，单位为毫秒。`Infinity` 表示永不过期，`0` 表示不缓存。
   *
   * @default Infinity
   */
  readonly ttl?: number;
}

/** memoize 返回函数附带的缓存控制能力。 */
export type MemoizedFunction<Fn extends CallableFunction> = {
  /** 当前缓存项数。 */
  readonly size: number;
  /** 判断指定缓存键是否存在；过期项会在下次调用时惰性清理。 */
  has(key: unknown): boolean;
  /** 清空全部缓存。 */
  clear(): void;
  /** 删除指定缓存键。 */
  delete(key: unknown): boolean;
} & ((this: ThisParameterType<Fn>, ...args: Parameters<Fn>) => ReturnType<Fn>);

/** 不执行任何操作且返回 `undefined`。 */
export function noop(): void {}

/** 原样返回输入值，适合作为默认转换函数。 */
export function identity<T>(value: T): T {
  return value;
}

/** 创建一个始终返回给定值的函数。对象值按引用返回，不会被克隆。 */
export function constant<T>(value: T): () => T {
  return () => value;
}

/**
 * 创建执行副作用后原样返回输入的函数，适合插入 pipe 调试、日志或指标采集。
 */
export function tap<T>(effect: (value: T) => void): (value: T) => T {
  return (value) => {
    effect(value);
    return value;
  };
}

/** 创建对原断言结果取反的函数，并保留参数和 this。 */
export function negate<Fn extends (...args: never[]) => boolean>(predicate: Fn): (this: ThisParameterType<Fn>, ...args: Parameters<Fn>) => boolean {
  return function (this: ThisParameterType<Fn>, ...args: Parameters<Fn>): boolean {
    return !Reflect.apply(predicate, this, args);
  };
}

/**
 * 创建最多执行一次的函数，并缓存首次调用的结果。
 *
 * 首次调用抛出异常时也视为已执行，后续调用会重新抛出同一个异常；若返回 Promise，
 * 则所有调用共享同一个 Promise。这一语义保证底层副作用严格至多发生一次。
 * 首次调用完成前递归进入同一包装函数会抛出错误，避免返回尚未初始化的结果。
 */
export function once<Fn extends CallableFunction>(fn: Fn): (this: ThisParameterType<Fn>, ...args: Parameters<Fn>) => ReturnType<Fn> {
  let called = false;
  let result: ReturnType<Fn>;
  let failure: unknown;
  let failed = false;
  let executing = false;

  return function (this: ThisParameterType<Fn>, ...args: Parameters<Fn>): ReturnType<Fn> {
    if (!called) {
      called = true;
      executing = true;
      try {
        result = Reflect.apply(fn, this, args) as ReturnType<Fn>;
      } catch (error) {
        failure = error;
        failed = true;
      } finally {
        executing = false;
      }
    }

    if (executing) {
      throw new Error("once-wrapped function cannot be re-entered during its first execution");
    }
    if (failed) {
      throw failure;
    }
    return result;
  };
}

/**
 * 创建带 TTL 和 LRU 上限的缓存函数，并保留原函数参数、this 和返回值类型。
 *
 * 命中缓存时会刷新其最近使用顺序。函数同步抛错时不写入缓存；缓存 PromiseLike
 * 且其最终拒绝时会自动删除对应项，避免瞬时失败被长期缓存。
 *
 * @throws {RangeError} maxSize 不是正安全整数，或 ttl 不是非负有限数/Infinity。
 */
export function memoize<Fn extends CallableFunction>(fn: Fn, options: MemoizeOptions<Fn> = {}): MemoizedFunction<Fn> {
  const { maxSize = DEFAULT_MEMOIZE_MAX_SIZE, resolver, ttl = Infinity } = options;
  assertPositiveSafeInteger(maxSize, "maxSize");
  assertTimeToLive(ttl);

  const cache = new Map<unknown, MemoizeEntry<ReturnType<Fn>>>();
  const memoized = function (this: ThisParameterType<Fn>, ...args: Parameters<Fn>): ReturnType<Fn> {
    const key = resolver ? Reflect.apply(resolver, this, args) : args.length === 0 ? EMPTY_ARGUMENTS_KEY : args[0];
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && cached.expiresAt >= now) {
      // Map 保留插入顺序，重新插入即可用 O(1) 维护 LRU 顺序。
      cache.delete(key);
      cache.set(key, cached);
      return cached.value;
    }
    if (cached) {
      cache.delete(key);
    }

    const value = Reflect.apply(fn, this, args) as ReturnType<Fn>;
    if (ttl === 0) {
      return value;
    }

    const entry: MemoizeEntry<ReturnType<Fn>> = {
      expiresAt: ttl === Infinity ? Infinity : now + ttl,
      value,
    };
    cache.set(key, entry);
    evictOldestEntries(cache, maxSize);

    if (isPromiseLike(value)) {
      void Promise.resolve(value).then(undefined, () => {
        if (cache.get(key) === entry) {
          cache.delete(key);
        }
      });
    }

    return value;
  } as MemoizedFunction<Fn>;

  Object.defineProperty(memoized, "size", {
    enumerable: true,
    get: () => cache.size,
  });
  memoized.has = (key: unknown): boolean => cache.has(key);
  memoized.clear = (): void => cache.clear();
  memoized.delete = (key: unknown): boolean => cache.delete(key);
  return memoized;
}

/**
 * 创建防抖函数。等待窗口内反复调用只保留最后一组参数和 this。
 *
 * cancel 会取消尾调用并释放引用；flush 会立即执行待处理尾调用。若 leading 和
 * trailing 均为 false，会因函数永远无法执行而抛出配置错误。
 *
 * @throws {RangeError} wait 不是有效定时器延迟，或 leading/trailing 均为 false。
 */
export function debounce<Fn extends CallableFunction>(fn: Fn, wait: number, options: DebounceOptions = {}): DebouncedFunction<Fn> {
  assertTimerDelay(wait, "wait");
  const { leading = false, trailing = true } = options;
  assertSchedulingOptions(leading, trailing);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<Fn> | undefined;
  let lastThis: ThisParameterType<Fn> | undefined;
  let result: ReturnType<Fn> | undefined;

  const invoke = (): ReturnType<Fn> => {
    const args = lastArgs as Parameters<Fn>;
    const thisValue = lastThis as ThisParameterType<Fn>;
    lastArgs = undefined;
    lastThis = undefined;
    result = Reflect.apply(fn, thisValue, args) as ReturnType<Fn>;
    return result;
  };

  const captureCall = (thisValue: ThisParameterType<Fn>, args: Parameters<Fn>): void => {
    lastArgs = args;
    lastThis = thisValue;
  };

  const handleTimer = (): void => {
    timer = undefined;
    if (trailing && lastArgs) {
      invoke();
    } else {
      lastArgs = undefined;
      lastThis = undefined;
    }
  };

  const debounced = function (this: ThisParameterType<Fn>, ...args: Parameters<Fn>): ReturnType<Fn> | undefined {
    const invokeLeading = leading && timer === undefined;
    captureCall(this, args);

    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(handleTimer, wait);

    if (invokeLeading) {
      return invoke();
    }
    return result;
  } as DebouncedFunction<Fn>;

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    lastArgs = undefined;
    lastThis = undefined;
  };
  debounced.flush = (): ReturnType<Fn> | undefined => {
    if (timer === undefined) {
      return result;
    }
    clearTimeout(timer);
    timer = undefined;
    if (trailing && lastArgs) {
      return invoke();
    }
    lastArgs = undefined;
    lastThis = undefined;
    return result;
  };
  debounced.pending = (): boolean => timer !== undefined;
  return debounced;
}

/**
 * 创建节流函数，在每个等待窗口内最多按配置执行 leading 和 trailing 调用。
 *
 * 尾调用执行后会开启新的限流窗口，防止窗口边界附近连续执行两次。cancel、flush
 * 和 pending 的语义与 debounce 一致。
 *
 * @throws {RangeError} wait 不是有效定时器延迟，或 leading/trailing 均为 false。
 */
export function throttle<Fn extends CallableFunction>(fn: Fn, wait: number, options: ThrottleOptions = {}): ThrottledFunction<Fn> {
  assertTimerDelay(wait, "wait");
  const { leading = true, trailing = true } = options;
  assertSchedulingOptions(leading, trailing);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<Fn> | undefined;
  let lastThis: ThisParameterType<Fn> | undefined;
  let result: ReturnType<Fn> | undefined;

  const invoke = (): ReturnType<Fn> => {
    const args = lastArgs as Parameters<Fn>;
    const thisValue = lastThis as ThisParameterType<Fn>;
    lastArgs = undefined;
    lastThis = undefined;
    result = Reflect.apply(fn, thisValue, args) as ReturnType<Fn>;
    return result;
  };

  const captureCall = (thisValue: ThisParameterType<Fn>, args: Parameters<Fn>): void => {
    lastArgs = args;
    lastThis = thisValue;
  };

  const handleTimer = (): void => {
    timer = undefined;
    if (trailing && lastArgs) {
      invoke();
      timer = setTimeout(handleTimer, wait);
    } else {
      lastArgs = undefined;
      lastThis = undefined;
    }
  };

  const throttled = function (this: ThisParameterType<Fn>, ...args: Parameters<Fn>): ReturnType<Fn> | undefined {
    captureCall(this, args);

    if (timer === undefined) {
      if (leading) {
        invoke();
      }
      timer = setTimeout(handleTimer, wait);
    }
    return result;
  } as ThrottledFunction<Fn>;

  throttled.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    lastArgs = undefined;
    lastThis = undefined;
  };
  throttled.flush = (): ReturnType<Fn> | undefined => {
    if (timer === undefined) {
      return result;
    }
    clearTimeout(timer);
    timer = undefined;
    if (trailing && lastArgs) {
      return invoke();
    }
    lastArgs = undefined;
    lastThis = undefined;
    return result;
  };
  throttled.pending = (): boolean => timer !== undefined;
  return throttled;
}

/** 从左到右组合一组单参数函数。 */
export function pipe<A, B>(first: UnaryFunction<A, B>): UnaryFunction<A, B>;
export function pipe<A, B, C>(first: UnaryFunction<A, B>, second: UnaryFunction<B, C>): UnaryFunction<A, C>;
export function pipe<A, B, C, D>(first: UnaryFunction<A, B>, second: UnaryFunction<B, C>, third: UnaryFunction<C, D>): UnaryFunction<A, D>;
export function pipe<A, B, C, D, E>(first: UnaryFunction<A, B>, second: UnaryFunction<B, C>, third: UnaryFunction<C, D>, fourth: UnaryFunction<D, E>): UnaryFunction<A, E>;
export function pipe<A, B, C, D, E, F>(
  first: UnaryFunction<A, B>,
  second: UnaryFunction<B, C>,
  third: UnaryFunction<C, D>,
  fourth: UnaryFunction<D, E>,
  fifth: UnaryFunction<E, F>,
): UnaryFunction<A, F>;
export function pipe(...functions: readonly UnaryFunction<unknown, unknown>[]): UnaryFunction<unknown, unknown> {
  return (input) => functions.reduce((value, fn) => fn(value), input);
}

/** 从右到左组合一组单参数函数。 */
export function compose<A, B>(first: UnaryFunction<A, B>): UnaryFunction<A, B>;
export function compose<A, B, C>(outer: UnaryFunction<B, C>, inner: UnaryFunction<A, B>): UnaryFunction<A, C>;
export function compose<A, B, C, D>(outer: UnaryFunction<C, D>, middle: UnaryFunction<B, C>, inner: UnaryFunction<A, B>): UnaryFunction<A, D>;
export function compose<A, B, C, D, E>(outer: UnaryFunction<D, E>, third: UnaryFunction<C, D>, second: UnaryFunction<B, C>, inner: UnaryFunction<A, B>): UnaryFunction<A, E>;
export function compose<A, B, C, D, E, F>(
  outer: UnaryFunction<E, F>,
  fourth: UnaryFunction<D, E>,
  third: UnaryFunction<C, D>,
  second: UnaryFunction<B, C>,
  inner: UnaryFunction<A, B>,
): UnaryFunction<A, F>;
export function compose(...functions: readonly UnaryFunction<unknown, unknown>[]): UnaryFunction<unknown, unknown> {
  return (input) => functions.reduceRight((value, fn) => fn(value), input);
}

interface MemoizeEntry<Value> {
  readonly expiresAt: number;
  readonly value: Value;
}

const EMPTY_ARGUMENTS_KEY = Symbol("memoize.emptyArguments");
const DEFAULT_MEMOIZE_MAX_SIZE = 1000;
const MAX_TIMER_DELAY = 2_147_483_647;

function evictOldestEntries<Value>(cache: Map<unknown, Value>, maxSize: number): void {
  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false;
  }

  try {
    return "then" in value && typeof value.then === "function";
  } catch {
    // 读取恶意或代理对象的 then getter 失败，不应改变被包装函数本身的返回语义。
    return false;
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertTimeToLive(ttl: number): void {
  if ((ttl !== Infinity && !Number.isFinite(ttl)) || ttl < 0) {
    throw new RangeError("ttl must be a non-negative finite number or Infinity");
  }
}

function assertTimerDelay(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > MAX_TIMER_DELAY) {
    throw new RangeError(`${name} must be between 0 and ${MAX_TIMER_DELAY} milliseconds`);
  }
}

function assertSchedulingOptions(leading: boolean, trailing: boolean): void {
  if (!leading && !trailing) {
    throw new RangeError("leading and trailing cannot both be false");
  }
}

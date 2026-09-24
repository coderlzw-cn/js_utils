/** 可以同步返回，也可以返回 PromiseLike 的值。 */
export type MaybePromise<T> = T | PromiseLike<T>;

/** 支持 AbortSignal 的异步任务。 */
export type AbortableTask<T> = (signal: AbortSignal) => MaybePromise<T>;

/** 延时等待配置。 */
export interface DelayOptions {
  /** 用于主动取消等待的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** awaitTo 成功或失败的互斥元组结果。 */
export type AwaitToResult<Value, Failure extends NonNullable<unknown> = NonNullable<unknown>> = readonly [error: null, value: Value] | readonly [error: Failure, value: undefined];

/** awaitTo 错误转换配置。 */
export interface AwaitToOptions<Failure extends NonNullable<unknown>> {
  /**
   * 将未知拒绝原因转换为业务错误类型。
   *
   * 转换函数自身抛错时，awaitTo 返回的 Promise 会拒绝，以便暴露错误处理代码缺陷。
   */
  readonly mapError: (error: unknown) => Failure;
}

/** 超时控制配置。 */
export interface TimeoutOptions {
  /** 用于从外部主动取消任务的 AbortSignal。 */
  readonly signal?: AbortSignal;
  /** 自定义超时错误信息。 */
  readonly message?: string;
}

/** 单次重试任务的执行上下文。 */
export interface RetryContext {
  /** 当前执行次数，从 1 开始。 */
  readonly attempt: number;
  /** 允许执行的最大次数。 */
  readonly maxAttempts: number;
  /** 任务应监听的取消信号。 */
  readonly signal: AbortSignal;
}

/** 即将进行下一次重试时的上下文。 */
export interface RetryEvent extends RetryContext {
  /** 本次失败抛出的原始错误。 */
  readonly error: unknown;
  /** 下一次执行次数。 */
  readonly nextAttempt: number;
  /** 下一次执行前的实际等待时间，已包含退避和抖动。 */
  readonly delay: number;
}

/** 重试配置。 */
export interface RetryOptions {
  /**
   * 包含首次执行在内的最大执行次数。
   *
   * @default 3
   * @minimum 1
   */
  readonly maxAttempts?: number;
  /**
   * 第一次重试前的等待时间，单位为毫秒。
   *
   * @default 200
   * @minimum 0
   */
  readonly initialDelay?: number;
  /**
   * 每次重试等待时间的增长倍数。
   *
   * @default 2
   * @minimum 1
   */
  readonly backoffFactor?: number;
  /**
   * 单次重试允许等待的最大时间，单位为毫秒。
   *
   * @default 30000
   * @minimum 0
   */
  readonly maxDelay?: number;
  /**
   * 等待时间的随机抖动比例，取值范围为 0 到 1。
   *
   * 例如 delay 为 1000、jitter 为 0.2 时，实际等待时间位于 800 到
   * 1200 毫秒之间。测试环境可保持默认值 0，确保行为可预测。
   *
   * @default 0
   */
  readonly jitter?: number;
  /** 用于主动取消当前执行及后续重试的 AbortSignal。 */
  readonly signal?: AbortSignal;
  /** 返回 false 时立即抛出当前错误，不再重试。 */
  readonly shouldRetry?: (error: unknown, context: RetryContext) => MaybePromise<boolean>;
  /** 每次确定需要重试后触发，可用于日志、指标或链路追踪。 */
  readonly onRetry?: (event: RetryEvent) => MaybePromise<void>;
}

/** 限并发映射配置。 */
export interface MapConcurrentOptions {
  /**
   * 同时运行的最大任务数。
   *
   * @default 4
   * @minimum 1
   */
  readonly concurrency?: number;
  /** 用于取消整个任务组的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 限并发映射函数。 */
export type ConcurrentMapper<T, R> = (value: T, index: number, signal: AbortSignal) => MaybePromise<R>;

/** 可在 Promise 外部完成或拒绝它的控制器。 */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

/** 任务被主动取消且 AbortSignal 未提供具体原因时使用的错误。 */
export class AbortError extends Error {
  override readonly name = "AbortError";

  constructor(message = "The operation was aborted.", options?: ErrorOptions) {
    super(message, options);
  }
}

/** 任务超过指定时间仍未完成时使用的错误。 */
export class TimeoutError extends Error {
  override readonly name = "TimeoutError";
  readonly timeout: number;

  constructor(timeout: number, message = `The operation timed out after ${timeout} ms.`) {
    super(message);
    this.timeout = timeout;
  }
}

/**
 * 判断未知错误是否表示主动取消。
 *
 * 除本模块的 AbortError 外，也兼容 DOMException 和其他运行时中 name 为
 * AbortError 的错误对象。
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof AbortError || (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError");
}

/**
 * 在指定时间后完成，可通过 AbortSignal 提前取消。
 *
 * 无论正常完成还是取消，内部定时器和事件监听都会被清理。
 */
export function delay(milliseconds: number, options: DelayOptions = {}): Promise<void> {
  assertNonNegativeFiniteNumber(milliseconds, "milliseconds");

  const { signal } = options;

  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      signal?.removeEventListener("abort", handleAbort);
      clearTimeout(timeoutId);
    };

    const handleAbort = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(getAbortReason(signal));
    };

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    }, milliseconds);

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

/** sleep 是 delay 的语义化别名。 */
export const sleep = delay;

/**
 * 将 Promise 的完成或拒绝转换为 `[error, value]` 互斥元组。
 *
 * 成功时 error 固定为 `null`；失败时 value 固定为 `undefined`，可通过首项安全缩窄
 * 类型。默认保留非 nullish 拒绝原因；`null` 或 `undefined` 会转换为带 cause 的 Error，
 * 从而保证 error === null 始终只代表成功。也可通过 mapError 规范化为业务错误。
 *
 * @example
 * const [error, user] = await awaitTo(fetchUser());
 * if (error !== null) {
 *   report(error);
 *   return;
 * }
 * user.id;
 */
export function awaitTo<Value>(value: MaybePromise<Value>): Promise<AwaitToResult<Value>>;
export function awaitTo<Value, Failure extends NonNullable<unknown>>(value: MaybePromise<Value>, options: AwaitToOptions<Failure>): Promise<AwaitToResult<Value, Failure>>;
export async function awaitTo<Value, Failure extends NonNullable<unknown> = NonNullable<unknown>>(
  value: MaybePromise<Value>,
  options?: AwaitToOptions<Failure>,
): Promise<AwaitToResult<Value, Failure>> {
  try {
    return [null, await value] as const;
  } catch (error) {
    const failure = options ? options.mapError(error) : ((error ?? new Error("Promise rejected without an error value", { cause: error })) as Failure);
    if (failure === null || failure === undefined) {
      throw new TypeError("mapError must return a non-nullish error value");
    }
    return [failure, undefined] as const;
  }
}

/**
 * 为 Promise 或可取消任务添加超时限制。
 *
 * 传入函数时，超时或外部取消会中止提供给函数的 signal；传入已经创建的
 * Promise 时无法停止其底层工作，但仍会按时拒绝并处理它后续的完成状态。
 */
export async function withTimeout<T>(task: PromiseLike<T> | AbortableTask<T>, milliseconds: number, options: TimeoutOptions = {}): Promise<T> {
  assertNonNegativeFiniteNumber(milliseconds, "milliseconds");

  const { signal, message } = options;
  const linkedController = createLinkedAbortController(signal);
  const timeoutError = new TimeoutError(milliseconds, message);
  const timeoutId = setTimeout(() => {
    linkedController.controller.abort(timeoutError);
  }, milliseconds);

  try {
    throwIfAborted(linkedController.controller.signal);

    const result = typeof task === "function" ? task(linkedController.controller.signal) : task;

    return await raceWithSignal(result, linkedController.controller.signal);
  } finally {
    clearTimeout(timeoutId);
    linkedController.cleanup();
  }
}

/**
 * 执行失败后按策略自动重试。
 *
 * maxAttempts 包含首次执行。shouldRetry、onRetry 和退避等待期间均会检查取消
 * 状态；AbortSignal 的 reason 会原样向调用方传播。
 */
export async function retry<T>(operation: (context: RetryContext) => MaybePromise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, initialDelay = 200, backoffFactor = 2, maxDelay = 30_000, jitter = 0, signal, shouldRetry, onRetry } = options;

  assertPositiveInteger(maxAttempts, "maxAttempts");
  assertNonNegativeFiniteNumber(initialDelay, "initialDelay");
  assertFiniteNumberAtLeast(backoffFactor, 1, "backoffFactor");
  assertNonNegativeFiniteNumber(maxDelay, "maxDelay");
  assertNumberInRange(jitter, 0, 1, "jitter");

  const fallbackController = signal ? undefined : new AbortController();
  const operationSignal = signal ?? fallbackController?.signal;

  // fallbackController 始终存在于 signal 未传入的分支，因此这里必定能取得 signal。
  if (!operationSignal) {
    throw new Error("Failed to create an AbortSignal for the retry operation.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(operationSignal);

    const context: RetryContext = {
      attempt,
      maxAttempts,
      signal: operationSignal,
    };

    try {
      return await raceWithSignal(operation(context), operationSignal);
    } catch (error) {
      if (operationSignal.aborted) {
        throw getAbortReason(operationSignal);
      }

      if (attempt >= maxAttempts) {
        throw error;
      }

      if (shouldRetry && !(await shouldRetry(error, context))) {
        throw error;
      }

      throwIfAborted(operationSignal);

      const retryDelay = calculateRetryDelay(initialDelay, backoffFactor, maxDelay, jitter, attempt);

      await onRetry?.({
        ...context,
        error,
        nextAttempt: attempt + 1,
        delay: retryDelay,
      });

      throwIfAborted(operationSignal);

      if (retryDelay > 0) {
        await delay(retryDelay, { signal: operationSignal });
      }
    }
  }

  // 循环的最后一次执行只会 return 或 throw，此处用于保证控制流类型完整。
  throw new Error("Retry operation ended unexpectedly.");
}

/**
 * 按固定并发数映射数组，并保持结果与输入顺序一致。
 *
 * 首个任务失败后会停止领取新任务，同时中止传给其他 mapper 的 signal。已经
 * 开始且忽略 signal 的底层工作可能继续运行，但其后续拒绝会被安全处理。
 */
export async function mapConcurrent<T, R>(values: readonly T[], mapper: ConcurrentMapper<T, R>, options: MapConcurrentOptions = {}): Promise<R[]> {
  const { concurrency = 4, signal } = options;
  assertPositiveInteger(concurrency, "concurrency");

  if (values.length === 0) {
    throwIfAborted(signal);
    return [];
  }

  const linkedController = createLinkedAbortController(signal);
  const taskSignal = linkedController.controller.signal;
  const results: R[] = [];
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      throwIfAborted(taskSignal);

      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) {
        return;
      }

      try {
        // index 已经过边界判断，但 noUncheckedIndexedAccess 会保守地保留 undefined。
        const value = values[index] as T;
        results[index] = await raceWithSignal(mapper(value, index, taskSignal), taskSignal);
      } catch (error) {
        if (!taskSignal.aborted) {
          linkedController.controller.abort(error);
        }

        throw error;
      }
    }
  };

  const workerCount = Math.min(concurrency, values.length);

  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  } finally {
    linkedController.cleanup();
  }
}

/**
 * 创建可从 Promise 外部 resolve 或 reject 的控制器。
 *
 * 原生 Promise 保证多次调用 resolve/reject 时只有第一次生效。
 */
export function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

/** AbortSignal 已取消时抛出其 reason，否则抛出标准 AbortError。 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw getAbortReason(signal);
  }
}

/** 获取 AbortSignal 的取消原因，并兼容未实现 reason 的旧运行时。 */
function getAbortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new AbortError();
}

/** 将外部 signal 转发到内部 AbortController，并提供监听清理函数。 */
function createLinkedAbortController(signal?: AbortSignal): {
  readonly controller: AbortController;
  readonly cleanup: () => void;
} {
  const controller = new AbortController();

  if (!signal) {
    return { controller, cleanup: () => undefined };
  }

  if (signal.aborted) {
    controller.abort(getAbortReason(signal));
    return { controller, cleanup: () => undefined };
  }

  const handleAbort = (): void => {
    controller.abort(getAbortReason(signal));
  };

  signal.addEventListener("abort", handleAbort, { once: true });

  return {
    controller,
    cleanup: () => signal.removeEventListener("abort", handleAbort),
  };
}

/** 让 Promise 与取消信号竞争，并在任一方结束后清理监听器。 */
function raceWithSignal<T>(value: MaybePromise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      signal.removeEventListener("abort", handleAbort);
    };

    const handleAbort = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(getAbortReason(signal));
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    Promise.resolve(value).then(
      (result) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

/** 计算包含指数退避、上限和双向抖动的等待时间。 */
function calculateRetryDelay(initialDelay: number, backoffFactor: number, maxDelay: number, jitter: number, failedAttempt: number): number {
  const exponentialDelay = initialDelay * backoffFactor ** (failedAttempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  if (jitter === 0 || cappedDelay === 0) {
    return cappedDelay;
  }

  const minimum = cappedDelay * (1 - jitter);
  const maximum = cappedDelay * (1 + jitter);
  return minimum + Math.random() * (maximum - minimum);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function assertNonNegativeFiniteNumber(value: number, name: string): void {
  assertFiniteNumberAtLeast(value, 0, name);
}

function assertFiniteNumberAtLeast(value: number, minimum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`${name} must be a finite number greater than or equal to ${minimum}`);
  }
}

function assertNumberInRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a finite number between ${minimum} and ${maximum}`);
  }
}

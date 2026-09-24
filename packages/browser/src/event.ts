/** 取消事件监听的清理函数。重复调用不会产生额外副作用。 */
export type EventCleanup = () => void;

/** 类型化事件监听器。 */
export type TypedEventListener<E extends Event = Event> = (event: E) => void;

/** 支持事件委托的根节点。 */
export type EventDelegationRoot = Document | Element | ShadowRoot;

/** 等待事件的配置。 */
export interface WaitForEventOptions<E extends Event> {
  /** 是否在捕获阶段监听事件。 */
  readonly capture?: boolean;
  /** 只在断言返回 true 时结束等待。 */
  readonly predicate?: (event: E) => boolean;
  /** 用于主动取消等待的 AbortSignal。 */
  readonly signal?: AbortSignal;
  /**
   * 最大等待时间，单位为毫秒；不传表示不设置超时。
   *
   * @minimum 0
   */
  readonly timeout?: number;
}

/** 自定义事件派发配置，detail 由函数参数单独提供。 */
export type DispatchCustomEventOptions<T> = Omit<CustomEventInit<T>, "detail">;

/**
 * 添加事件监听，并返回幂等的清理函数。
 *
 * 支持原生 addEventListener 配置和 AbortSignal。若 signal 已中止，则不会添加
 * 监听。即使浏览器通过 signal 自动移除了监听器，返回的清理函数仍可安全调用。
 */
export function listenEvent<K extends keyof WindowEventMap>(target: Window, type: K, listener: TypedEventListener<WindowEventMap[K]>, options?: boolean | AddEventListenerOptions): EventCleanup;
/** 为 Document 添加类型安全的事件监听。 */
export function listenEvent<K extends keyof DocumentEventMap>(target: Document, type: K, listener: TypedEventListener<DocumentEventMap[K]>, options?: boolean | AddEventListenerOptions): EventCleanup;
/** 为 HTMLElement 添加类型安全的事件监听。 */
export function listenEvent<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  listener: TypedEventListener<HTMLElementEventMap[K]>,
  options?: boolean | AddEventListenerOptions,
): EventCleanup;
/** 为普通 EventTarget 或自定义事件添加监听。 */
export function listenEvent<E extends Event = Event>(target: EventTarget, type: string, listener: TypedEventListener<E>, options?: boolean | AddEventListenerOptions): EventCleanup;
export function listenEvent(target: EventTarget, type: string, listener: TypedEventListener, options?: boolean | AddEventListenerOptions): EventCleanup {
  const signal = typeof options === "object" ? options.signal : undefined;

  if (signal?.aborted) {
    return () => undefined;
  }

  const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
  let active = true;

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    target.removeEventListener(type, listener, capture);
    signal?.removeEventListener("abort", cleanup);
  };

  target.addEventListener(type, listener, options);
  signal?.addEventListener("abort", cleanup, { once: true });

  return cleanup;
}

/**
 * 在根节点上添加事件委托。
 *
 * 监听器只会在事件传播路径中存在匹配 selector 的元素时执行。实现基于
 * composedPath()，能够处理 Shadow DOM 中重新定向后的事件，并保证匹配范围
 * 不越过委托根节点。
 */
export function delegateEvent<E extends Event = Event, T extends Element = Element>(
  root: EventDelegationRoot,
  type: string,
  selector: string,
  listener: (event: E, matchedElement: T) => void,
  options?: boolean | AddEventListenerOptions,
): EventCleanup {
  return listenEvent<E>(
    root,
    type,
    (event) => {
      const matchedElement = findDelegatedElement<T>(event, root, selector);

      if (matchedElement) {
        listener(event, matchedElement);
      }
    },
    options,
  );
}

/**
 * 等待目标触发一次符合条件的事件。
 *
 * 事件匹配、超时、主动取消或 predicate 抛出异常后都会立即清理所有监听器和
 * 定时器，避免 Promise 结束后残留资源。AbortSignal 中止时优先使用其 reason。
 */
export function waitForEvent<E extends Event = Event>(target: EventTarget, type: string, options: WaitForEventOptions<E> = {}): Promise<E> {
  const { capture = false, predicate, signal, timeout } = options;

  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
    return Promise.reject(new RangeError("timeout must be a non-negative finite number"));
  }

  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<E>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const cleanup = (): void => {
      if (!active) {
        return;
      }

      active = false;
      target.removeEventListener(type, handleEvent, capture);
      signal?.removeEventListener("abort", handleAbort);

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    const handleEvent = (event: Event): void => {
      const typedEvent = event as E;

      try {
        if (predicate && !predicate(typedEvent)) {
          return;
        }
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      cleanup();
      resolve(typedEvent);
    };

    const handleAbort = (): void => {
      cleanup();
      reject(getAbortReason(signal));
    };

    target.addEventListener(type, handleEvent, capture);
    signal?.addEventListener("abort", handleAbort, { once: true });

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new DOMException(`Waiting for event "${type}" timed out after ${timeout} ms.`, "TimeoutError"));
      }, timeout);
    }
  });
}

/**
 * 创建并派发携带类型化 detail 的 CustomEvent。
 *
 * 返回值与 dispatchEvent 一致：事件可取消且监听器调用了 preventDefault() 时
 * 返回 false，否则返回 true。
 */
export function dispatchCustomEvent<T>(target: EventTarget, type: string, detail: T, options: DispatchCustomEventOptions<T> = {}): boolean {
  return target.dispatchEvent(
    new CustomEvent<T>(type, {
      ...options,
      detail,
    }),
  );
}

/**
 * 将多个事件清理函数组合为一个幂等清理函数。
 *
 * 即使其中某个清理函数抛出异常，其余函数仍会继续执行；全部完成后通过
 * AggregateError 汇总异常，防止单个失败导致后续监听器泄漏。
 */
export function combineEventCleanups(...cleanups: readonly EventCleanup[]): EventCleanup {
  let active = true;

  return () => {
    if (!active) {
      return;
    }

    active = false;
    const errors: unknown[] = [];

    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more event cleanup functions failed.");
    }
  };
}

/** 在事件传播路径中查找未越过根节点的首个匹配元素。 */
function findDelegatedElement<T extends Element>(event: Event, root: EventDelegationRoot, selector: string): T | undefined {
  for (const eventTarget of event.composedPath()) {
    if (eventTarget instanceof Element && eventTarget.matches(selector)) {
      return eventTarget as T;
    }

    if (eventTarget === root) {
      break;
    }
  }

  return undefined;
}

/** 获取 AbortSignal 的中止原因，并兼容未提供 reason 的浏览器。 */
function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException("The event operation was aborted.", "AbortError");
}

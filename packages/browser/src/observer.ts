import type { EventCleanup } from "./event";
import { getBrowserWindow, isBrowserRuntime } from "./runtime";

/** 可作为 DOM 观察根节点的类型。 */
export type ObservationRoot = Document | Element | ShadowRoot;

/** MutationObserver 的扩展配置。 */
export interface ObserveMutationsOptions extends MutationObserverInit {
  /** 主动终止观察。 */
  readonly signal?: AbortSignal;
  /**
   * 清理时是否将 takeRecords() 中尚未派发的记录交给监听器。
   *
   * @default false
   */
  readonly flushPendingOnCleanup?: boolean;
}

/** ResizeObserver 的扩展配置。 */
export interface ObserveResizeOptions extends ResizeObserverOptions {
  readonly signal?: AbortSignal;
}

/** IntersectionObserver 的扩展配置。 */
export interface ObserveIntersectionsOptions extends IntersectionObserverInit {
  readonly signal?: AbortSignal;
  /**
   * 清理时是否将 takeRecords() 中尚未派发的记录交给监听器。
   *
   * @default false
   */
  readonly flushPendingOnCleanup?: boolean;
}

/** 动态选择器匹配集合的变化快照。 */
export interface SelectorObservation<T extends Element = Element> {
  /** 本次变化后的全部匹配元素。 */
  readonly current: readonly T[];
  /** 本次新增的匹配元素。 */
  readonly added: readonly T[];
  /** 本次不再匹配或已移除的元素。 */
  readonly removed: readonly T[];
}

/** 动态选择器观察配置。 */
export interface ObserveSelectorOptions {
  /**
   * 订阅后是否立即返回当前匹配集合。
   *
   * @default true
   */
  readonly emitInitial?: boolean;
  /**
   * 是否在属性变化后重新计算选择器匹配。
   *
   * @default true
   */
  readonly observeAttributes?: boolean;
  /** 限制需要监听的属性，例如 class、disabled。 */
  readonly attributeFilter?: readonly string[];
  readonly signal?: AbortSignal;
}

/** 等待元素出现的配置。 */
export interface WaitForElementOptions<T extends Element = Element> {
  /**
   * 查询根节点。
   *
   * @default document
   */
  readonly root?: ObservationRoot;
  /** 对匹配元素做进一步验证。 */
  readonly predicate?: (element: T) => boolean;
  /** 最大等待时间，单位为毫秒。 */
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

/** 等待元素移除的配置。 */
export interface WaitForElementRemovalOptions {
  /**
   * 判断元素是否仍在范围内的根节点。
   *
   * @default element.ownerDocument
   */
  readonly root?: ObservationRoot;
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

/** 元素尺寸快照。 */
export interface ElementSizeSnapshot {
  readonly width: number;
  readonly height: number;
}

/** 等待元素尺寸稳定的配置。 */
export interface WaitForStableSizeOptions extends ResizeObserverOptions {
  /**
   * 最后一次尺寸变化后需要保持稳定的时间。
   *
   * @default 100
   */
  readonly stableFor?: number;
  /** 最大等待时间，单位为毫秒。 */
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

/** 判断当前环境是否支持 MutationObserver。 */
export function isMutationObserverSupported(): boolean {
  return isBrowserRuntime() && typeof MutationObserver === "function";
}

/** 判断当前环境是否支持 ResizeObserver。 */
export function isResizeObserverSupported(): boolean {
  return isBrowserRuntime() && typeof ResizeObserver === "function";
}

/** 判断当前环境是否支持 IntersectionObserver。 */
export function isIntersectionObserverSupported(): boolean {
  return isBrowserRuntime() && typeof IntersectionObserver === "function";
}

/**
 * 观察 DOM 变化，并返回幂等的清理函数。
 *
 * 未显式启用 attributes/characterData/childList 时，默认观察整个子树的
 * childList 变化。这一默认值可以避免原生 API 因空配置抛出异常。
 */
export function observeMutations(target: Node, listener: MutationCallback, options: ObserveMutationsOptions = {}): EventCleanup {
  getBrowserWindow();
  ensureObserverSupported(isMutationObserverSupported(), "MutationObserver");

  const { flushPendingOnCleanup = false, signal, ...observerOptions } = options;

  if (signal?.aborted) {
    return () => undefined;
  }

  const hasExplicitType = observerOptions.attributes === true || observerOptions.characterData === true || observerOptions.childList === true;
  const resolvedOptions: MutationObserverInit = hasExplicitType ? observerOptions : { ...observerOptions, childList: true, subtree: true };
  let active = true;
  const observer = new MutationObserver((records, currentObserver) => {
    if (active && records.length > 0) {
      listener(records, currentObserver);
    }
  });

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    const pending = flushPendingOnCleanup ? observer.takeRecords() : [];
    active = false;
    observer.disconnect();
    signal?.removeEventListener("abort", cleanup);

    if (pending.length > 0) {
      listener(pending, observer);
    }
  };

  observer.observe(target, resolvedOptions);
  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

/** 批量观察一个或多个元素的尺寸变化。 */
export function observeResize(targets: Element | Iterable<Element>, listener: ResizeObserverCallback, options: ObserveResizeOptions = {}): EventCleanup {
  getBrowserWindow();
  ensureObserverSupported(isResizeObserverSupported(), "ResizeObserver");

  const { box, signal } = options;

  if (signal?.aborted) {
    return () => undefined;
  }

  const elements = normalizeElementTargets(targets);
  let active = true;
  const observer = new ResizeObserver((entries, currentObserver) => {
    if (active && entries.length > 0) {
      listener(entries, currentObserver);
    }
  });

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    observer.disconnect();
    signal?.removeEventListener("abort", cleanup);
  };

  for (const element of elements) {
    observer.observe(element, box === undefined ? {} : { box });
  }
  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

/** 批量观察一个或多个元素与视口/根元素的交叉变化。 */
export function observeIntersections(targets: Element | Iterable<Element>, listener: IntersectionObserverCallback, options: ObserveIntersectionsOptions = {}): EventCleanup {
  getBrowserWindow();
  ensureObserverSupported(isIntersectionObserverSupported(), "IntersectionObserver");

  const { flushPendingOnCleanup = false, signal, ...observerOptions } = options;

  if (signal?.aborted) {
    return () => undefined;
  }

  const elements = normalizeElementTargets(targets);
  let active = true;
  const observer = new IntersectionObserver((entries, currentObserver) => {
    if (active && entries.length > 0) {
      listener(entries, currentObserver);
    }
  }, observerOptions);

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    const pending = flushPendingOnCleanup ? observer.takeRecords() : [];
    active = false;
    observer.disconnect();
    signal?.removeEventListener("abort", cleanup);

    if (pending.length > 0) {
      listener(pending, observer);
    }
  };

  for (const element of elements) {
    observer.observe(element);
  }
  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

/**
 * 监听根节点中某个 CSS 选择器的动态匹配集合。
 *
 * 与只处理 addedNodes 的简单实现不同，此函数会正确处理属性导致的
 * 匹配/失配、整个子树移动以及节点重新插入。
 */
export function observeSelector<T extends Element = Element>(
  root: ObservationRoot,
  selector: string,
  listener: (change: SelectorObservation<T>, records: readonly MutationRecord[] | undefined) => void,
  options: ObserveSelectorOptions = {},
): EventCleanup {
  const { attributeFilter, emitInitial = true, observeAttributes = true, signal } = options;

  if (signal?.aborted) {
    return () => undefined;
  }
  if (!observeAttributes && attributeFilter !== undefined) {
    throw new TypeError("attributeFilter requires observeAttributes to be enabled.");
  }

  let current = queryElements<T>(root, selector);

  const cleanup = observeMutations(
    root,
    (records) => {
      const next = queryElements<T>(root, selector);
      const previousSet = new Set(current);
      const nextSet = new Set(next);
      const added = next.filter((element) => !previousSet.has(element));
      const removed = current.filter((element) => !nextSet.has(element));

      if (added.length === 0 && removed.length === 0) {
        return;
      }

      current = next;
      listener({ current: [...current], added, removed }, records);
    },
    {
      childList: true,
      subtree: true,
      ...(observeAttributes ? { attributes: true } : {}),
      ...(attributeFilter === undefined ? {} : { attributeFilter: [...attributeFilter] }),
      ...(signal === undefined ? {} : { signal }),
    },
  );

  if (emitInitial) {
    try {
      listener({ current: [...current], added: [...current], removed: [] }, undefined);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return cleanup;
}

/**
 * 等待根节点内出现第一个符合条件的元素。
 *
 * 函数会先同步查询已有 DOM，只在未命中时创建 MutationObserver。
 */
export function waitForElement<T extends Element = Element>(selector: string, options: WaitForElementOptions<T> = {}): Promise<T> {
  const browserWindow = getBrowserWindow();
  const { predicate, root = browserWindow.document, signal, timeout } = options;
  const timeoutError = validateTimeout(timeout, `Waiting for element "${selector}"`);

  if (timeoutError) {
    return Promise.reject(timeoutError);
  }
  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  try {
    const existing = findMatchingElement(root, selector, predicate);
    if (existing) {
      return Promise.resolve(existing);
    }
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<T>((resolve, reject) => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let stopObserving: EventCleanup = () => undefined;

    const cleanup = (): void => {
      if (!active) {
        return;
      }
      active = false;
      stopObserving();
      signal?.removeEventListener("abort", handleAbort);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    const handleAbort = (): void => {
      cleanup();
      reject(getAbortReason(signal));
    };

    stopObserving = observeMutations(root, () => {
      try {
        const element = findMatchingElement(root, selector, predicate);
        if (element) {
          cleanup();
          resolve(element);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    signal?.addEventListener("abort", handleAbort, { once: true });

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(createTimeoutError(`Waiting for element "${selector}"`, timeout));
      }, timeout);
    }
  });
}

/** 等待指定元素从根节点中移除。元素已不在范围内时立即完成。 */
export function waitForElementRemoval(element: Element, options: WaitForElementRemovalOptions = {}): Promise<void> {
  const { root = element.ownerDocument, signal, timeout } = options;
  const timeoutError = validateTimeout(timeout, "Waiting for element removal");

  if (timeoutError) {
    return Promise.reject(timeoutError);
  }
  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }
  if (!root.contains(element)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let stopObserving: EventCleanup = () => undefined;

    const cleanup = (): void => {
      if (!active) {
        return;
      }
      active = false;
      stopObserving();
      signal?.removeEventListener("abort", handleAbort);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    const handleAbort = (): void => {
      cleanup();
      reject(getAbortReason(signal));
    };

    stopObserving = observeMutations(root, () => {
      if (!root.contains(element)) {
        cleanup();
        resolve();
      }
    });
    signal?.addEventListener("abort", handleAbort, { once: true });

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(createTimeoutError("Waiting for element removal", timeout));
      }, timeout);
    }
  });
}

/**
 * 等待元素尺寸在指定时间内不再变化。
 *
 * 适用于动画完成后截图、虚拟列表测量、图表初始化等需要等待
 * 布局稳定的场景。
 */
export function waitForStableSize(element: Element, options: WaitForStableSizeOptions = {}): Promise<ElementSizeSnapshot> {
  const { box, signal, stableFor = 100, timeout } = options;
  const stableForError = validateDuration(stableFor, "stableFor");
  const timeoutError = validateTimeout(timeout, "Waiting for stable element size");

  if (stableForError) {
    return Promise.reject(stableForError);
  }
  if (timeoutError) {
    return Promise.reject(timeoutError);
  }
  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<ElementSizeSnapshot>((resolve, reject) => {
    let active = true;
    let latest = readElementSize(element);
    let stableTimer: ReturnType<typeof setTimeout> | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let stopObserving: EventCleanup = () => undefined;

    const cleanup = (): void => {
      if (!active) {
        return;
      }
      active = false;
      stopObserving();
      signal?.removeEventListener("abort", handleAbort);
      if (stableTimer !== undefined) {
        clearTimeout(stableTimer);
      }
      if (timeoutTimer !== undefined) {
        clearTimeout(timeoutTimer);
      }
    };

    const completeWhenStable = (): void => {
      if (stableTimer !== undefined) {
        clearTimeout(stableTimer);
      }
      stableTimer = setTimeout(() => {
        cleanup();
        resolve(latest);
      }, stableFor);
    };

    const handleAbort = (): void => {
      cleanup();
      reject(getAbortReason(signal));
    };

    try {
      stopObserving = observeResize(
        element,
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) {
            return;
          }
          latest = { width: entry.contentRect.width, height: entry.contentRect.height };
          completeWhenStable();
        },
        box === undefined ? {} : { box },
      );
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
    completeWhenStable();

    if (timeout !== undefined) {
      timeoutTimer = setTimeout(() => {
        cleanup();
        reject(createTimeoutError("Waiting for stable element size", timeout));
      }, timeout);
    }
  });
}

/** 将单元素或可迭代元素集合转换为去重数组。 */
function normalizeElementTargets(targets: Element | Iterable<Element>): Element[] {
  const elements = targets instanceof Element ? [targets] : [...targets];
  const uniqueElements = [...new Set(elements)];

  if (uniqueElements.length === 0) {
    throw new TypeError("At least one observer target is required.");
  }

  return uniqueElements;
}

/** 查询根节点中的全部匹配元素。 */
function queryElements<T extends Element>(root: ObservationRoot, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/** 查找第一个通过可选断言的匹配元素。 */
function findMatchingElement<T extends Element>(root: ObservationRoot, selector: string, predicate: ((element: T) => boolean) | undefined): T | undefined {
  for (const element of root.querySelectorAll<T>(selector)) {
    if (!predicate || predicate(element)) {
      return element;
    }
  }
  return undefined;
}

/** 读取元素当前布局尺寸。 */
function readElementSize(element: Element): ElementSizeSnapshot {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/** 对缺失的原生 Observer 提供一致错误。 */
function ensureObserverSupported(supported: boolean, name: string): void {
  if (!supported) {
    throw new DOMException(`${name} is not supported in the current browser.`, "NotSupportedError");
  }
}

/** 校验可选超时时间。 */
function validateTimeout(timeout: number | undefined, operation: string): RangeError | undefined {
  if (timeout === undefined || (Number.isFinite(timeout) && timeout >= 0)) {
    return undefined;
  }
  return new RangeError(`${operation} timeout must be a non-negative finite number.`);
}

/** 校验必填的时长。 */
function validateDuration(duration: number, name: string): RangeError | undefined {
  if (Number.isFinite(duration) && duration >= 0) {
    return undefined;
  }
  return new RangeError(`${name} must be a non-negative finite number.`);
}

/** 创建带操作上下文的超时异常。 */
function createTimeoutError(operation: string, timeout: number): DOMException {
  return new DOMException(`${operation} timed out after ${timeout} ms.`, "TimeoutError");
}

/** 获取 AbortSignal 的中止原因，并兼容未提供 reason 的浏览器。 */
function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException("The observer operation was aborted.", "AbortError");
}

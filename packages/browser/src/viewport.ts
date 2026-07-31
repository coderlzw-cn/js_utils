import { combineEventCleanups, listenEvent } from "./event";
import type { EventCleanup } from "./event";
import { getBrowserWindow, isBrowserRuntime } from "./runtime";

/** 视口的宽高方向。 */
export type ViewportOrientation = "portrait" | "landscape";

/** Visual Viewport API 的稳定快照。 */
export interface VisualViewportSnapshot {
  /** 可视视口宽度，单位为 CSS 像素。 */
  readonly width: number;
  /** 可视视口高度，单位为 CSS 像素。 */
  readonly height: number;
  /** 可视视口相对布局视口的水平偏移。 */
  readonly offsetLeft: number;
  /** 可视视口相对布局视口的垂直偏移。 */
  readonly offsetTop: number;
  /** 可视视口在页面中的水平坐标。 */
  readonly pageLeft: number;
  /** 可视视口在页面中的垂直坐标。 */
  readonly pageTop: number;
  /** 缩放比例；未缩放时为 1。 */
  readonly scale: number;
}

/** 当前布局视口、可视视口和页面尺寸快照。 */
export interface ViewportSnapshot {
  /** 布局视口宽度。 */
  readonly width: number;
  /** 布局视口高度。 */
  readonly height: number;
  /** 页面内容总宽度。 */
  readonly documentWidth: number;
  /** 页面内容总高度。 */
  readonly documentHeight: number;
  /** 页面水平滚动位置。 */
  readonly scrollX: number;
  /** 页面垂直滚动位置。 */
  readonly scrollY: number;
  /** 物理像素与 CSS 像素的比例。 */
  readonly pixelRatio: number;
  /** 根据布局视口宽高得出的方向。 */
  readonly orientation: ViewportOrientation;
  /** 浏览器支持 Visual Viewport API 时提供。 */
  readonly visualViewport?: VisualViewportSnapshot;
}

/** 视口变化监听配置。 */
export interface ObserveViewportOptions {
  /**
   * 订阅后是否立即触发一次监听器。
   *
   * @default true
   */
  readonly emitInitial?: boolean;
  /** 是否监听页面和 Visual Viewport 滚动。 */
  readonly observeScroll?: boolean;
  /** 用于主动终止监听的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 视口变化监听器。 */
export type ViewportListener = (snapshot: ViewportSnapshot, event: Event | undefined) => void;

/** 媒体查询的稳定状态。 */
export interface MediaQueryState {
  readonly query: string;
  readonly matches: boolean;
}

/** 媒体查询监听配置。 */
export interface ObserveMediaQueryOptions {
  /**
   * 订阅后是否立即触发一次监听器。
   *
   * @default true
   */
  readonly emitInitial?: boolean;
  readonly signal?: AbortSignal;
}

/** 响应式断点表，数值表示断点的最小视口宽度。 */
export type ViewportBreakpoints<Name extends string = string> = Readonly<Record<Name, number>>;

/** 当前激活的响应式断点。 */
export interface ViewportBreakpointState<Name extends string = string> {
  readonly name: Name | null;
  readonly width: number;
  readonly minimumWidth: number | null;
}

/** 断点监听配置。 */
export type ObserveViewportBreakpointOptions = ObserveViewportOptions;

/** 可序列化的元素边界矩形。 */
export interface ViewportRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** 元素相对视口或指定根元素的可见状态。 */
export interface ElementViewportState {
  readonly visible: boolean;
  readonly fullyVisible: boolean;
  readonly intersectionRatio: number;
  readonly boundingRect: ViewportRect;
  readonly intersectionRect: ViewportRect;
  readonly rootRect: ViewportRect;
}

/** 元素可见性计算配置。 */
export interface ElementViewportOptions {
  /** null 表示使用当前视口。 */
  readonly root?: Element | null;
  /** 判定 visible 所需的最小相交比例。 */
  readonly threshold?: number;
}

/** IntersectionObserver 可见性监听配置。 */
export interface ObserveElementViewportOptions extends ElementViewportOptions {
  readonly rootMargin?: string;
  readonly signal?: AbortSignal;
}

/** CSS safe-area-inset-* 安全区内边距。 */
export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** 虚拟键盘对可视视口的占用状态。 */
export interface VirtualKeyboardState {
  readonly supported: boolean;
  readonly visible: boolean;
  readonly height: number;
}

/** 虚拟键盘检测配置。 */
export interface VirtualKeyboardOptions {
  /**
   * 高度差超过该值时认为键盘已打开。
   *
   * @default 150
   */
  readonly minimumHeight?: number;
}

/** 虚拟键盘监听配置。 */
export interface ObserveVirtualKeyboardOptions
  extends VirtualKeyboardOptions, ObserveViewportOptions {}

/** 页面滚动锁定配置。 */
export interface LockPageScrollOptions {
  /**
   * 是否补偿滚动条消失后的宽度，防止布局水平跳动。
   *
   * @default true
   */
  readonly reserveScrollbarGap?: boolean;
  readonly signal?: AbortSignal;
}

/** 视口 CSS 变量绑定配置。 */
export interface BindViewportCssVariablesOptions extends ObserveViewportOptions {
  /**
   * CSS 变量前缀。
   *
   * @default "--viewport"
   */
  readonly prefix?: `--${string}`;
  /** 默认写入 document.documentElement。 */
  readonly target?: HTMLElement;
}

interface SavedInlineStyle {
  readonly element: HTMLElement;
  readonly property: string;
  readonly value: string;
  readonly priority: string;
}

interface PageScrollLockState {
  count: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly styles: readonly SavedInlineStyle[];
}

let pageScrollLockState: PageScrollLockState | undefined;

/** 获取当前视口和页面尺寸的稳定快照。 */
export function getViewportSnapshot(): ViewportSnapshot {
  const browserWindow = getBrowserWindow();
  const documentElement = browserWindow.document.documentElement;
  const body = browserWindow.document.body;
  const width = documentElement.clientWidth || browserWindow.innerWidth;
  const height = documentElement.clientHeight || browserWindow.innerHeight;
  const visualViewport = browserWindow.visualViewport;

  return {
    width,
    height,
    documentWidth: Math.max(
      documentElement.scrollWidth,
      documentElement.offsetWidth,
      body?.scrollWidth ?? 0,
    ),
    documentHeight: Math.max(
      documentElement.scrollHeight,
      documentElement.offsetHeight,
      body?.scrollHeight ?? 0,
    ),
    scrollX: browserWindow.scrollX,
    scrollY: browserWindow.scrollY,
    pixelRatio: browserWindow.devicePixelRatio,
    orientation: width > height ? "landscape" : "portrait",
    ...(visualViewport
      ? {
          visualViewport: {
            width: visualViewport.width,
            height: visualViewport.height,
            offsetLeft: visualViewport.offsetLeft,
            offsetTop: visualViewport.offsetTop,
            pageLeft: visualViewport.pageLeft,
            pageTop: visualViewport.pageTop,
            scale: visualViewport.scale,
          },
        }
      : {}),
  };
}

/**
 * 监听布局视口和 Visual Viewport 变化。
 *
 * 同一帧内的 resize/scroll 事件会合并为一次回调，避免移动端
 * 键盘弹出和页面缩放时触发大量重复布局计算。
 */
export function observeViewport(
  listener: ViewportListener,
  options: ObserveViewportOptions = {},
): EventCleanup {
  const { emitInitial = true, observeScroll = true, signal } = options;
  const browserWindow = getBrowserWindow();

  if (signal?.aborted) {
    return () => undefined;
  }

  let active = true;
  let animationFrame: number | undefined;
  let latestEvent: Event | undefined;

  const flush = (): void => {
    animationFrame = undefined;
    if (active) {
      listener(getViewportSnapshot(), latestEvent);
    }
  };

  const schedule = (event: Event): void => {
    latestEvent = event;
    if (animationFrame === undefined) {
      animationFrame = browserWindow.requestAnimationFrame(flush);
    }
  };

  const cleanups: EventCleanup[] = [listenEvent(browserWindow, "resize", schedule)];
  const visualViewport = browserWindow.visualViewport;

  if (observeScroll) {
    cleanups.push(listenEvent(browserWindow, "scroll", schedule, { passive: true }));
  }

  if (visualViewport) {
    cleanups.push(listenEvent(visualViewport, "resize", schedule));
    if (observeScroll) {
      cleanups.push(listenEvent(visualViewport, "scroll", schedule, { passive: true }));
    }
  }

  const cleanupEvents = combineEventCleanups(...cleanups);
  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    cleanupEvents();
    signal?.removeEventListener("abort", cleanup);
    if (animationFrame !== undefined) {
      browserWindow.cancelAnimationFrame(animationFrame);
    }
  };

  signal?.addEventListener("abort", cleanup, { once: true });

  if (emitInitial) {
    try {
      listener(getViewportSnapshot(), undefined);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return cleanup;
}

/** 判断当前浏览器是否匹配指定 CSS 媒体查询。 */
export function matchesMediaQuery(query: string): boolean {
  return isBrowserRuntime() && getBrowserWindow().matchMedia(query).matches;
}

/** 监听 CSS 媒体查询，并兼容仅支持 addListener 的旧版 Safari。 */
export function observeMediaQuery(
  query: string,
  listener: (state: MediaQueryState, event: MediaQueryListEvent | undefined) => void,
  options: ObserveMediaQueryOptions = {},
): EventCleanup {
  const { emitInitial = true, signal } = options;
  const mediaQuery = getBrowserWindow().matchMedia(query);

  if (signal?.aborted) {
    return () => undefined;
  }

  let active = true;
  const handleChange = (event: MediaQueryListEvent): void => {
    listener({ query: mediaQuery.media, matches: event.matches }, event);
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleChange);
  } else {
    mediaQuery.addListener(handleChange);
  }

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    if (typeof mediaQuery.removeEventListener === "function") {
      mediaQuery.removeEventListener("change", handleChange);
    } else {
      mediaQuery.removeListener(handleChange);
    }
    signal?.removeEventListener("abort", cleanup);
  };

  signal?.addEventListener("abort", cleanup, { once: true });

  if (emitInitial) {
    try {
      listener({ query: mediaQuery.media, matches: mediaQuery.matches }, undefined);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return cleanup;
}

/** 根据最小宽度断点表计算当前激活断点。 */
export function getViewportBreakpoint<Name extends string>(
  breakpoints: ViewportBreakpoints<Name>,
  width = getViewportSnapshot().width,
): ViewportBreakpointState<Name> {
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError("Viewport width must be a non-negative finite number.");
  }

  let activeName: Name | null = null;
  let activeMinimumWidth: number | null = null;

  for (const [name, minimumWidth] of Object.entries<number>(breakpoints)) {
    if (!Number.isFinite(minimumWidth) || minimumWidth < 0) {
      throw new RangeError(`Breakpoint "${name}" must be a non-negative finite number.`);
    }
    if (
      minimumWidth <= width &&
      (activeMinimumWidth === null || minimumWidth > activeMinimumWidth)
    ) {
      activeName = name as Name;
      activeMinimumWidth = minimumWidth;
    }
  }

  return { name: activeName, width, minimumWidth: activeMinimumWidth };
}

/** 监听激活断点变化；同一断点内的普通宽度变化不会重复通知。 */
export function observeViewportBreakpoint<Name extends string>(
  breakpoints: ViewportBreakpoints<Name>,
  listener: (state: ViewportBreakpointState<Name>, event: Event | undefined) => void,
  options: ObserveViewportBreakpointOptions = {},
): EventCleanup {
  let previousName: Name | null | undefined;

  return observeViewport(
    (snapshot, event) => {
      const state = getViewportBreakpoint(breakpoints, snapshot.width);
      if (state.name !== previousName) {
        previousName = state.name;
        listener(state, event);
      }
    },
    { ...options, observeScroll: false },
  );
}

/** 判断当前环境是否支持 IntersectionObserver。 */
export function isIntersectionObserverSupported(): boolean {
  return isBrowserRuntime() && typeof IntersectionObserver === "function";
}

/** 同步计算元素相对视口或指定根元素的可见性。 */
export function getElementViewportState(
  element: Element,
  options: ElementViewportOptions = {},
): ElementViewportState {
  const threshold = validateRatio(options.threshold ?? 0);
  const elementRect = toViewportRect(element.getBoundingClientRect());
  const viewport = getViewportSnapshot();
  const rootRect = options.root
    ? toViewportRect(options.root.getBoundingClientRect())
    : createViewportRect(0, viewport.width, viewport.height, 0);
  const intersectionRect = intersectViewportRects(elementRect, rootRect);
  const elementArea = elementRect.width * elementRect.height;
  const intersectionArea = intersectionRect.width * intersectionRect.height;
  const intersectionRatio = elementArea > 0 ? intersectionArea / elementArea : 0;

  return {
    visible: intersectionArea > 0 && intersectionRatio >= threshold,
    fullyVisible: elementArea > 0 && intersectionRatio >= 1,
    intersectionRatio,
    boundingRect: elementRect,
    intersectionRect,
    rootRect,
  };
}

/**
 * 使用 IntersectionObserver 监听元素可见性。
 *
 * 浏览器会异步派发初始状态；返回的清理函数可重复调用。
 */
export function observeElementViewport(
  element: Element,
  listener: (state: ElementViewportState, entry: IntersectionObserverEntry) => void,
  options: ObserveElementViewportOptions = {},
): EventCleanup {
  const { root = null, rootMargin, signal } = options;
  const threshold = validateRatio(options.threshold ?? 0);

  if (signal?.aborted) {
    return () => undefined;
  }
  if (!isIntersectionObserverSupported()) {
    throw new DOMException(
      "IntersectionObserver is not supported in the current browser.",
      "NotSupportedError",
    );
  }

  let active = true;
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!active || !entry) {
        return;
      }

      const boundingRect = toViewportRect(entry.boundingClientRect);
      const intersectionRect = toViewportRect(entry.intersectionRect);
      const fallbackRootRect = createViewportRect(
        0,
        getViewportSnapshot().width,
        getViewportSnapshot().height,
        0,
      );
      const rootRect = entry.rootBounds ? toViewportRect(entry.rootBounds) : fallbackRootRect;

      listener(
        {
          visible: entry.isIntersecting && entry.intersectionRatio >= threshold,
          fullyVisible: entry.isIntersecting && entry.intersectionRatio >= 1,
          intersectionRatio: entry.intersectionRatio,
          boundingRect,
          intersectionRect,
          rootRect,
        },
        entry,
      );
    },
    { root, ...(rootMargin === undefined ? {} : { rootMargin }), threshold },
  );

  const cleanup = (): void => {
    if (!active) {
      return;
    }
    active = false;
    observer.disconnect();
    signal?.removeEventListener("abort", cleanup);
  };

  observer.observe(element);
  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

/** 读取 CSS env(safe-area-inset-*) 的当前像素值。 */
export function getSafeAreaInsets(): SafeAreaInsets {
  const browserWindow = getBrowserWindow();
  const documentValue = browserWindow.document;
  const probe = documentValue.createElement("div");
  const parent = documentValue.body ?? documentValue.documentElement;

  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);" +
    "padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);";
  parent.appendChild(probe);

  try {
    const style = browserWindow.getComputedStyle(probe);
    return {
      top: parseCssPixels(style.paddingTop),
      right: parseCssPixels(style.paddingRight),
      bottom: parseCssPixels(style.paddingBottom),
      left: parseCssPixels(style.paddingLeft),
    };
  } finally {
    probe.remove();
  }
}

/**
 * 基于 Visual Viewport 高度差估算屏幕虚拟键盘状态。
 *
 * 这是面向布局的启发式检测，不应用于鉴权或用户行为判定。
 */
export function getVirtualKeyboardState(
  options: VirtualKeyboardOptions = {},
): VirtualKeyboardState {
  const minimumHeight = validateNonNegativeNumber(options.minimumHeight ?? 150, "minimumHeight");
  const snapshot = getViewportSnapshot();
  const visualViewport = snapshot.visualViewport;

  if (!visualViewport) {
    return { supported: false, visible: false, height: 0 };
  }

  const height = Math.max(0, snapshot.height - visualViewport.height - visualViewport.offsetTop);
  return { supported: true, visible: height >= minimumHeight, height };
}

/** 监听估算的虚拟键盘状态，仅在可见性或高度变化时通知。 */
export function observeVirtualKeyboard(
  listener: (state: VirtualKeyboardState, event: Event | undefined) => void,
  options: ObserveVirtualKeyboardOptions = {},
): EventCleanup {
  let previous: VirtualKeyboardState | undefined;

  return observeViewport((_snapshot, event) => {
    const state = getVirtualKeyboardState(options);
    if (!previous || state.visible !== previous.visible || state.height !== previous.height) {
      previous = state;
      listener(state, event);
    }
  }, options);
}

/**
 * 锁定页面滚动，并在最后一个锁释放时恢复原位置。
 *
 * 支持嵌套调用，适用于多层 Modal/Drawer 同时打开。每次调用都必须
 * 保留并调用各自的清理函数。
 */
export function lockPageScroll(options: LockPageScrollOptions = {}): EventCleanup {
  const browserWindow = getBrowserWindow();
  const documentValue = browserWindow.document;
  const { signal } = options;

  if (signal?.aborted) {
    return () => undefined;
  }
  if (!documentValue.body) {
    throw new DOMException(
      "Page scroll cannot be locked before document.body exists.",
      "InvalidStateError",
    );
  }

  if (pageScrollLockState) {
    pageScrollLockState.count += 1;
  } else {
    const documentElement = documentValue.documentElement;
    const body = documentValue.body;
    const properties: ReadonlyArray<readonly [HTMLElement, string]> = [
      [documentElement, "overflow"],
      [body, "overflow"],
      [body, "position"],
      [body, "top"],
      [body, "left"],
      [body, "width"],
      [body, "padding-right"],
    ];
    const styles = properties.map(([element, property]) => saveInlineStyle(element, property));
    const scrollX = browserWindow.scrollX;
    const scrollY = browserWindow.scrollY;
    const scrollbarGap = Math.max(0, browserWindow.innerWidth - documentElement.clientWidth);

    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = "100%";

    if ((options.reserveScrollbarGap ?? true) && scrollbarGap > 0) {
      const paddingRight = parseCssPixels(browserWindow.getComputedStyle(body).paddingRight);
      body.style.paddingRight = `${paddingRight + scrollbarGap}px`;
    }

    pageScrollLockState = { count: 1, scrollX, scrollY, styles };
  }

  let active = true;
  const cleanup = (): void => {
    if (!active) {
      return;
    }
    active = false;
    signal?.removeEventListener("abort", cleanup);

    const state = pageScrollLockState;
    if (!state) {
      return;
    }

    state.count -= 1;
    if (state.count === 0) {
      for (const style of state.styles) {
        restoreInlineStyle(style);
      }
      pageScrollLockState = undefined;
      browserWindow.scrollTo(state.scrollX, state.scrollY);
    }
  };

  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

/**
 * 将当前视口指标持续写入 CSS 变量。
 *
 * 写入 width/height/visual-width/visual-height/offset-x/offset-y/scale/pixel-ratio；
 * 清理时会恢复目标元素上原有的内联变量值。
 */
export function bindViewportCssVariables(
  options: BindViewportCssVariablesOptions = {},
): EventCleanup {
  const browserWindow = getBrowserWindow();
  const {
    prefix = "--viewport",
    signal,
    target = browserWindow.document.documentElement,
  } = options;

  if (signal?.aborted) {
    return () => undefined;
  }
  if (!prefix.startsWith("--") || prefix.length === 2) {
    throw new TypeError("Viewport CSS variable prefix must start with '--' and include a name.");
  }

  const names = [
    "width",
    "height",
    "visual-width",
    "visual-height",
    "offset-x",
    "offset-y",
    "scale",
    "pixel-ratio",
  ];
  const savedStyles = names.map((name) => saveInlineStyle(target, `${prefix}-${name}`));
  let active = true;
  const stopObserving = observeViewport(
    (snapshot) => {
      const visual = snapshot.visualViewport;
      target.style.setProperty(`${prefix}-width`, `${snapshot.width}px`);
      target.style.setProperty(`${prefix}-height`, `${snapshot.height}px`);
      target.style.setProperty(`${prefix}-visual-width`, `${visual?.width ?? snapshot.width}px`);
      target.style.setProperty(`${prefix}-visual-height`, `${visual?.height ?? snapshot.height}px`);
      target.style.setProperty(`${prefix}-offset-x`, `${visual?.offsetLeft ?? 0}px`);
      target.style.setProperty(`${prefix}-offset-y`, `${visual?.offsetTop ?? 0}px`);
      target.style.setProperty(`${prefix}-scale`, String(visual?.scale ?? 1));
      target.style.setProperty(`${prefix}-pixel-ratio`, String(snapshot.pixelRatio));
    },
    {
      ...(options.emitInitial === undefined ? {} : { emitInitial: options.emitInitial }),
      ...(options.observeScroll === undefined ? {} : { observeScroll: options.observeScroll }),
    },
  );

  const cleanup = (): void => {
    if (!active) {
      return;
    }
    active = false;
    stopObserving();
    signal?.removeEventListener("abort", cleanup);
    for (const style of savedStyles) {
      restoreInlineStyle(style);
    }
  };

  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

/** 当前文档的全屏状态快照。 */
export interface FullscreenState {
  /** 当前文档是否允许使用全屏能力。 */
  readonly supported: boolean;
  /** 当前是否存在全屏元素。 */
  readonly active: boolean;
  /** 当前全屏元素；未进入全屏时为 null。 */
  readonly element: Element | null;
}

/** 进入全屏的扩展配置。 */
export interface RequestFullscreenOptions extends FullscreenOptions {
  /** 用于取消等待全屏请求结果的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 全屏状态监听配置。 */
export interface ObserveFullscreenOptions {
  /**
   * 订阅后是否立即触发一次监听器。
   *
   * @default true
   */
  readonly emitInitial?: boolean;
  /** 用于主动终止监听的 AbortSignal。 */
  readonly signal?: AbortSignal;
  /** 全屏请求或退出失败时的错误事件监听器。 */
  readonly onError?: (event: Event) => void;
}

/** 全屏状态变化监听器。 */
export type FullscreenListener = (state: FullscreenState, event: Event | undefined) => void;

/** 带 WebKit 前缀的 Document 全屏能力。 */
interface WebkitFullscreenDocument extends Document {
  readonly webkitFullscreenEnabled?: boolean;
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/** 带 WebKit 前缀的 Element 全屏能力。 */
interface WebkitFullscreenElement extends Element {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** iOS Safari 原生视频全屏能力。 */
interface WebkitFullscreenVideoElement extends HTMLVideoElement {
  readonly webkitDisplayingFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
}

/** 统一后的全屏请求调用器。 */
interface FullscreenRequestInvoker {
  invoke(options: FullscreenOptions): Promise<void> | void;
}

/**
 * 判断当前文档是否允许使用 Fullscreen API。
 *
 * 返回 false 可能表示浏览器不支持，也可能表示 iframe 未声明 allow="fullscreen"、
 * Permissions Policy 禁止或当前文档不是活动文档。
 */
export function isFullscreenSupported(): boolean {
  if (!isBrowserRuntime()) {
    return false;
  }

  const documentValue = getBrowserWindow().document as WebkitFullscreenDocument;

  if (typeof documentValue.fullscreenEnabled === "boolean") {
    return documentValue.fullscreenEnabled;
  }

  if (typeof documentValue.webkitFullscreenEnabled === "boolean") {
    return documentValue.webkitFullscreenEnabled;
  }

  return getFullscreenRequestInvoker(documentValue.documentElement) !== undefined;
}

/** 获取当前全屏元素，兼容 Safari 的 WebKit 前缀。 */
export function getFullscreenElement(): Element | null {
  const documentValue = getBrowserWindow().document as WebkitFullscreenDocument;
  return documentValue.fullscreenElement ?? documentValue.webkitFullscreenElement ?? null;
}

/** 判断当前文档是否处于全屏状态。 */
export function isFullscreen(): boolean {
  return getFullscreenElement() !== null;
}

/** 获取当前全屏状态的稳定快照。 */
export function getFullscreenState(): FullscreenState {
  const element = getFullscreenElement();

  return {
    supported: isFullscreenSupported(),
    active: element !== null,
    element,
  };
}

/**
 * 请求指定元素进入全屏，并返回完成后的状态快照。
 *
 * 默认使用 document.documentElement。浏览器通常要求该函数在用户手势处理器中
 * 同步调用。若等待期间 signal 被取消，迟到进入的目标元素会被安全退出，防止
 * 调用方已销毁后页面仍停留在全屏状态。
 */
export async function requestFullscreen(
  element?: Element,
  options: RequestFullscreenOptions = {},
): Promise<FullscreenState> {
  const browserWindow = getBrowserWindow();
  const target = element ?? browserWindow.document.documentElement;
  const { signal, ...fullscreenOptions } = options;

  if (signal?.aborted) {
    throw getAbortReason(signal);
  }

  const request = getFullscreenRequestInvoker(target);

  if (!request || !isFullscreenSupported()) {
    throw new DOMException(
      "Fullscreen API is not available for the current document.",
      "NotSupportedError",
    );
  }

  let operation: Promise<void> | void;

  try {
    // 必须在当前调用栈中触发原生方法，才能保留浏览器授予的用户激活状态。
    operation = request.invoke(fullscreenOptions);
  } catch (error) {
    throw toFullscreenError(error, "Failed to enter fullscreen.");
  }

  try {
    await waitForFullscreenOperation(operation, signal, target);
  } catch (error) {
    throw toFullscreenError(error, "Failed to enter fullscreen.");
  }

  return getFullscreenState();
}

/**
 * 退出当前文档全屏，并返回完成后的状态快照。
 *
 * 当前未处于全屏时直接返回状态，不调用原生退出方法，因此可安全重复执行。
 */
export async function exitFullscreen(): Promise<FullscreenState> {
  if (!isFullscreen()) {
    return getFullscreenState();
  }

  const documentValue = getBrowserWindow().document as WebkitFullscreenDocument;
  const exit =
    documentValue.exitFullscreen?.bind(documentValue) ??
    documentValue.webkitExitFullscreen?.bind(documentValue);

  if (!exit) {
    throw new DOMException(
      "Fullscreen exit is not supported in the current browser.",
      "NotSupportedError",
    );
  }

  try {
    await Promise.resolve(exit());
  } catch (error) {
    throw toFullscreenError(error, "Failed to exit fullscreen.");
  }

  return getFullscreenState();
}

/** 当前处于全屏时退出，否则让指定元素进入全屏。 */
export function toggleFullscreen(
  element?: Element,
  options: RequestFullscreenOptions = {},
): Promise<FullscreenState> {
  return isFullscreen() ? exitFullscreen() : requestFullscreen(element, options);
}

/**
 * 监听标准及 WebKit 全屏状态变化和错误事件。
 *
 * 同时注册两组事件以兼容 Safari，并通过元素状态去重，避免浏览器同时派发标准
 * 与前缀事件时重复通知。初次回调失败会立即清理全部监听器。
 */
export function observeFullscreen(
  listener: FullscreenListener,
  options: ObserveFullscreenOptions = {},
): EventCleanup {
  const { emitInitial = true, onError, signal } = options;
  const documentValue = getBrowserWindow().document;

  if (signal?.aborted) {
    return () => undefined;
  }

  const listenerOptions = signal ? { signal } : undefined;
  let previousElement = getFullscreenElement();

  const handleChange = (event: Event): void => {
    const currentElement = getFullscreenElement();

    if (currentElement === previousElement) {
      return;
    }

    previousElement = currentElement;
    listener(getFullscreenState(), event);
  };

  const handleError = (event: Event): void => {
    onError?.(event);
  };

  const cleanup = combineEventCleanups(
    listenEvent(documentValue, "fullscreenchange", handleChange, listenerOptions),
    listenEvent(documentValue, "webkitfullscreenchange", handleChange, listenerOptions),
    listenEvent(documentValue, "fullscreenerror", handleError, listenerOptions),
    listenEvent(documentValue, "webkitfullscreenerror", handleError, listenerOptions),
  );

  if (emitInitial) {
    try {
      listener(getFullscreenState(), undefined);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return cleanup;
}

/**
 * 判断视频元素是否支持标准全屏或 iOS Safari 原生视频全屏。
 *
 * WebKit 视频全屏与 Document Fullscreen API 是两套独立状态。
 */
export function isVideoFullscreenSupported(video: HTMLVideoElement): boolean {
  const webkitVideo = video as WebkitFullscreenVideoElement;
  return (
    getFullscreenRequestInvoker(video) !== undefined ||
    typeof webkitVideo.webkitEnterFullscreen === "function"
  );
}

/** 判断指定视频是否正在标准全屏或 iOS Safari 原生视频全屏中。 */
export function isVideoFullscreen(video: HTMLVideoElement): boolean {
  const webkitVideo = video as WebkitFullscreenVideoElement;
  return getFullscreenElement() === video || webkitVideo.webkitDisplayingFullscreen === true;
}

/**
 * 让视频进入全屏；优先使用标准 Fullscreen API，必要时降级到 iOS Safari API。
 *
 * 与普通全屏一样，应在用户手势处理器中同步调用。
 */
export async function requestVideoFullscreen(
  video: HTMLVideoElement,
  options: RequestFullscreenOptions = {},
): Promise<void> {
  if (getFullscreenRequestInvoker(video) && isFullscreenSupported()) {
    await requestFullscreen(video, options);
    return;
  }

  if (options.signal?.aborted) {
    throw getAbortReason(options.signal);
  }

  const webkitVideo = video as WebkitFullscreenVideoElement;

  if (typeof webkitVideo.webkitEnterFullscreen !== "function") {
    throw new DOMException(
      "Video fullscreen is not supported in the current browser.",
      "NotSupportedError",
    );
  }

  try {
    webkitVideo.webkitEnterFullscreen();
  } catch (error) {
    throw toFullscreenError(error, "Failed to enter video fullscreen.");
  }
}

/** 退出指定视频的标准全屏或 iOS Safari 原生视频全屏。 */
export async function exitVideoFullscreen(video: HTMLVideoElement): Promise<void> {
  if (getFullscreenElement() === video) {
    await exitFullscreen();
    return;
  }

  const webkitVideo = video as WebkitFullscreenVideoElement;

  if (
    webkitVideo.webkitDisplayingFullscreen &&
    typeof webkitVideo.webkitExitFullscreen === "function"
  ) {
    webkitVideo.webkitExitFullscreen();
  }
}

/** 将 DOMRect 复制为不会随浏览器布局变化的普通对象。 */
function toViewportRect(
  rect: Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left" | "width" | "height">,
): ViewportRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** 通过边界坐标创建标准化矩形。 */
function createViewportRect(
  top: number,
  right: number,
  bottom: number,
  left: number,
): ViewportRect {
  return {
    top,
    right,
    bottom,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** 计算两个边界矩形的交集。 */
function intersectViewportRects(first: ViewportRect, second: ViewportRect): ViewportRect {
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  const left = Math.max(first.left, second.left);

  if (right <= left || bottom <= top) {
    return createViewportRect(top, left, top, left);
  }

  return createViewportRect(top, right, bottom, left);
}

/** 校验 0 到 1 的相交比例。 */
function validateRatio(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("Viewport intersection threshold must be between 0 and 1.");
  }
  return value;
}

/** 校验有限非负数。 */
function validateNonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
  return value;
}

/** 将 CSS 像素值转换为有限数字，无效值按 0 处理。 */
function parseCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 保存元素的单个内联样式，供可逆的 DOM 操作使用。 */
function saveInlineStyle(element: HTMLElement, property: string): SavedInlineStyle {
  return {
    element,
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  };
}

/** 恢复之前保存的单个内联样式。 */
function restoreInlineStyle(style: SavedInlineStyle): void {
  if (style.value) {
    style.element.style.setProperty(style.property, style.value, style.priority);
  } else {
    style.element.style.removeProperty(style.property);
  }
}

/** 获取标准或 WebKit 前缀的元素全屏调用器。 */
function getFullscreenRequestInvoker(element: Element): FullscreenRequestInvoker | undefined {
  if (typeof element.requestFullscreen === "function") {
    return {
      invoke: (options) => element.requestFullscreen(options),
    };
  }

  const webkitElement = element as WebkitFullscreenElement;

  if (typeof webkitElement.webkitRequestFullscreen === "function") {
    return {
      invoke: () => webkitElement.webkitRequestFullscreen?.(),
    };
  }

  return undefined;
}

/**
 * 等待原生全屏 Promise，并在取消后回收迟到进入的目标元素。
 *
 * 仅当迟到的全屏元素仍是本次目标时才退出，避免误退出其他模块随后发起的全屏。
 */
function waitForFullscreenOperation(
  operation: Promise<void> | void,
  signal: AbortSignal | undefined,
  target: Element,
): Promise<void> {
  if (!signal) {
    return Promise.resolve(operation);
  }

  return new Promise<void>((resolve, reject) => {
    let active = true;

    const cleanup = (): void => {
      signal.removeEventListener("abort", handleAbort);
    };

    const handleAbort = (): void => {
      if (!active) {
        return;
      }

      active = false;
      cleanup();
      reject(getAbortReason(signal));
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    Promise.resolve(operation).then(
      () => {
        if (!active) {
          if (getFullscreenElement() === target) {
            void exitFullscreen().catch(() => undefined);
          }
          return;
        }

        active = false;
        cleanup();
        resolve();
      },
      (error: unknown) => {
        if (!active) {
          return;
        }

        active = false;
        cleanup();
        reject(error);
      },
    );
  });
}

/** 将非 Error 的浏览器拒绝值转换为带上下文的 DOMException。 */
function toFullscreenError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new DOMException(fallbackMessage, "InvalidStateError");
}

/** 获取 AbortSignal 的中止原因，并兼容未提供 reason 的浏览器。 */
function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The fullscreen operation was aborted.", "AbortError");
}

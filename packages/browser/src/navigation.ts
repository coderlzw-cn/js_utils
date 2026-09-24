import { combineEventCleanups, dispatchCustomEvent, listenEvent } from "./event";
import type { EventCleanup } from "./event";
import { getBrowserWindow } from "./runtime";

/** 本模块内部用于广播 History API 更新的事件名。 */
const NAVIGATION_CHANGE_EVENT = "@utils/browser:navigation-change";

/** 导航变化来源。 */
export type NavigationSource = "initial" | "push" | "replace" | "popstate" | "hashchange";

/** 查询参数允许写入的标量值。 */
export type QueryParameterValue = string | number | boolean | null | undefined;

/** 单个查询参数更新值；数组用于生成同名多值参数。 */
export type QueryParameterUpdate = QueryParameterValue | readonly QueryParameterValue[];

/** 导航状态快照。 */
export interface NavigationSnapshot<T = unknown> {
  /** 变化发生后的完整 URL；返回副本，外部修改不会影响浏览器地址。 */
  readonly url: URL;
  /** 当前 history.state；浏览器未设置状态时为 null。 */
  readonly state: T | null;
  /** 触发本次快照的导航来源。 */
  readonly source: NavigationSource;
}

/** History API 写入配置。 */
export interface HistoryNavigationOptions {
  /** 与历史记录关联的可结构化克隆状态。 */
  readonly state?: unknown;
}

/** 查询参数或 Hash 更新配置。 */
export interface UrlUpdateOptions extends HistoryNavigationOptions {
  /**
   * 是否替换当前历史记录；为 false 时新增一条记录。
   *
   * @default false
   */
  readonly replace?: boolean;
}

/** 完整页面跳转配置。 */
export interface NavigateToOptions {
  /**
   * 是否使用 location.replace，避免在历史记录中保留当前页面。
   *
   * @default false
   */
  readonly replace?: boolean;
  /**
   * 是否只允许跳转到当前源。
   *
   * @default false
   */
  readonly sameOriginOnly?: boolean;
  /**
   * 允许导航的协议，默认仅允许 HTTP 和 HTTPS，防止意外执行 javascript: URL。
   *
   * @default ["http:", "https:"]
   */
  readonly allowedProtocols?: readonly string[];
}

/** 导航变化监听配置。 */
export interface ObserveNavigationOptions {
  /**
   * 订阅后是否立即触发一次监听器。
   *
   * @default true
   */
  readonly emitInitial?: boolean;
  /** 用于主动终止监听的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 导航变化监听器。 */
export type NavigationListener = (snapshot: NavigationSnapshot, event: Event | undefined) => void;

/** 获取当前 URL 的独立副本。 */
export function getCurrentUrl(): URL {
  return new URL(getBrowserWindow().location.href);
}

/**
 * 基于当前页面或指定基准地址解析 URL。
 *
 * 相对地址会根据 base 解析；未传 base 时使用当前页面。无效地址会保留原生
 * URL 构造函数的 TypeError，便于调用方明确处理输入错误。
 */
export function resolveUrl(input: string | URL, base: string | URL = getCurrentUrl()): URL {
  return new URL(input, base);
}

/** 判断目标地址是否与当前页面同源；无效地址返回 false。 */
export function isSameOriginUrl(input: string | URL): boolean {
  const browserWindow = getBrowserWindow();

  try {
    return resolveUrl(input, browserWindow.location.href).origin === browserWindow.location.origin;
  } catch {
    return false;
  }
}

/** 获取当前查询参数的可变副本。 */
export function getQueryParameters(): URLSearchParams {
  return new URLSearchParams(getCurrentUrl().searchParams);
}

/** 获取当前查询参数的第一个值；参数不存在时返回 undefined。 */
export function getQueryParameter(name: string): string | undefined {
  return getCurrentUrl().searchParams.get(name) ?? undefined;
}

/** 获取当前查询参数的全部同名值。 */
export function getAllQueryParameterValues(name: string): string[] {
  return getCurrentUrl().searchParams.getAll(name);
}

/**
 * 创建更新查询参数后的 URL，不修改浏览器历史记录。
 *
 * undefined 表示保持原值，null 表示删除；数组会先删除原有同名参数，再按顺序
 * 追加非 null/undefined 值。该设计便于直接传入包含可选字段的筛选条件对象。
 */
export function createUrlWithQueryParameters(updates: Readonly<Record<string, QueryParameterUpdate>>, input: string | URL = getCurrentUrl()): URL {
  const url = resolveUrl(input);

  for (const [name, update] of Object.entries(updates)) {
    if (update === undefined) {
      continue;
    }

    url.searchParams.delete(name);

    if (Array.isArray(update)) {
      for (const value of update) {
        if (value !== null && value !== undefined) {
          url.searchParams.append(name, String(value));
        }
      }
    } else if (update !== null) {
      url.searchParams.set(name, String(update));
    }
  }

  return url;
}

/**
 * 更新当前 URL 的查询参数并写入 History。
 *
 * 默认新增历史记录；传入 replace 可替换当前记录。操作不会触发页面刷新。
 */
export function updateQueryParameters(updates: Readonly<Record<string, QueryParameterUpdate>>, options: UrlUpdateOptions = {}): NavigationSnapshot {
  const url = createUrlWithQueryParameters(updates);
  return commitUrlUpdate(url, options);
}

/**
 * 创建更新 Hash 后的 URL，不修改浏览器历史记录。
 *
 * 传入 null 或空字符串会清除 Hash；是否包含开头的 # 均可。
 */
export function createUrlWithHash(hash: string | null, input: string | URL = getCurrentUrl()): URL {
  const url = resolveUrl(input);
  url.hash = hash ? normalizeHash(hash) : "";
  return url;
}

/** 更新当前 URL 的 Hash 并写入 History，不触发页面刷新。 */
export function updateHash(hash: string | null, options: UrlUpdateOptions = {}): NavigationSnapshot {
  return commitUrlUpdate(createUrlWithHash(hash), options);
}

/**
 * 使用 history.pushState 新增同源历史记录。
 *
 * History API 不允许跨源 URL，本函数会在调用浏览器 API 前抛出明确错误。
 */
export function pushNavigationState(input: string | URL = getCurrentUrl(), options: HistoryNavigationOptions = {}): NavigationSnapshot {
  return writeHistory("push", input, options.state ?? null);
}

/** 使用 history.replaceState 替换当前同源历史记录。 */
export function replaceNavigationState(input: string | URL = getCurrentUrl(), options: HistoryNavigationOptions = {}): NavigationSnapshot {
  return writeHistory("replace", input, options.state ?? null);
}

/**
 * 执行完整页面跳转。
 *
 * 默认允许跨源 HTTP(S) 地址，但拒绝 javascript:、data: 等协议。该函数会触发
 * 页面卸载；若只需修改 SPA 地址，请使用 pushNavigationState 或 replaceNavigationState。
 */
export function navigateTo(input: string | URL, options: NavigateToOptions = {}): void {
  const { allowedProtocols = ["http:", "https:"], replace = false, sameOriginOnly = false } = options;
  const browserWindow = getBrowserWindow();
  const url = resolveUrl(input, browserWindow.location.href);

  if (!allowedProtocols.includes(url.protocol)) {
    throw new TypeError(`Navigation protocol is not allowed: ${url.protocol}`);
  }

  if (sameOriginOnly && url.origin !== browserWindow.location.origin) {
    throw new DOMException("Cross-origin navigation is not allowed.", "SecurityError");
  }

  if (replace) {
    browserWindow.location.replace(url.href);
  } else {
    browserWindow.location.assign(url.href);
  }
}

/** 刷新当前页面。 */
export function reloadPage(): void {
  getBrowserWindow().location.reload();
}

/** 返回上一条历史记录。 */
export function goBack(): void {
  getBrowserWindow().history.back();
}

/** 前进到下一条历史记录。 */
export function goForward(): void {
  getBrowserWindow().history.forward();
}

/**
 * 在会话历史中移动指定步数。
 *
 * 正数前进、负数后退、0 通常会刷新当前页面；实际行为由浏览器决定。
 */
export function goToHistory(delta: number): void {
  if (!Number.isInteger(delta)) {
    throw new TypeError("history delta must be an integer");
  }

  getBrowserWindow().history.go(delta);
}

/** 获取当前 history.state，并将未设置状态统一为 null。 */
export function getNavigationState<T = unknown>(): T | null {
  const state: unknown = getBrowserWindow().history.state;
  return state === null || state === undefined ? null : (state as T);
}

/**
 * 设置浏览器历史滚动恢复模式，并返回恢复原值的幂等函数。
 *
 * 清理时仅在当前模式仍等于本次设置值时恢复，避免覆盖其他模块后续做出的修改。
 */
export function setScrollRestoration(mode: ScrollRestoration): EventCleanup {
  const history = getBrowserWindow().history;
  const previousMode = history.scrollRestoration;
  let active = true;

  history.scrollRestoration = mode;

  return () => {
    if (!active) {
      return;
    }

    active = false;

    if (history.scrollRestoration === mode) {
      history.scrollRestoration = previousMode;
    }
  };
}

/**
 * 统一监听本模块 History 更新及浏览器原生 popstate、hashchange 事件。
 *
 * 本实现不会修改全局 history 方法，因此不会与路由框架发生猴子补丁冲突。
 * 路由框架直接调用 pushState/replaceState 时不会自动通知，请改用本模块写入函数。
 */
export function observeNavigation(listener: NavigationListener, options: ObserveNavigationOptions = {}): EventCleanup {
  const { emitInitial = true, signal } = options;
  const browserWindow = getBrowserWindow();

  if (signal?.aborted) {
    return () => undefined;
  }

  const listenerOptions = signal ? { signal } : undefined;
  const cleanup = combineEventCleanups(
    listenEvent<PopStateEvent>(browserWindow, "popstate", (event) => listener(createNavigationSnapshot("popstate"), event), listenerOptions),
    listenEvent<HashChangeEvent>(browserWindow, "hashchange", (event) => listener(createNavigationSnapshot("hashchange"), event), listenerOptions),
    listenEvent<CustomEvent<NavigationSnapshot>>(browserWindow, NAVIGATION_CHANGE_EVENT, (event) => listener(event.detail, event), listenerOptions),
  );

  if (emitInitial) {
    try {
      listener(createNavigationSnapshot("initial"), undefined);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return cleanup;
}

/** 根据配置选择 pushState 或 replaceState。 */
function commitUrlUpdate(url: URL, options: UrlUpdateOptions): NavigationSnapshot {
  return options.replace ? replaceNavigationState(url, options) : pushNavigationState(url, options);
}

/** 执行同源 History 写入并广播导航变化。 */
function writeHistory(source: "push" | "replace", input: string | URL, state: unknown): NavigationSnapshot {
  const browserWindow = getBrowserWindow();
  const url = resolveUrl(input, browserWindow.location.href);

  if (url.origin !== browserWindow.location.origin) {
    throw new DOMException("History API only accepts same-origin URLs.", "SecurityError");
  }

  if (source === "push") {
    browserWindow.history.pushState(state, "", url);
  } else {
    browserWindow.history.replaceState(state, "", url);
  }

  const snapshot = createNavigationSnapshot(source);
  dispatchCustomEvent(browserWindow, NAVIGATION_CHANGE_EVENT, snapshot);
  return snapshot;
}

/** 从当前浏览器状态创建不受外部 URL 修改影响的导航快照。 */
function createNavigationSnapshot(source: NavigationSource): NavigationSnapshot {
  return {
    url: getCurrentUrl(),
    state: getNavigationState(),
    source,
  };
}

/** 统一 Hash 的开头，避免调用方重复处理 #。 */
function normalizeHash(hash: string): string {
  return hash.startsWith("#") ? hash : `#${hash}`;
}

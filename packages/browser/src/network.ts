import { getBrowserWindow, isBrowserRuntime } from "./runtime";

/** 浏览器报告的网络连接信息。 */
export interface NetworkConnectionInfo {
  /** 物理连接类型，例如 `wifi`、`cellular` 或 `ethernet`。 */
  readonly type?: string;
  /** 估算的有效连接类型，例如 `slow-2g`、`2g`、`3g` 或 `4g`。 */
  readonly effectiveType?: string;
  /** 估算的下行速度，单位为 Mbps。 */
  readonly downlink?: number;
  /** 估算的往返延迟，单位为毫秒。 */
  readonly rtt?: number;
  /** 用户是否启用了“减少数据使用量”偏好。 */
  readonly saveData?: boolean;
}

/** 浏览器当前可观测到的网络状态。 */
export interface NetworkStatus {
  /** 浏览器是否认为设备当前在线。 */
  readonly online: boolean;
  /** 浏览器支持 Network Information API 时提供的连接信息。 */
  readonly connection?: NetworkConnectionInfo;
}

/** 网络状态变化监听器。 */
export type NetworkStatusListener = (status: NetworkStatus, event: Event | undefined) => void;

/** 网络状态监听配置。 */
export interface ObserveNetworkStatusOptions {
  /**
   * 订阅后是否立即触发一次监听器。
   *
   * @default true
   */
  readonly emitInitial?: boolean;
  /** 用于主动终止监听的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** Network Information API 的最小结构，避免依赖尚未标准化完整的 DOM 类型。 */
interface BrowserNetworkInformation extends EventTarget {
  readonly type?: unknown;
  readonly effectiveType?: unknown;
  readonly downlink?: unknown;
  readonly rtt?: unknown;
  readonly saveData?: unknown;
}

/** 包含标准及历史前缀连接属性的 Navigator。 */
interface NavigatorWithConnection extends Navigator {
  readonly connection?: BrowserNetworkInformation;
  readonly mozConnection?: BrowserNetworkInformation;
  readonly webkitConnection?: BrowserNetworkInformation;
}

/**
 * 判断当前是否处于浏览器环境且支持 Network Information API。
 *
 * 该 API 并非所有浏览器都支持，业务逻辑应允许返回 false。
 */
export function isNetworkInformationSupported(): boolean {
  if (!isBrowserRuntime()) {
    return false;
  }

  return getNetworkConnection(window.navigator) !== undefined;
}

/**
 * 返回浏览器当前报告的在线状态。
 *
 * `navigator.onLine` 只表示浏览器推断设备具有网络连接，不能保证互联网或
 * 某个具体服务可访问。非浏览器环境会抛出明确的运行时错误。
 */
export function isOnline(): boolean {
  return getBrowserWindow().navigator.onLine;
}

/**
 * 读取当前网络连接信息。
 *
 * 浏览器不支持 Network Information API 时返回 undefined。所有数值均为
 * 浏览器估算值，适合用于体验降级，不适合用于计费或精确测速。
 */
export function getNetworkConnectionInfo(): NetworkConnectionInfo | undefined {
  const connection = getNetworkConnection(getBrowserWindow().navigator);
  return connection ? createConnectionInfo(connection) : undefined;
}

/**
 * 获取当前完整网络状态快照。
 *
 * connection 仅在浏览器支持 Network Information API 时存在。
 */
export function getNetworkStatus(): NetworkStatus {
  const browserWindow = getBrowserWindow();
  const connection = getNetworkConnection(browserWindow.navigator);

  return {
    online: browserWindow.navigator.onLine,
    ...(connection ? { connection: createConnectionInfo(connection) } : {}),
  };
}

/**
 * 监听浏览器在线状态及连接质量变化。
 *
 * 返回的函数可手动取消监听；传入 signal 时也可通过 abort() 取消。多个底层
 * 事件被统一转换为 NetworkStatus，调用方无需分别管理 online、offline 和
 * connection.change 监听器。
 */
export function observeNetworkStatus(
  listener: NetworkStatusListener,
  options: ObserveNetworkStatusOptions = {},
): () => void {
  const { emitInitial = true, signal } = options;

  if (signal?.aborted) {
    return () => undefined;
  }

  const browserWindow = getBrowserWindow();
  const connection = getNetworkConnection(browserWindow.navigator);
  let active = true;

  const handleChange = (event: Event): void => {
    listener(getNetworkStatus(), event);
  };

  const unsubscribe = (): void => {
    if (!active) {
      return;
    }

    active = false;
    browserWindow.removeEventListener("online", handleChange);
    browserWindow.removeEventListener("offline", handleChange);
    connection?.removeEventListener("change", handleChange);
    signal?.removeEventListener("abort", unsubscribe);
  };

  browserWindow.addEventListener("online", handleChange);
  browserWindow.addEventListener("offline", handleChange);
  connection?.addEventListener("change", handleChange);
  signal?.addEventListener("abort", unsubscribe, { once: true });

  if (emitInitial) {
    try {
      listener(getNetworkStatus(), undefined);
    } catch (error) {
      // 初次回调失败时立即清理，避免调用方无法取得 unsubscribe 而造成监听泄漏。
      unsubscribe();
      throw error;
    }
  }

  return unsubscribe;
}

/** 判断当前浏览器是否支持 Beacon API。 */
export function isSendBeaconSupported(): boolean {
  return isBrowserRuntime() && typeof window.navigator.sendBeacon === "function";
}

/**
 * 通过 Beacon API 异步发送少量数据。
 *
 * 适合页面卸载时上报日志或统计信息。返回 true 仅表示浏览器成功将数据加入
 * 发送队列，不代表服务器已经接收。浏览器不支持该 API 时会抛出明确错误。
 */
export function sendBeacon(url: string | URL, data?: BodyInit | null): boolean {
  const navigatorValue = getBrowserWindow().navigator;

  if (typeof navigatorValue.sendBeacon !== "function") {
    throw new Error("Beacon API is not supported in the current browser.");
  }

  return navigatorValue.sendBeacon(url, data);
}

/** 获取标准或带历史前缀的 Network Information API 对象。 */
function getNetworkConnection(navigatorValue: Navigator): BrowserNetworkInformation | undefined {
  const navigatorWithConnection = navigatorValue as NavigatorWithConnection;

  return (
    navigatorWithConnection.connection ??
    navigatorWithConnection.mozConnection ??
    navigatorWithConnection.webkitConnection
  );
}

/** 将浏览器连接对象转换为不暴露可变 EventTarget 的只读快照。 */
function createConnectionInfo(connection: BrowserNetworkInformation): NetworkConnectionInfo {
  return {
    ...(typeof connection.type === "string" ? { type: connection.type } : {}),
    ...(typeof connection.effectiveType === "string"
      ? { effectiveType: connection.effectiveType }
      : {}),
    ...(isNonNegativeFiniteNumber(connection.downlink) ? { downlink: connection.downlink } : {}),
    ...(isNonNegativeFiniteNumber(connection.rtt) ? { rtt: connection.rtt } : {}),
    ...(typeof connection.saveData === "boolean" ? { saveData: connection.saveData } : {}),
  };
}

/** 判断未知值是否为非负有限数。 */
function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

import { listenEvent } from "./event";
import type { EventCleanup } from "./event";
import { getBrowserWindow, isBrowserRuntime } from "./runtime";

/** 浏览器公开的设备能力快照。 */
export interface DeviceInfo {
  /** 浏览器首选语言。 */
  readonly language: string;
  /** 浏览器按优先级排列的语言列表。 */
  readonly languages: readonly string[];
  /** 浏览器报告的平台标识；该字段可能被隐私策略模糊处理。 */
  readonly platform: string;
  /** User-Agent 原始字符串；不建议依赖它判断具体机型。 */
  readonly userAgent: string;
  /** 浏览器允许页面使用的逻辑处理器数量。 */
  readonly hardwareConcurrency?: number;
  /** 浏览器估算的设备内存，单位为 GiB。 */
  readonly deviceMemory?: number;
  /** 设备支持的最大同时触摸点数量。 */
  readonly maxTouchPoints: number;
  /** 当前环境是否暴露触摸输入能力。 */
  readonly touchSupported: boolean;
  /** 浏览器是否允许使用 Cookie。 */
  readonly cookieEnabled: boolean;
}

/** 屏幕方向快照。 */
export interface DeviceScreenOrientation {
  /** 屏幕方向类型，例如 `portrait-primary`。 */
  readonly type: string;
  /** 相对于自然方向顺时针旋转的角度。 */
  readonly angle: number;
}

/** 屏幕及可用显示区域快照。 */
export interface DeviceScreenInfo {
  /** 屏幕宽度，单位为 CSS 像素。 */
  readonly width: number;
  /** 屏幕高度，单位为 CSS 像素。 */
  readonly height: number;
  /** 排除系统界面后可用区域的宽度。 */
  readonly availableWidth: number;
  /** 排除系统界面后可用区域的高度。 */
  readonly availableHeight: number;
  /** 每个颜色分量使用的位数。 */
  readonly colorDepth: number;
  /** 每个像素使用的位数。 */
  readonly pixelDepth: number;
  /** 物理像素与 CSS 像素的比例。 */
  readonly pixelRatio: number;
  /** 浏览器支持 Screen Orientation API 时提供的方向信息。 */
  readonly orientation?: DeviceScreenOrientation;
}

/** 屏幕方向监听配置。 */
export interface ObserveScreenOrientationOptions {
  /**
   * 订阅后是否立即触发一次监听器。
   *
   * @default true
   */
  readonly emitInitial?: boolean;
  /** 用于主动终止监听的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 屏幕方向变化监听器。 */
export type ScreenOrientationListener = (
  screen: DeviceScreenInfo,
  event: Event | undefined,
) => void;

/** 带主动取消能力的定位请求配置。 */
export interface GeolocationRequestOptions extends PositionOptions {
  /** 用于主动取消定位请求的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 带主动取消能力的持续定位配置。 */
export interface GeolocationWatchOptions extends PositionOptions {
  /** 用于主动停止持续定位的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 包含实验性 deviceMemory 属性的 Navigator。 */
interface NavigatorWithDeviceMemory extends Navigator {
  readonly deviceMemory?: unknown;
}

/**
 * 读取浏览器公开的设备能力。
 *
 * 返回的是能力快照而不是可靠的硬件身份。浏览器可能出于隐私保护降低精度，
 * 因此不应将这些字段用于设备指纹、鉴权或计费判断。
 */
export function getDeviceInfo(): DeviceInfo {
  const browserWindow = getBrowserWindow();
  const navigatorValue = browserWindow.navigator as NavigatorWithDeviceMemory;
  const hardwareConcurrency = toPositiveFiniteNumber(navigatorValue.hardwareConcurrency);
  const deviceMemory = toPositiveFiniteNumber(navigatorValue.deviceMemory);

  return {
    language: navigatorValue.language,
    languages: [...navigatorValue.languages],
    platform: navigatorValue.platform,
    userAgent: navigatorValue.userAgent,
    ...(hardwareConcurrency === undefined ? {} : { hardwareConcurrency }),
    ...(deviceMemory === undefined ? {} : { deviceMemory }),
    maxTouchPoints: navigatorValue.maxTouchPoints,
    touchSupported: navigatorValue.maxTouchPoints > 0 || "ontouchstart" in browserWindow,
    cookieEnabled: navigatorValue.cookieEnabled,
  };
}

/** 判断当前浏览器是否暴露触摸输入能力。 */
export function isTouchSupported(): boolean {
  const browserWindow = getBrowserWindow();
  return browserWindow.navigator.maxTouchPoints > 0 || "ontouchstart" in browserWindow;
}

/**
 * 读取当前屏幕及方向信息。
 *
 * 尺寸使用 CSS 像素，不等同于设备物理分辨率；缩放和隐私策略可能影响结果。
 */
export function getDeviceScreenInfo(): DeviceScreenInfo {
  const browserWindow = getBrowserWindow();
  const { screen } = browserWindow;
  const orientation = getScreenOrientation(screen);

  return {
    width: screen.width,
    height: screen.height,
    availableWidth: screen.availWidth,
    availableHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    pixelRatio: browserWindow.devicePixelRatio,
    ...(orientation ? { orientation } : {}),
  };
}

/**
 * 监听屏幕方向变化，并返回幂等的清理函数。
 *
 * 优先使用 Screen Orientation API；旧浏览器降级为 window.orientationchange。
 * 初次回调抛出异常时会立即清理监听器，避免调用方无法取得清理函数。
 */
export function observeScreenOrientation(
  listener: ScreenOrientationListener,
  options: ObserveScreenOrientationOptions = {},
): EventCleanup {
  const { emitInitial = true, signal } = options;
  const browserWindow = getBrowserWindow();

  if (signal?.aborted) {
    return () => undefined;
  }

  const orientation = browserWindow.screen.orientation;
  const handleChange = (event: Event): void => {
    listener(getDeviceScreenInfo(), event);
  };
  const listenerOptions = signal ? { signal } : undefined;
  const cleanup = orientation
    ? listenEvent(orientation, "change", handleChange, listenerOptions)
    : listenEvent(browserWindow, "orientationchange", handleChange, listenerOptions);

  if (emitInitial) {
    try {
      listener(getDeviceScreenInfo(), undefined);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return cleanup;
}

/** 判断当前环境是否支持 Permissions API。 */
export function isPermissionsSupported(): boolean {
  return isBrowserRuntime() && typeof window.navigator.permissions?.query === "function";
}

/**
 * 查询指定浏览器权限的当前状态。
 *
 * Permissions API 不可用时返回 undefined。未知权限名、权限策略限制等错误会
 * 原样抛出，调用方可据此区分“不支持”和“查询失败”。该函数只查询，不触发授权弹窗。
 */
export async function queryPermission(name: PermissionName): Promise<PermissionState | undefined> {
  const permissions = getBrowserWindow().navigator.permissions;

  if (typeof permissions?.query !== "function") return undefined;

  // DOM 类型只列出已标准化名称，但浏览器可能先行实现新的权限名称。
  const status = await permissions.query({ name: name });
  return status.state;
}

/** 判断当前环境是否支持 Geolocation API。 */
export function isGeolocationSupported(): boolean {
  return isBrowserRuntime() && window.navigator.geolocation !== undefined;
}

/**
 * 获取一次当前位置，并支持 AbortSignal 主动取消。
 *
 * 原生 Geolocation API 无法真正取消底层定位，本函数会在 abort 后忽略迟到的
 * 成功或失败回调。定位通常要求 HTTPS 且需要用户授权，错误会保持原生类型。
 */
export function getCurrentGeolocation(
  options: GeolocationRequestOptions = {},
): Promise<GeolocationPosition> {
  const { signal } = options;
  const geolocation = getGeolocation();

  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<GeolocationPosition>((resolve, reject) => {
    let active = true;

    const cleanup = (): void => {
      if (!active) {
        return;
      }

      active = false;
      signal?.removeEventListener("abort", handleAbort);
    };

    const handleSuccess = (position: GeolocationPosition): void => {
      if (!active) {
        return;
      }

      cleanup();
      resolve(position);
    };

    const handleError = (error: GeolocationPositionError): void => {
      if (!active) {
        return;
      }

      cleanup();
      reject(error);
    };

    const handleAbort = (): void => {
      cleanup();
      reject(getAbortReason(signal));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    geolocation.getCurrentPosition(handleSuccess, handleError, toNativePositionOptions(options));
  });
}

/**
 * 持续监听位置变化，并返回幂等的停止函数。
 *
 * 支持 AbortSignal 自动停止。定位失败通过 onError 返回，不会自动结束监听，
 * 便于浏览器在信号恢复或权限状态变化后继续提供位置。
 */
export function watchGeolocation(
  listener: PositionCallback,
  onError?: PositionErrorCallback,
  options: GeolocationWatchOptions = {},
): EventCleanup {
  const { signal } = options;
  const geolocation = getGeolocation();

  if (signal?.aborted) {
    return () => undefined;
  }

  let active = true;
  const watchId = geolocation.watchPosition(listener, onError, toNativePositionOptions(options));

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    geolocation.clearWatch(watchId);
    signal?.removeEventListener("abort", cleanup);
  };

  signal?.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}

/** 判断当前环境是否支持 Vibration API。 */
export function isVibrationSupported(): boolean {
  return isBrowserRuntime() && typeof window.navigator.vibrate === "function";
}

/**
 * 请求设备按指定模式振动。
 *
 * 返回 false 表示浏览器不支持、策略禁止或请求未被接受。持续时间必须是非负
 * 有限数；数组会被复制，避免调用后被外部修改。
 */
export function vibrate(pattern: number | readonly number[]): boolean {
  const navigatorValue = getBrowserWindow().navigator;
  const normalizedPattern: number | number[] =
    typeof pattern === "number" ? pattern : Array.from(pattern);
  const durations = typeof normalizedPattern === "number" ? [normalizedPattern] : normalizedPattern;

  if (durations.some((duration) => !Number.isFinite(duration) || duration < 0)) {
    throw new RangeError("vibration durations must be non-negative finite numbers");
  }

  return typeof navigatorValue.vibrate === "function" && navigatorValue.vibrate(normalizedPattern);
}

/** 停止当前设备振动；不支持 Vibration API 时返回 false。 */
export function stopVibration(): boolean {
  const navigatorValue = getBrowserWindow().navigator;
  return typeof navigatorValue.vibrate === "function" && navigatorValue.vibrate(0);
}

/** 从 Screen Orientation API 创建稳定的只读快照。 */
function getScreenOrientation(screen: Screen): DeviceScreenOrientation | undefined {
  const { orientation } = screen;

  if (!orientation) {
    return undefined;
  }

  return {
    type: orientation.type,
    angle: orientation.angle,
  };
}

/** 获取 Geolocation API，缺失时抛出明确错误。 */
function getGeolocation(): Geolocation {
  const geolocation = getBrowserWindow().navigator.geolocation;

  if (!geolocation) {
    throw new DOMException(
      "Geolocation API is not supported in the current browser.",
      "NotSupportedError",
    );
  }

  return geolocation;
}

/** 去除扩展的 signal 字段，仅向原生定位 API 传递标准配置。 */
function toNativePositionOptions(
  options: GeolocationRequestOptions | GeolocationWatchOptions,
): PositionOptions {
  const { enableHighAccuracy, maximumAge, timeout } = options;

  return {
    ...(enableHighAccuracy === undefined ? {} : { enableHighAccuracy }),
    ...(maximumAge === undefined ? {} : { maximumAge }),
    ...(timeout === undefined ? {} : { timeout }),
  };
}

/** 将未知值规范为正有限数。 */
function toPositiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** 获取 AbortSignal 的中止原因，并兼容未提供 reason 的浏览器。 */
function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException("The device operation was aborted.", "AbortError");
}

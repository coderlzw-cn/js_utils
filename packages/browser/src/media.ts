import { listenEvent } from "./event";
import type { EventCleanup } from "./event";
import { getBrowserWindow, isBrowserRuntime } from "./runtime";

/** 媒体设备的稳定快照，避免向业务层暴露可变化的原生对象。 */
export interface MediaDeviceSnapshot {
  /** 设备标识；用户授权前可能为空字符串或经过浏览器模糊处理。 */
  readonly deviceId: string;
  /** 设备分组标识；同一物理设备的输入输出可能共享该值。 */
  readonly groupId: string;
  /** 设备类型。 */
  readonly kind: MediaDeviceKind;
  /** 人类可读名称；通常需要用户授权后才可获得。 */
  readonly label: string;
}

/** MediaStreamTrack 的当前状态快照。 */
export interface MediaTrackSnapshot {
  /** 轨道唯一标识。 */
  readonly id: string;
  /** 轨道类型。 */
  readonly kind: string;
  /** 轨道名称。 */
  readonly label: string;
  /** 轨道是否允许输出数据。 */
  readonly enabled: boolean;
  /** 轨道是否暂时无法提供媒体数据。 */
  readonly muted: boolean;
  /** 轨道当前生命周期状态。 */
  readonly readyState: MediaStreamTrackState;
  /** 浏览器实际应用的轨道设置。 */
  readonly settings: Readonly<MediaTrackSettings>;
}

/** MediaStream 的当前状态快照。 */
export interface MediaStreamSnapshot {
  /** 媒体流唯一标识。 */
  readonly id: string;
  /** 媒体流是否至少包含一条仍处于 live 状态的轨道。 */
  readonly active: boolean;
  /** 媒体流包含的全部轨道快照。 */
  readonly tracks: readonly MediaTrackSnapshot[];
}

/** 用户媒体采集配置。 */
export interface UserMediaCaptureOptions {
  /** 传给 getUserMedia 的音视频约束。 */
  readonly constraints: MediaStreamConstraints;
  /** 用于主动取消等待的 AbortSignal。 */
  readonly signal?: AbortSignal;
  /** 最大等待时间，单位为毫秒；超时后迟到的媒体流会被立即停止。 */
  readonly timeout?: number;
}

/** 屏幕媒体采集配置。 */
export interface DisplayMediaCaptureOptions {
  /** 传给 getDisplayMedia 的屏幕与音频约束。 */
  readonly constraints?: DisplayMediaStreamOptions;
  /** 用于主动取消等待的 AbortSignal。 */
  readonly signal?: AbortSignal;
  /** 最大等待时间，单位为毫秒；超时后迟到的媒体流会被立即停止。 */
  readonly timeout?: number;
}

/** 媒体设备变化监听配置。 */
export interface ObserveMediaDevicesOptions {
  /** 用于主动终止监听的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 媒体元素绑定配置。 */
export interface AttachMediaStreamOptions {
  /**
   * 绑定后是否调用 play()。
   *
   * @default true
   */
  readonly autoplay?: boolean;
  /**
   * 是否将媒体元素静音；本地预览视频通常应设为 true，避免音频回授。
   *
   * @default false
   */
  readonly muted?: boolean;
  /**
   * 视频是否尽量以内联方式播放。
   *
   * @default true
   */
  readonly playsInline?: boolean;
  /** 解除绑定时是否停止流中的全部轨道。 */
  readonly stopTracksOnDetach?: boolean;
  /** 用于主动解除绑定的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 创建 MediaRecorder 的扩展配置。 */
export interface CreateMediaRecorderOptions extends MediaRecorderOptions {
  /**
   * 按优先级排列的候选 MIME 类型；未显式设置 mimeType 时选择首个受支持值。
   */
  readonly preferredMimeTypes?: readonly string[];
}

/** 包含可能尚未进入稳定 DOM 类型的 getDisplayMedia 方法。 */
interface MediaDevicesWithDisplayMedia {
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
}

/** 判断当前环境是否支持 MediaDevices 和 getUserMedia。 */
export function isUserMediaSupported(): boolean {
  return isBrowserRuntime() && typeof window.navigator.mediaDevices?.getUserMedia === "function";
}

/** 判断当前环境是否支持屏幕采集。 */
export function isDisplayMediaSupported(): boolean {
  if (!isBrowserRuntime()) {
    return false;
  }

  return typeof (window.navigator.mediaDevices as MediaDevicesWithDisplayMedia | undefined)?.getDisplayMedia === "function";
}

/** 判断当前环境是否支持 MediaRecorder。 */
export function isMediaRecorderSupported(): boolean {
  return isBrowserRuntime() && typeof window.MediaRecorder === "function";
}

/**
 * 枚举浏览器当前可见的媒体设备。
 *
 * 浏览器通常会在用户授权前隐藏设备名称和稳定标识。返回值是只读快照，设备
 * 插拔不会修改已返回的数据；需要更新时应重新调用本函数。
 */
export async function enumerateMediaDevices(): Promise<MediaDeviceSnapshot[]> {
  const mediaDevices = getMediaDevices();

  if (typeof mediaDevices.enumerateDevices !== "function") {
    throw new DOMException("Media device enumeration is not supported in the current browser.", "NotSupportedError");
  }

  const devices = await mediaDevices.enumerateDevices();

  return devices.map((device) => ({
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind,
    label: device.label,
  }));
}

/**
 * 监听媒体设备插拔或可见性变化，并返回幂等的清理函数。
 *
 * devicechange 只表示设备集合可能改变，监听器中应重新调用 enumerateMediaDevices。
 */
export function observeMediaDevices(listener: (event: Event) => void, options: ObserveMediaDevicesOptions = {}): EventCleanup {
  const mediaDevices = getMediaDevices();
  const listenerOptions = options.signal ? { signal: options.signal } : undefined;
  return listenEvent(mediaDevices, "devicechange", listener, listenerOptions);
}

/**
 * 请求摄像头和/或麦克风媒体流。
 *
 * 支持主动取消与超时。原生 getUserMedia 无法取消浏览器权限弹窗，因此请求结束
 * 后若已取消或超时，本函数会立即停止迟到媒体流中的全部轨道，防止设备继续占用。
 */
export function requestUserMedia(options: UserMediaCaptureOptions): Promise<MediaStream> {
  const mediaDevices = getMediaDevices();

  return requestMediaStream(
    () => mediaDevices.getUserMedia(options.constraints),
    options.signal,
    options.timeout,

    "getUserMedia",
  );
}

/**
 * 请求屏幕、窗口或标签页媒体流。
 *
 * 屏幕采集通常必须由用户手势触发，且浏览器每次都会要求用户选择共享目标。
 * 主动取消或超时后，迟到的媒体流会被立即停止。
 */
export function requestDisplayMedia(options: DisplayMediaCaptureOptions = {}): Promise<MediaStream> {
  const mediaDevices = getMediaDevices() as MediaDevicesWithDisplayMedia;

  if (typeof mediaDevices.getDisplayMedia !== "function") {
    return Promise.reject(new DOMException("Display media capture is not supported in the current browser.", "NotSupportedError"));
  }

  return requestMediaStream(
    () => mediaDevices.getDisplayMedia?.(options.constraints) ?? Promise.reject(new Error("Display media capture became unavailable.")),
    options.signal,
    options.timeout,
    "getDisplayMedia",
  );
}

/** 获取媒体流的只读状态快照。 */
export function getMediaStreamSnapshot(stream: MediaStream): MediaStreamSnapshot {
  return {
    id: stream.id,
    active: stream.getTracks().some((track) => track.readyState === "live"),
    tracks: stream.getTracks().map((track) => ({
      id: track.id,
      kind: track.kind,
      label: track.label,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      settings: { ...track.getSettings() },
    })),
  };
}

/**
 * 启用或禁用媒体流中的指定类型轨道。
 *
 * kind 为 all 时处理全部轨道。返回实际修改的轨道数量；已结束的轨道不会修改。
 */
export function setMediaTracksEnabled(stream: MediaStream, enabled: boolean, kind: "audio" | "video" | "all" = "all"): number {
  let changed = 0;

  for (const track of stream.getTracks()) {
    if (track.readyState === "live" && (kind === "all" || track.kind === kind) && track.enabled !== enabled) {
      track.enabled = enabled;
      changed += 1;
    }
  }

  return changed;
}

/**
 * 停止媒体流中的全部轨道并释放摄像头、麦克风或屏幕采集资源。
 *
 * 重复调用是安全的；返回本次真正停止的 live 轨道数量。
 */
export function stopMediaStream(stream: MediaStream): number {
  let stopped = 0;

  for (const track of stream.getTracks()) {
    if (track.readyState === "live") {
      track.stop();
      stopped += 1;
    }
  }

  return stopped;
}

/**
 * 将 MediaStream 安全绑定到 audio 或 video 元素。
 *
 * 返回 Promise 是因为自动播放可能被浏览器策略拒绝。失败时会恢复元素原状态；
 * 成功后返回幂等清理函数，只有 srcObject 仍是当前流时才恢复，避免覆盖后续绑定。
 */
export async function attachMediaStream(element: HTMLMediaElement, stream: MediaStream, options: AttachMediaStreamOptions = {}): Promise<EventCleanup> {
  const { autoplay = true, muted = false, playsInline = true, signal, stopTracksOnDetach = false } = options;

  if (signal?.aborted) {
    throw getAbortReason(signal);
  }

  const previousSource = element.srcObject;
  const previousAutoplay = element.autoplay;
  const previousMuted = element.muted;
  const previousPlaysInline = element instanceof HTMLVideoElement ? element.playsInline : undefined;
  let active = true;

  element.srcObject = stream;
  element.autoplay = autoplay;
  element.muted = muted;

  if (element instanceof HTMLVideoElement) {
    element.playsInline = playsInline;
  }

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    signal?.removeEventListener("abort", cleanup);

    if (element.srcObject === stream) {
      element.pause();
      element.srcObject = previousSource;
      element.autoplay = previousAutoplay;
      element.muted = previousMuted;

      if (element instanceof HTMLVideoElement && previousPlaysInline !== undefined) {
        element.playsInline = previousPlaysInline;
      }
    }

    if (stopTracksOnDetach) {
      stopMediaStream(stream);
    }
  };

  signal?.addEventListener("abort", cleanup, { once: true });

  if (autoplay) {
    try {
      await element.play();

      if (signal?.aborted) {
        cleanup();
        throw getAbortReason(signal);
      }
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return cleanup;
}

/**
 * 解除媒体元素当前绑定的 MediaStream。
 *
 * 默认只解除引用；传入 stopTracks 可同时释放媒体设备。返回之前绑定的流，未绑定
 * MediaStream 时返回 undefined。
 */
export function detachMediaStream(element: HTMLMediaElement, stopTracks = false): MediaStream | undefined {
  const source = element.srcObject;
  const stream = isMediaStream(source) ? source : undefined;

  element.pause();
  element.srcObject = null;

  if (stream && stopTracks) {
    stopMediaStream(stream);
  }

  return stream;
}

/**
 * 从候选列表中选择浏览器支持的首个 MediaRecorder MIME 类型。
 *
 * MediaRecorder 不可用或没有候选类型受支持时返回 undefined。
 */
export function getSupportedRecorderMimeType(candidates: readonly string[]): string | undefined {
  if (!isMediaRecorderSupported()) {
    return undefined;
  }

  return candidates.find((mimeType) => window.MediaRecorder.isTypeSupported(mimeType));
}

/**
 * 创建配置经过兼容性选择的 MediaRecorder。
 *
 * 显式 mimeType 不受支持时抛出 NotSupportedError；未显式指定时，会从
 * preferredMimeTypes 中选择首个受支持类型。事件监听、分片上传与持久化策略
 * 应由业务层决定，基础工具不隐式缓存录制数据。
 */
export function createMediaRecorder(stream: MediaStream, options: CreateMediaRecorderOptions = {}): MediaRecorder {
  getBrowserWindow();

  if (typeof MediaRecorder !== "function") {
    throw new DOMException("MediaRecorder is not supported in the current browser.", "NotSupportedError");
  }

  const { preferredMimeTypes = [], ...recorderOptions } = options;
  const selectedMimeType = recorderOptions.mimeType || getSupportedRecorderMimeType(preferredMimeTypes);

  if (recorderOptions.mimeType && !MediaRecorder.isTypeSupported(recorderOptions.mimeType)) {
    throw new DOMException(`MediaRecorder MIME type is not supported: ${recorderOptions.mimeType}`, "NotSupportedError");
  }

  return new MediaRecorder(stream, {
    ...recorderOptions,
    ...(selectedMimeType ? { mimeType: selectedMimeType } : {}),
  });
}

/** 获取 MediaDevices API，缺失时抛出明确错误。 */
function getMediaDevices(): MediaDevices {
  const mediaDevices = getBrowserWindow().navigator.mediaDevices;

  if (!mediaDevices) {
    throw new DOMException("MediaDevices API is not supported in the current browser.", "NotSupportedError");
  }

  return mediaDevices;
}

/**
 * 为无法原生取消的媒体请求增加 AbortSignal、超时和迟到流回收。
 *
 * settled 为 true 后，原生 Promise 若仍返回流，必须立即停止所有轨道，否则摄像头
 * 或麦克风可能在业务已经取消后继续工作。
 */
function requestMediaStream(request: () => Promise<MediaStream>, signal: AbortSignal | undefined, timeout: number | undefined, operation: string): Promise<MediaStream> {
  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
    return Promise.reject(new RangeError("timeout must be a non-negative finite number"));
  }

  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<MediaStream>((resolve, reject) => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      signal?.removeEventListener("abort", handleAbort);

      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    const rejectOnce = (error: unknown): void => {
      if (!active) {
        return;
      }

      active = false;
      cleanup();
      reject(error);
    };

    const handleAbort = (): void => {
      rejectOnce(getAbortReason(signal));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        rejectOnce(new DOMException(`${operation} timed out after ${timeout} ms.`, "TimeoutError"));
      }, timeout);
    }

    let mediaPromise: Promise<MediaStream>;

    try {
      mediaPromise = request();
    } catch (error) {
      rejectOnce(error);
      return;
    }

    mediaPromise.then(
      (stream) => {
        if (!active) {
          stopMediaStream(stream);
          return;
        }

        active = false;
        cleanup();
        resolve(stream);
      },
      (error: unknown) => {
        rejectOnce(error);
      },
    );
  });
}

/** 通过结构检查识别 MediaStream，兼容 iframe 等不同 JavaScript Realm。 */
function isMediaStream(value: MediaProvider | null): value is MediaStream {
  return value !== null && "getTracks" in value && typeof value.getTracks === "function";
}

/** 获取 AbortSignal 的中止原因，并兼容未提供 reason 的浏览器。 */
function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException("The media operation was aborted.", "AbortError");
}

import type { EventCleanup } from "./event";
import { getBrowserWindow } from "./runtime";

/** 浏览器文件选择配置。 */
export interface PickFilesOptions {
  /** input accept 属性，例如 `["image/*", ".pdf"]`。 */
  readonly accept?: readonly string[];
  /**
   * 是否允许选择多个文件。
   *
   * @default false
   */
  readonly multiple?: boolean;
  /** 是否允许选择目录；依赖非标准但广泛实现的 webkitdirectory。 */
  readonly directory?: boolean;
  /** 移动设备上建议使用的采集来源。 */
  readonly capture?: "user" | "environment";
  /** 用于主动取消文件选择等待的 AbortSignal。 */
  readonly signal?: AbortSignal;
}

/** 文件读取进度。 */
export interface FileReadProgress {
  /** 当前已读取字节数。 */
  readonly loaded: number;
  /** 可计算总量时的文件总字节数。 */
  readonly total?: number;
  /** 0 到 1 之间的完成比例；无法计算总量时不存在。 */
  readonly ratio?: number;
}

/** 文件读取配置。 */
export interface FileReadOptions {
  /** 用于主动取消 FileReader 的 AbortSignal。 */
  readonly signal?: AbortSignal;
  /** 文件读取进度监听器。 */
  readonly onProgress?: (progress: FileReadProgress) => void;
}

/** 文本文件读取配置。 */
export interface TextFileReadOptions extends FileReadOptions {
  /** 文本编码名称；默认由浏览器按 UTF-8 处理。 */
  readonly encoding?: string;
}

/** 单文件校验规则。 */
export interface FileValidationRules {
  /** 最小文件大小，单位为字节。 */
  readonly minSize?: number;
  /** 最大文件大小，单位为字节。 */
  readonly maxSize?: number;
  /** 允许的 MIME、MIME 通配符或扩展名，例如 `image/*`、`.pdf`。 */
  readonly accept?: readonly string[];
  /**
   * 是否允许空文件。
   *
   * @default true
   */
  readonly allowEmpty?: boolean;
}

/** 文件校验错误代码。 */
export type FileValidationErrorCode = "empty" | "too-small" | "too-large" | "type-not-accepted";

/** 单项文件校验错误。 */
export interface FileValidationError {
  /** 机器可读错误代码。 */
  readonly code: FileValidationErrorCode;
  /** 人类可读错误信息。 */
  readonly message: string;
  /** 实际值，例如文件字节数或 MIME 类型。 */
  readonly actual?: string | number;
  /** 规则期望值。 */
  readonly expected?: string | number;
}

/** 文件校验结果。 */
export type FileValidationResult = { readonly valid: true; readonly errors: readonly [] } | { readonly valid: false; readonly errors: readonly FileValidationError[] };

/** 对象 URL 句柄。 */
export interface ObjectUrlHandle {
  /** 可赋给 img、video、a 等元素的对象 URL。 */
  readonly url: string;
  /** 幂等的 URL 回收函数。 */
  readonly revoke: EventCleanup;
}

/** 文件下载配置。 */
export interface DownloadFileOptions {
  /**
   * 点击下载后延迟回收对象 URL 的时间，单位为毫秒。
   *
   * @default 1000
   */
  readonly revokeDelay?: number;
  /** 下载触发前已取消时阻止下载；触发后取消会提前回收对象 URL。 */
  readonly signal?: AbortSignal;
}

/** Blob 转 File 配置。 */
export interface BlobToFileOptions {
  /** 覆盖 Blob 原有 MIME 类型。 */
  readonly type?: string;
  /** 最后修改时间，Unix 毫秒时间戳。 */
  readonly lastModified?: number;
}

/** Blob 哈希配置。 */
export interface HashBlobOptions extends FileReadOptions {
  /** Web Crypto 摘要算法。 */
  readonly algorithm?: AlgorithmIdentifier;
  /** 可选内存保护上限；Blob 超过该字节数时拒绝读取。 */
  readonly maxBytes?: number;
}

/** 带非标准目录和采集属性的文件输入框。 */
interface ExtendedFileInputElement extends HTMLInputElement {
  webkitdirectory: boolean;
  capture: string;
}

/**
 * 打开浏览器文件选择器。
 *
 * 必须在用户手势调用栈中调用，否则浏览器可能阻止弹窗。用户取消时返回空数组；
 * signal 中止时 Promise 拒绝。目录选择依赖 webkitdirectory，文件的相对路径保留
 * 在原生 File.webkitRelativePath 中。
 */
export function pickFiles(options: PickFilesOptions = {}): Promise<File[]> {
  const { accept = [], capture, directory = false, multiple = false, signal } = options;
  const browserWindow = getBrowserWindow();

  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<File[]>((resolve, reject) => {
    const input = browserWindow.document.createElement("input") as ExtendedFileInputElement;
    let active = true;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;

    input.type = "file";
    input.multiple = multiple || directory;
    input.accept = accept.join(",");
    input.webkitdirectory = directory;

    if (capture) {
      input.capture = capture;
    }

    Object.assign(input.style, {
      position: "fixed",
      left: "-9999px",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
    });

    const cleanup = (): void => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      browserWindow.removeEventListener("focus", handleWindowFocus);
      signal?.removeEventListener("abort", handleAbort);
      input.remove();

      if (focusTimer !== undefined) {
        clearTimeout(focusTimer);
      }
    };

    const finish = (files: File[]): void => {
      if (!active) {
        return;
      }

      active = false;
      cleanup();
      resolve(files);
    };

    const handleChange = (): void => {
      finish(input.files ? Array.from(input.files) : []);
    };

    const handleCancel = (): void => {
      finish([]);
    };

    const handleWindowFocus = (): void => {
      // 旧浏览器没有 input cancel 事件；对话框关闭后 window 会重新获得焦点。
      focusTimer = setTimeout(() => {
        if (active && (!input.files || input.files.length === 0)) {
          finish([]);
        }
      }, 0);
    };

    const handleAbort = (): void => {
      if (!active) {
        return;
      }

      active = false;
      cleanup();
      reject(getAbortReason(signal));
    };

    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);
    browserWindow.addEventListener("focus", handleWindowFocus);
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      (browserWindow.document.body ?? browserWindow.document.documentElement).appendChild(input);
      input.click();
    } catch (error) {
      active = false;
      cleanup();
      reject(error);
    }
  });
}

/**
 * 判断文件是否匹配 accept 规则。
 *
 * 支持精确 MIME、`type/*` 通配符和 `.ext` 扩展名，比较时不区分大小写。
 * 空规则表示接受任意文件。该检查只依据浏览器元数据，不应作为安全内容检测。
 */
export function matchesFileAccept(file: File, accept: readonly string[]): boolean {
  if (accept.length === 0) {
    return true;
  }

  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  return accept.some((rawRule) => {
    const rule = rawRule.trim().toLowerCase();

    if (!rule) {
      return false;
    }

    if (rule.startsWith(".")) {
      return fileName.endsWith(rule);
    }

    if (rule === "*/*") {
      return true;
    }

    if (rule.endsWith("/*")) {
      return mimeType.startsWith(rule.slice(0, -1));
    }

    return mimeType === rule;
  });
}

/**
 * 按大小和 accept 规则校验单个文件。
 *
 * 会一次返回全部错误，便于表单同时展示，不在首个失败项处提前结束。
 */
export function validateFile(file: File, rules: FileValidationRules = {}): FileValidationResult {
  const { accept = [], allowEmpty = true, maxSize, minSize } = rules;
  validateSizeBoundary(minSize, "minSize");
  validateSizeBoundary(maxSize, "maxSize");

  if (minSize !== undefined && maxSize !== undefined && minSize > maxSize) {
    throw new RangeError("minSize must be less than or equal to maxSize");
  }

  const errors: FileValidationError[] = [];

  if (!allowEmpty && file.size === 0) {
    errors.push({ code: "empty", message: "文件不能为空。", actual: 0 });
  }

  if (minSize !== undefined && file.size < minSize) {
    errors.push({
      code: "too-small",
      message: `文件不能小于 ${minSize} 字节。`,
      actual: file.size,
      expected: minSize,
    });
  }

  if (maxSize !== undefined && file.size > maxSize) {
    errors.push({
      code: "too-large",
      message: `文件不能大于 ${maxSize} 字节。`,
      actual: file.size,
      expected: maxSize,
    });
  }

  if (!matchesFileAccept(file, accept)) {
    errors.push({
      code: "type-not-accepted",
      message: `文件类型不符合要求：${accept.join(", ")}。`,
      actual: file.type || getFileExtension(file.name) || "unknown",
      expected: accept.join(","),
    });
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

/** 使用 FileReader 将 Blob 读取为文本，并支持进度和主动取消。 */
export function readBlobAsText(blob: Blob, options: TextFileReadOptions = {}): Promise<string> {
  return readBlob(blob, "text", options, options.encoding);
}

/** 使用 FileReader 将 Blob 读取为 ArrayBuffer，并支持进度和主动取消。 */
export function readBlobAsArrayBuffer(blob: Blob, options: FileReadOptions = {}): Promise<ArrayBuffer> {
  return readBlob(blob, "array-buffer", options);
}

/**
 * 使用 FileReader 将 Blob 读取为 Data URL。
 *
 * Data URL 会额外进行 Base64 编码，大文件应优先使用对象 URL，避免内存膨胀。
 */
export function readBlobAsDataUrl(blob: Blob, options: FileReadOptions = {}): Promise<string> {
  return readBlob(blob, "data-url", options);
}

/** 将 Blob 转换为 File，并对下载/展示文件名做安全规范化。 */
export function blobToFile(blob: Blob, fileName: string, options: BlobToFileOptions = {}): File {
  getBrowserWindow();

  return new File([blob], sanitizeFileName(fileName), {
    type: options.type ?? blob.type,
    lastModified: options.lastModified ?? Date.now(),
  });
}

/**
 * 创建需要显式回收的对象 URL。
 *
 * 调用方使用完毕后必须调用 revoke；该函数返回的 revoke 可安全重复调用。
 */
export function createObjectUrl(blob: Blob): ObjectUrlHandle {
  getBrowserWindow();
  const url = URL.createObjectURL(blob);
  let active = true;

  return {
    url,
    revoke: () => {
      if (!active) {
        return;
      }

      active = false;
      URL.revokeObjectURL(url);
    },
  };
}

/**
 * 通过临时 a 元素触发 Blob 下载，并返回可提前回收资源的清理函数。
 *
 * 对象 URL 默认延迟回收，避免部分浏览器在 click 后立即 revoke 导致下载失败。
 */
export function downloadBlob(blob: Blob, fileName: string, options: DownloadFileOptions = {}): EventCleanup {
  const { revokeDelay = 1000, signal } = options;
  validateNonNegativeFiniteNumber(revokeDelay, "revokeDelay");

  if (signal?.aborted) {
    throw getAbortReason(signal);
  }

  const browserWindow = getBrowserWindow();
  const objectUrl = createObjectUrl(blob);
  const anchor = browserWindow.document.createElement("a");
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = (): void => {
    if (!active) {
      return;
    }

    active = false;
    signal?.removeEventListener("abort", cleanup);
    anchor.remove();
    objectUrl.revoke();

    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };

  anchor.href = objectUrl.url;
  anchor.download = sanitizeFileName(fileName);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  signal?.addEventListener("abort", cleanup, { once: true });

  try {
    (browserWindow.document.body ?? browserWindow.document.documentElement).appendChild(anchor);
    anchor.click();
    timer = setTimeout(cleanup, revokeDelay);
  } catch (error) {
    cleanup();
    throw error;
  }

  return cleanup;
}

/** 下载纯文本文件。 */
export function downloadText(text: string, fileName: string, options: DownloadFileOptions = {}): EventCleanup {
  return downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), fileName, options);
}

/**
 * 将值序列化为 JSON 并下载。
 *
 * JSON.stringify 无法处理循环引用和 BigInt，此类错误会原样抛出。
 */
export function downloadJson(value: unknown, fileName: string, options: DownloadFileOptions & { readonly space?: number | string } = {}): EventCleanup {
  const { space, ...downloadOptions } = options;
  const json = JSON.stringify(value, undefined, space);

  if (json === undefined) {
    throw new TypeError("value cannot be represented as JSON");
  }

  return downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), fileName, downloadOptions);
}

/**
 * 按固定大小惰性切分 Blob。
 *
 * 使用生成器避免一次创建大量分片；适合分片上传，但不会复制底层二进制数据。
 */
export function* iterateBlobChunks(blob: Blob, chunkSize: number): Generator<Blob, void, undefined> {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive safe integer");
  }

  for (let start = 0; start < blob.size; start += chunkSize) {
    yield blob.slice(start, Math.min(start + chunkSize, blob.size), blob.type);
  }
}

/**
 * 使用 Web Crypto 计算 Blob 摘要并返回小写十六进制字符串。
 *
 * Web Crypto digest 不支持流式输入，本函数会将整个 Blob 读入内存。处理大文件时
 * 建议设置 maxBytes，或在业务层使用支持增量哈希的专用库。
 */
export async function hashBlob(blob: Blob, options: HashBlobOptions = {}): Promise<string> {
  const { algorithm = "SHA-256", maxBytes, onProgress, signal } = options;

  if (maxBytes !== undefined) {
    validateNonNegativeFiniteNumber(maxBytes, "maxBytes");

    if (blob.size > maxBytes) {
      throw new RangeError(`Blob size ${blob.size} exceeds maxBytes ${maxBytes}`);
    }
  }

  const browserWindow = getBrowserWindow();

  if (!browserWindow.crypto?.subtle) {
    throw new DOMException("Web Crypto digest is not supported in the current browser.", "NotSupportedError");
  }

  const buffer = await readBlobAsArrayBuffer(blob, {
    ...(signal ? { signal } : {}),
    ...(onProgress ? { onProgress } : {}),
  });

  if (signal?.aborted) {
    throw getAbortReason(signal);
  }

  const digest = await browserWindow.crypto.subtle.digest(algorithm, buffer);

  if (signal?.aborted) {
    throw getAbortReason(signal);
  }

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 获取不含路径的安全文件名，并移除控制字符和常见文件系统保留字符。 */
export function sanitizeFileName(fileName: string, fallback = "download"): string {
  return normalizeFileName(fileName) || normalizeFileName(fallback) || "download";
}

/** 执行文件名规范化，不应用 fallback。 */
function normalizeFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? "";
  const normalizedCharacters = Array.from(baseName, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 || '<>:"|?*'.includes(character) ? "_" : character;
  }).join("");
  const sanitized = normalizedCharacters
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[. ]+$/g, "")
    .trim()
    .slice(0, 255);

  return sanitized;
}

/** 获取小写文件扩展名，不包含开头的点；无扩展名时返回 undefined。 */
export function getFileExtension(fileName: string): string | undefined {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? "";
  const dotIndex = baseName.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return undefined;
  }

  return baseName.slice(dotIndex + 1).toLowerCase();
}

/** FileReader 支持的内部读取模式。 */
type FileReadMode = "text" | "array-buffer" | "data-url";

/** 使用 FileReader 统一实现读取、进度、错误和 AbortSignal 清理。 */
function readBlob(blob: Blob, mode: "text", options: TextFileReadOptions, encoding?: string): Promise<string>;
function readBlob(blob: Blob, mode: "array-buffer", options: FileReadOptions): Promise<ArrayBuffer>;
function readBlob(blob: Blob, mode: "data-url", options: FileReadOptions): Promise<string>;
function readBlob(blob: Blob, mode: FileReadMode, options: FileReadOptions, encoding?: string): Promise<string | ArrayBuffer> {
  const { onProgress, signal } = options;
  getBrowserWindow();

  if (signal?.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<string | ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    let active = true;

    const cleanup = (): void => {
      reader.removeEventListener("load", handleLoad);
      reader.removeEventListener("error", handleError);
      reader.removeEventListener("abort", handleReaderAbort);
      reader.removeEventListener("progress", handleProgress);
      signal?.removeEventListener("abort", handleSignalAbort);
    };

    const rejectOnce = (error: unknown): void => {
      if (!active) {
        return;
      }

      active = false;
      cleanup();
      reject(error);
    };

    const handleLoad = (): void => {
      if (!active) {
        return;
      }

      const result = reader.result;

      if (typeof result !== "string" && !(result instanceof ArrayBuffer)) {
        rejectOnce(new DOMException("FileReader returned an unexpected result.", "InvalidStateError"));
        return;
      }

      active = false;
      cleanup();
      resolve(result);
    };

    const handleError = (): void => {
      rejectOnce(reader.error ?? new DOMException("Failed to read the file.", "NotReadableError"));
    };

    const handleReaderAbort = (): void => {
      rejectOnce(new DOMException("The file read was aborted.", "AbortError"));
    };

    const handleProgress = (event: ProgressEvent<FileReader>): void => {
      onProgress?.({
        loaded: event.loaded,
        ...(event.lengthComputable ? { total: event.total, ratio: event.total === 0 ? 1 : event.loaded / event.total } : {}),
      });
    };

    const handleSignalAbort = (): void => {
      const reason = getAbortReason(signal);
      rejectOnce(reason);

      if (reader.readyState === FileReader.LOADING) {
        reader.abort();
      }
    };

    reader.addEventListener("load", handleLoad);
    reader.addEventListener("error", handleError);
    reader.addEventListener("abort", handleReaderAbort);
    reader.addEventListener("progress", handleProgress);
    signal?.addEventListener("abort", handleSignalAbort, { once: true });

    if (mode === "text") {
      reader.readAsText(blob, encoding);
    } else if (mode === "array-buffer") {
      reader.readAsArrayBuffer(blob);
    } else {
      reader.readAsDataURL(blob);
    }
  });
}

/** 校验可选文件大小边界。 */
function validateSizeBoundary(value: number | undefined, name: string): void {
  if (value !== undefined) {
    validateNonNegativeFiniteNumber(value, name);
  }
}

/** 校验非负有限数。 */
function validateNonNegativeFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

/** 获取 AbortSignal 的中止原因，并兼容未提供 reason 的浏览器。 */
function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException("The file operation was aborted.", "AbortError");
}

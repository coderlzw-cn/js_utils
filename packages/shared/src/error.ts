/**
 * 跨运行时错误归一化、分类、包装和安全序列化工具。
 *
 * 本模块只依赖 ECMAScript 标准 API，可同时用于现代 Node.js 和浏览器。默认面向
 * 安全边界设计：公开错误不会自动暴露内部消息，序列化也不会默认包含堆栈和详情。
 */

/** 业务错误的附加上下文。 */
export type ErrorDetails = Readonly<Record<string, unknown>>;

/** 可从其他 realm、RPC 边界或第三方库收到的类 Error 对象。 */
export interface ErrorLike {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: unknown;
}

/** AppError 初始化配置。 */
export interface AppErrorOptions {
  /** 稳定、可供程序判断的业务错误码。 */
  readonly code: string;
  /** 导致当前错误的原始异常。 */
  readonly cause?: unknown;
  /** 对应的 HTTP 错误状态码，取值范围为 400 到 599。 */
  readonly statusCode?: number;
  /** 仅供诊断使用的结构化上下文。 */
  readonly details?: ErrorDetails;
  /** 当前操作是否适合在上层重试。默认为 `false`。 */
  readonly retryable?: boolean;
  /** 是否允许向外部调用方公开当前消息。默认为 `false`。 */
  readonly expose?: boolean;
}

/** 包装已有错误时可覆盖的 AppError 配置。 */
export type WrapErrorOptions = Omit<AppErrorOptions, "cause">;

/** 可安全 JSON 序列化的值。 */
export type ErrorJsonValue = boolean | number | string | null | ErrorJsonValue[] | { readonly [key: string]: ErrorJsonValue };

/** 可持久化或发送到日志系统的错误结构。 */
export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly statusCode?: number;
  readonly retryable?: boolean;
  readonly expose?: boolean;
  readonly stack?: string;
  readonly details?: Readonly<Record<string, ErrorJsonValue>>;
  readonly cause?: SerializedError;
}

/** 错误安全序列化配置。 */
export interface SerializeErrorOptions {
  /**
   * 是否包含调用栈。调用栈可能包含文件路径和内部实现，默认不包含。
   *
   * @default false
   */
  readonly includeStack?: boolean;
  /**
   * 是否包含 AppError.details。详情可能含有业务数据，默认不包含。
   *
   * @default false
   */
  readonly includeDetails?: boolean;
  /**
   * 是否递归包含 cause。
   *
   * @default true
   */
  readonly includeCause?: boolean;
  /**
   * cause 链最大深度。
   *
   * @default 5
   */
  readonly maxCauseDepth?: number;
  /**
   * details 内对象和数组的最大递归深度。
   *
   * @default 5
   */
  readonly maxValueDepth?: number;
  /** 额外需要脱敏的字段名，匹配时忽略大小写和 `-`、`_`。 */
  readonly sensitiveKeys?: readonly string[];
  /**
   * 敏感字段替换文本。
   *
   * @default "[REDACTED]"
   */
  readonly redactedValue?: string;
}

/** 面向 API、UI 或其他外部调用方的安全错误结构。 */
export interface PublicError {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly retryable: boolean;
}

/** 公开错误的默认回退配置。 */
export interface PublicErrorFallback {
  /** @default "INTERNAL_ERROR" */
  readonly code?: string;
  /** @default "An unexpected error occurred" */
  readonly message?: string;
  /** @default 500 */
  readonly statusCode?: number;
}

const DEFAULT_SENSITIVE_KEYS = ["password", "passwd", "secret", "clientsecret", "token", "accesstoken", "refreshtoken", "authorization", "cookie", "setcookie", "apikey", "privatekey"] as const;

/**
 * 带稳定错误码、因果链和安全公开策略的业务错误。
 *
 * `details` 适合存放资源 ID、重试次数等诊断上下文，不应直接作为 API 响应返回。
 *
 * @example
 * const error = new AppError('订单不存在', {
 *   code: 'ORDER_NOT_FOUND',
 *   statusCode: 404,
 *   details: { orderId: 'order-123' },
 *   expose: true,
 * });
 *
 * error.code; // "ORDER_NOT_FOUND"
 * error.retryable; // false
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number | undefined;
  readonly details: ErrorDetails | undefined;
  readonly retryable: boolean;
  readonly expose: boolean;

  constructor(message: string, options: AppErrorOptions) {
    assertNonBlankString(options.code, "code");
    assertOptionalStatusCode(options.statusCode, "statusCode");
    super(message, options.cause === undefined ? undefined : { cause: options.cause });

    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.expose = options.expose ?? false;
  }
}

/**
 * 判断未知值是否为真正的 Error，包括来自其他 JavaScript realm 的 Error 对象。
 *
 * @example
 * const value: unknown = new TypeError('参数错误');
 * if (isError(value)) {
 *   console.error(value.message);
 * }
 */
export function isError(value: unknown): value is Error {
  if (value instanceof Error) {
    return true;
  }
  if (!isObjectRecord(value)) {
    return false;
  }

  try {
    return Object.prototype.toString.call(value) === "[object Error]" && isErrorLike(value);
  } catch {
    return false;
  }
}

/**
 * 判断未知值是否具有字符串 name 和 message。
 *
 * 适合识别跨 RPC 边界后丢失 Error 原型的错误数据；它不会承诺对象具有完整 Error API。
 *
 * @example
 * const rpcError: unknown = { name: 'RemoteError', message: '远程调用失败' };
 * if (isErrorLike(rpcError)) {
 *   console.error(`${rpcError.name}: ${rpcError.message}`);
 * }
 */
export function isErrorLike(value: unknown): value is ErrorLike {
  return isObjectRecord(value) && typeof readProperty(value, "name") === "string" && typeof readProperty(value, "message") === "string";
}

/**
 * 判断未知错误是否具有指定的错误名称。
 *
 * @example
 * const error: unknown = { name: 'AbortError', message: '请求已取消' };
 * if (isErrorWithName(error, 'AbortError')) {
 *   console.info(error.message);
 * }
 */
export function isErrorWithName<Name extends string>(error: unknown, name: Name): error is ErrorLike & { readonly name: Name } {
  return isErrorLike(error) && readProperty(error, "name") === name;
}

/**
 * 判断未知错误是否具有指定的字符串错误码。
 *
 * @example
 * const fileError: unknown = Object.assign(new Error('配置文件不存在'), { code: 'ENOENT' });
 * if (isErrorWithCode(fileError, 'ENOENT')) {
 *   console.warn(fileError.message);
 * }
 */
export function isErrorWithCode<Code extends string>(error: unknown, code: Code): error is Error & { readonly code: Code } {
  return isError(error) && readProperty(error, "code") === code;
}

/**
 * 将任意抛出值归一化为 Error。
 *
 * Error 会原样返回；字符串会作为消息；类似 Error 的跨 realm 对象会保留名称、cause
 * 和 stack。其他值使用 fallbackMessage，并作为 cause 保留，避免诊断信息丢失。
 *
 * @example
 * const normalized = toError({ reason: 'timeout' }, '请求失败');
 * normalized.message; // "请求失败"
 * normalized.cause; // { reason: "timeout" }
 *
 * const existing = new Error('数据库不可用');
 * toError(existing) === existing; // true
 */
export function toError(value: unknown, fallbackMessage = "Unknown error"): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string") {
    return new Error(value.length > 0 ? value : fallbackMessage);
  }

  if (isErrorLike(value)) {
    const message = getStringProperty(value, "message") ?? fallbackMessage;
    const cause = readProperty(value, "cause");
    const normalized = new Error(message, cause === undefined ? undefined : { cause });
    normalized.name = getStringProperty(value, "name") ?? "Error";
    const stack = readProperty(value, "stack");
    if (typeof stack === "string") {
      normalized.stack = stack;
    }
    return normalized;
  }

  return new Error(fallbackMessage, { cause: value });
}

/**
 * 获取任意抛出值的可读消息，无法提取时返回 fallbackMessage。
 *
 * @example
 * getErrorMessage(new Error('连接失败')); // "连接失败"
 * getErrorMessage('请求超时'); // "请求超时"
 * getErrorMessage({ status: 500 }, '未知服务错误'); // "未知服务错误"
 */
export function getErrorMessage(error: unknown, fallbackMessage = "Unknown error"): string {
  if (typeof error === "string" && error.length > 0) return error;
  if (isErrorLike(error)) {
    const message = readProperty(error, "message");
    return typeof message === "string" && message.length > 0 ? message : fallbackMessage;
  }
  return fallbackMessage;
}

/**
 * 使用 AppError 包装任意异常，同时通过标准 cause 保留原始错误。
 *
 * @example
 * const cause = new Error('数据库连接中断');
 * const error = wrapError(cause, '订单保存失败', {
 *   code: 'ORDER_SAVE_FAILED',
 *   statusCode: 503,
 *   retryable: true,
 * });
 *
 * error.cause === cause; // true
 * error.retryable; // true
 */
export function wrapError(error: unknown, message: string, options: WrapErrorOptions): AppError {
  return new AppError(message, { ...options, cause: error });
}

/**
 * 获取错误及其 cause 构成的有序链，首项为最外层错误。
 *
 * 循环 cause 会被安全截断；非 Error cause 会被归一化为 Error。
 *
 * @example
 * const root = new Error('连接被拒绝');
 * const outer = new Error('数据库查询失败', { cause: root });
 * const messages = getErrorCauseChain(outer).map(({ message }) => message);
 * // ["数据库查询失败", "连接被拒绝"]
 */
export function getErrorCauseChain(error: unknown, maxDepth = 10): readonly Error[] {
  assertPositiveSafeInteger(maxDepth, "maxDepth");
  const result: Error[] = [];
  const seen = new Set<object>();
  let current: unknown = error;

  while (current !== undefined && result.length < maxDepth) {
    if (typeof current === "object" && current !== null) {
      if (seen.has(current)) {
        break;
      }
      seen.add(current);
    }

    result.push(toError(current));
    current = readErrorCause(current);
  }

  return result;
}

/**
 * 获取 cause 链最深处的错误；无论输入为何均会返回 Error。
 *
 * @example
 * const root = new Error('ECONNREFUSED');
 * const outer = new Error('服务请求失败', { cause: root });
 * getRootCause(outer) === root; // true
 */
export function getRootCause(error: unknown, maxDepth = 10): Error {
  const chain = getErrorCauseChain(error, maxDepth);
  return chain[chain.length - 1] ?? toError(error);
}

/**
 * 将错误转换为适合日志或传输的纯数据。
 *
 * 默认包含 name、message 和 cause，但不包含 stack、details。启用 details 后会处理
 * 循环引用、BigInt、Date、嵌套 Error，并对常见凭据字段和自定义敏感字段脱敏。
 *
 * @example
 * const error = new AppError('登录失败', {
 *   code: 'LOGIN_FAILED',
 *   statusCode: 401,
 *   details: { username: 'alice', accessToken: 'secret-token' },
 * });
 *
 * serializeError(error, { includeDetails: true });
 * // {
 * //   name: "AppError",
 * //   message: "登录失败",
 * //   code: "LOGIN_FAILED",
 * //   statusCode: 401,
 * //   retryable: false,
 * //   expose: false,
 * //   details: { username: "alice", accessToken: "[REDACTED]" }
 * // }
 */
export function serializeError(error: unknown, options: SerializeErrorOptions = {}): SerializedError {
  const resolvedOptions = resolveSerializeOptions(options);
  return serializeErrorValue(error, resolvedOptions, 0, new Set<object>());
}

/**
 * 从 SerializedError 恢复 Error 或 AppError。
 *
 * 包含 code 的数据恢复为 AppError，其余恢复为原生 Error；cause、stack 和公开策略
 * 会一并恢复。输入应来自可信存储或经过结构校验的传输边界。
 *
 * @example
 * const restored = deserializeError({
 *   name: 'AppError',
 *   message: '请求过于频繁',
 *   code: 'RATE_LIMITED',
 *   statusCode: 429,
 *   retryable: true,
 * });
 *
 * restored instanceof AppError; // true
 * restored.message; // "请求过于频繁"
 */
export function deserializeError(serialized: SerializedError): Error {
  return deserializeErrorValue(serialized, new WeakMap<object, Error>());
}

/**
 * 将错误转换为可安全返回给 API 或 UI 的结构。
 *
 * 只有 `AppError.expose` 为 true 时才公开其消息和错误码，否则使用通用回退信息。
 * details 和 stack 永远不会进入返回结果。
 *
 * @example
 * const error = new AppError('邮箱格式错误', {
 *   code: 'INVALID_EMAIL',
 *   statusCode: 400,
 *   expose: true,
 * });
 *
 * toPublicError(error);
 * // {
 * //   code: "INVALID_EMAIL",
 * //   message: "邮箱格式错误",
 * //   statusCode: 400,
 * //   retryable: false
 * // }
 *
 * toPublicError(new Error('数据库密码错误'));
 * // 使用默认 INTERNAL_ERROR，不泄露内部消息
 */
export function toPublicError(error: unknown, fallback: PublicErrorFallback = {}): PublicError {
  const { code = "INTERNAL_ERROR", message = "An unexpected error occurred", statusCode = 500 } = fallback;
  assertNonBlankString(code, "fallback.code");
  assertOptionalStatusCode(statusCode, "fallback.statusCode");

  if (error instanceof AppError && error.expose) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode ?? statusCode,
      retryable: error.retryable,
    };
  }

  return { code, message, statusCode, retryable: false };
}

interface ResolvedSerializeErrorOptions {
  readonly includeStack: boolean;
  readonly includeDetails: boolean;
  readonly includeCause: boolean;
  readonly maxCauseDepth: number;
  readonly maxValueDepth: number;
  readonly sensitiveKeys: ReadonlySet<string>;
  readonly redactedValue: string;
}

function resolveSerializeOptions(options: SerializeErrorOptions): ResolvedSerializeErrorOptions {
  const { includeStack = false, includeDetails = false, includeCause = true, maxCauseDepth = 5, maxValueDepth = 5, sensitiveKeys = [], redactedValue = "[REDACTED]" } = options;
  assertNonNegativeSafeInteger(maxCauseDepth, "maxCauseDepth");
  assertNonNegativeSafeInteger(maxValueDepth, "maxValueDepth");

  return {
    includeStack,
    includeDetails,
    includeCause,
    maxCauseDepth,
    maxValueDepth,
    sensitiveKeys: new Set([...DEFAULT_SENSITIVE_KEYS, ...sensitiveKeys].map(normalizeSensitiveKey)),
    redactedValue,
  };
}

function serializeErrorValue(error: unknown, options: ResolvedSerializeErrorOptions, causeDepth: number, seen: Set<object>): SerializedError {
  const normalized = toError(error);
  const source = isObjectRecord(error) ? error : normalized;
  const name = getStringProperty(source, "name") ?? normalized.name;
  const message = getStringProperty(source, "message") ?? normalized.message;
  const code = getStringProperty(source, "code");
  const statusCode = getStatusCodeProperty(source);
  const retryable = getBooleanProperty(source, "retryable");
  const expose = getBooleanProperty(source, "expose");
  const stack = getStringProperty(source, "stack");
  const details = readProperty(source, "details");
  const cause = isObjectRecord(error) ? readErrorCause(error) : undefined;

  if (typeof error === "object" && error !== null) {
    seen.add(error);
  }

  const result: SerializedError = {
    name,
    message,
    ...(code === undefined ? {} : { code }),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(retryable === undefined ? {} : { retryable }),
    ...(expose === undefined ? {} : { expose }),
    ...(options.includeStack && stack !== undefined ? { stack } : {}),
    ...(options.includeDetails && isObjectRecord(details)
      ? {
          details: sanitizeErrorDetails(details, options, new Set<object>()),
        }
      : {}),
  };

  if (options.includeCause && cause !== undefined && causeDepth < options.maxCauseDepth && !(typeof cause === "object" && cause !== null && seen.has(cause))) {
    return {
      ...result,
      cause: serializeErrorValue(cause, options, causeDepth + 1, seen),
    };
  }

  return result;
}

function sanitizeErrorDetails(details: Record<PropertyKey, unknown>, options: ResolvedSerializeErrorOptions, seen: Set<object>): Readonly<Record<string, ErrorJsonValue>> {
  const result: Record<string, ErrorJsonValue> = {};
  seen.add(details);

  for (const key of getEnumerableKeys(details)) {
    result[key] = options.sensitiveKeys.has(normalizeSensitiveKey(key)) ? options.redactedValue : sanitizeErrorValue(readProperty(details, key), options, 0, seen);
  }

  return result;
}

function sanitizeErrorValue(value: unknown, options: ResolvedSerializeErrorOptions, depth: number, seen: Set<object>): ErrorJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return `[${value === undefined ? "undefined" : typeof value}]`;
  }
  if (depth >= options.maxValueDepth) {
    return "[MaxDepth]";
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "Invalid Date";
  }
  if (isErrorLike(value)) {
    return {
      name: getStringProperty(value, "name") ?? "Error",
      message: getStringProperty(value, "message") ?? "Unknown error",
    };
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorValue(item, options, depth + 1, seen));
  }

  const result: Record<string, ErrorJsonValue> = {};
  for (const key of getEnumerableKeys(value)) {
    result[key] = options.sensitiveKeys.has(normalizeSensitiveKey(key)) ? options.redactedValue : sanitizeErrorValue(readProperty(value, key), options, depth + 1, seen);
  }
  return result;
}

function deserializeErrorValue(serialized: SerializedError, seen: WeakMap<object, Error>): Error {
  if (!isObjectRecord(serialized)) {
    throw new TypeError("serialized error must be an object");
  }

  const cached = seen.get(serialized);
  if (cached) {
    return cached;
  }

  assertNonBlankString(serialized.name, "serialized.name");
  if (typeof serialized.message !== "string") {
    throw new TypeError("serialized.message must be a string");
  }
  assertOptionalStatusCode(serialized.statusCode, "serialized.statusCode");

  const error =
    serialized.code === undefined
      ? new Error(serialized.message)
      : new AppError(serialized.message, {
          code: serialized.code,
          ...(serialized.statusCode === undefined ? {} : { statusCode: serialized.statusCode }),
          ...(serialized.details === undefined ? {} : { details: serialized.details }),
          ...(serialized.retryable === undefined ? {} : { retryable: serialized.retryable }),
          ...(serialized.expose === undefined ? {} : { expose: serialized.expose }),
        });
  seen.set(serialized, error);
  error.name = serialized.name;

  if (serialized.stack !== undefined) {
    error.stack = serialized.stack;
  }
  if (serialized.cause !== undefined) {
    Object.defineProperty(error, "cause", {
      value: deserializeErrorValue(serialized.cause, seen),
      writable: true,
      configurable: true,
    });
  }

  return error;
}

function readErrorCause(error: unknown): unknown {
  return isObjectRecord(error) ? readProperty(error, "cause") : undefined;
}

function getStringProperty(value: object, key: PropertyKey): string | undefined {
  const property = readProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function getBooleanProperty(value: object, key: PropertyKey): boolean | undefined {
  const property = readProperty(value, key);
  return typeof property === "boolean" ? property : undefined;
}

function getStatusCodeProperty(value: object): number | undefined {
  const statusCode = readProperty(value, "statusCode");
  return isStatusCode(statusCode) ? statusCode : undefined;
}

function readProperty(value: object, key: PropertyKey): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function getEnumerableKeys(value: object): string[] {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}

function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function normalizeSensitiveKey(key: string): string {
  return key.replace(/[-_]/gu, "").toLocaleLowerCase("en-US");
}

function isStatusCode(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599;
}

function assertOptionalStatusCode(value: number | undefined, name: string): void {
  if (value !== undefined && !isStatusCode(value)) {
    throw new RangeError(`${name} must be an integer from 400 to 599`);
  }
}

function assertNonBlankString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-blank string`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

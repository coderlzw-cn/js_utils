import { realpath } from "node:fs/promises";

import path from "node:path";
import { containsControlCharacter } from "../shared/string";
const WINDOWS_DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;

/** 判断是否为 Windows 盘符绝对路径（在 POSIX 上 `isAbsolute` 不会识别）。 */
export function isWindowsDriveAbsolute(value: string): boolean {
  return WINDOWS_DRIVE_ABSOLUTE.test(value);
}

/** 判断 `target` 是否等于 `root`，或位于 `root` 目录树之内。两侧都会先 `resolve`。 */
export function isPathInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

/**
 * 确保目标路径位于根目录内，返回解析后的绝对路径。
 * @throws {Error}
 */
export function assertInsideRoot(
  root: string,
  target: string,
  message = "路径超出允许的根目录",
): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isPathInsideRoot(resolvedRoot, resolvedTarget)) {
    throw new Error(message);
  }
  return resolvedTarget;
}

/** 使用错误优先元组判断单个路径段是否合法。 */
export function isValidPathSegment(
  value: unknown,
  message = "路径名称非法",
): [error: Error | undefined, result: boolean] {
  if (typeof value !== "string") return [new Error(message), false];
  const segment = value.trim();
  const valid =
    Boolean(segment) &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    !path.isAbsolute(segment) &&
    !isWindowsDriveAbsolute(segment) &&
    !containsControlCharacter(segment);
  return valid ? [undefined, true] : [new Error(message), false];
}

/**
 * 在指定根目录下解析相对路径，禁止空字节、绝对路径与越界。
 * @throws {Error}
 */
export function resolvePathInside(
  root: string,
  requestedPath: string,
  message = "路径非法或超出允许的根目录",
): string {
  if (
    requestedPath.includes("\0") ||
    path.isAbsolute(requestedPath) ||
    isWindowsDriveAbsolute(requestedPath)
  ) {
    throw new Error(message);
  }
  return assertInsideRoot(root, path.resolve(root, requestedPath), message);
}

/**
 * 将已持久化的路径解析为根目录内的绝对路径。相对路径相对 `root`，绝对路径仍须落在 `root` 内。
 * @throws {Error}
 */
export function resolveContainedPath(
  root: string,
  storedPath: string,
  message = "存储路径非法",
): string {
  if (!storedPath || storedPath.includes("\0")) throw new Error(message);
  const target = path.isAbsolute(storedPath)
    ? path.resolve(storedPath)
    : path.resolve(root, storedPath);
  return assertInsideRoot(root, target, message);
}

export interface ArchiveEntryPathMessages {
  readonly invalid?: string;
  readonly traversal?: string;
}

/**
 * 解析压缩包条目的落盘路径：规范化分隔符，拒绝空路径、NUL、绝对路径与越界。
 * @throws {Error}
 */
export function resolveArchiveEntryPath(
  root: string,
  entryPath: string,
  messages: ArchiveEntryPathMessages = {},
): string {
  const invalid = messages.invalid ?? "压缩包包含非法路径";
  const traversal = messages.traversal ?? "压缩包包含越界路径";
  const normalized = entryPath.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.includes("\0") ||
    path.isAbsolute(normalized) ||
    isWindowsDriveAbsolute(normalized)
  ) {
    throw new Error(invalid);
  }
  return resolvePathInside(root, normalized, traversal);
}

/**
 * 通过 `realpath` 校验解析后的目标仍位于根目录内，防止符号链接逃逸。
 * @throws {Error}
 */
export async function assertNoSymlinkEscape(
  root: string,
  target: string,
  message = "路径指向根目录之外",
): Promise<void> {
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
  if (!isPathInsideRoot(realRoot, realTarget)) {
    throw new Error(message);
  }
}

/** 计算相对路径并以 POSIX `/` 作为分隔符。 */
export function toPosixRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}

/** 取路径最后一段作为文件名：去首尾空白，统一分隔符，不做合法性校验。 */
export function normalizeFileName(value: string): string {
  return path.basename(value.trim().replaceAll("\\", "/"));
}

/**
 * 企业级路径文件名提取工具函数
 *
 * @param filePath 目标文件或目录路径
 * @param options 配置选项
 * @returns 提取出的文件名/目录名
 */
export function getSafeBasename(
  filePath: unknown,
  options: {
    /**
     * 是否剥离扩展名
     * - true: 自动剥离最后一个扩展名 (.png -> 'filename')
     * - 'all': 剥离所有后缀 (.tar.gz -> 'archive')
     * - string: 剥离指定的后缀字符串 (如 '.test.ts')
     * - false/undefined: 保留扩展名
     */
    stripExt?: boolean | "all" | string;

    /**
     * 强制指定操作系统路径分隔符解析模式
     * - 'auto': 根据当前系统自动选择 (默认)
     * - 'win32': 按照 Windows 规则解析 (同时支持 / 和 \)
     * - 'posix': 按照 Linux/macOS 规则解析 (仅支持 /)
     */
    platform?: "auto" | "win32" | "posix";

    /**
     * 是否清洗文件名中的系统非法字符与控制字符
     * - true: 开启清洗，默认将非法字符替换为 '_'
     * - false: 不清洗 (默认)
     */
    sanitize?: boolean;

    /**
     * 替换非法字符的占位符（仅在 sanitize 为 true 时生效，默认为 '_'）
     */
    replacement?: string;
  } = {},
): string {
  // 1. 类型防御
  if (typeof filePath !== "string" || !filePath.trim()) {
    return "";
  }

  const { stripExt = false, platform = "auto", sanitize = false, replacement = "_" } = options;

  // 2. 选择路径解析器
  const pathEngine = platform === "win32" ? path.win32 : platform === "posix" ? path.posix : path;

  // 3. 过滤可能存在的不可见控制字符。
  const cleanInput = Array.from(filePath.trim())
    .filter((character) => !containsControlCharacter(character))
    .join("");

  // 4. 提取基础文件名 (处理结尾斜杠等标准边界)
  let baseName = pathEngine.basename(cleanInput);

  if (!baseName) {
    return "";
  }

  // 5. 特殊字符与系统保留字安全清洗
  if (sanitize) {
    // 匹配 Windows/POSIX 核心非法字符以及不可见控制符
    // eslint-disable-next-line no-control-regex
    const illegalCharsRegex = /[/?<>\\:*|"\x00-\x1f\x7f-\x9f]/g;
    // 匹配 Windows 系统保留字 (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    const reservedNamesRegex = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

    baseName = baseName.replace(illegalCharsRegex, replacement);

    // 如果触发保留字，在前缀拼接替换符避免系统冲突
    if (reservedNamesRegex.test(baseName)) {
      baseName = `${replacement}${baseName}`;
    }
  }

  if (!stripExt) {
    return baseName;
  }

  // 6. 处理扩展名剥离逻辑
  if (stripExt === "all") {
    // 匹配第一个点之后的所有后缀（忽略隐藏文件的起始点，如 .gitignore）
    const dotIndex = baseName.indexOf(".", 1);
    return dotIndex !== -1 ? baseName.substring(0, dotIndex) : baseName;
  }

  if (typeof stripExt === "string") {
    return pathEngine.basename(baseName, stripExt);
  }

  if (stripExt === true) {
    const ext = pathEngine.extname(baseName);
    return pathEngine.basename(baseName, ext);
  }

  return baseName;
}

/**
 * 校验相对路径合法性（原样校验，不做任何字符替换与清洗）
 *
 * 拒绝规则：
 * 1. 空字符串或仅包含空格
 * 2. 包含空字节 (\0) 或不可见控制字符
 * 3. 绝对路径（POSIX 以 '/' 开头、Windows 盘符如 'C:'、UNC 路径以 '//' 或 '\\' 开头）
 * 4. 路径穿越段（含 '.' 或 '..' 路径段）
 * 5. 格式错误段（如仅包含空格的目录段）
 *
 * @param pathInput 待校验的原始路径字符串
 * @param options 配置项
 * @returns 校验通过的原始路径（已 trim 首尾空格）
 * @throws Error 校验不通过时抛出异常
 */
export function validateRelativePath(
  pathInput: unknown,
  options: {
    /** 是否允许连续分隔符或末尾分隔符产生的空路径段。默认为 true。 */
    allowEmptySegments?: boolean;
    /** 接受的路径分隔符。默认为同时接受 POSIX 与 Windows 分隔符。 */
    separators?: "both" | "posix";
    /**
     * 自定义错误提示消息
     */
    customErrorMessage?: {
      empty?: string;
      invalid?: string;
    };
  } = {},
): string {
  const { allowEmptySegments = true, customErrorMessage, separators = "both" } = options;

  const emptyMsg = customErrorMessage?.empty ?? "请选择配置目录";
  const invalidMsg = customErrorMessage?.invalid ?? "配置目录必须是相对版本目录的有效路径";

  // 1. 类型与非空校验
  if (typeof pathInput !== "string") {
    throw new Error(emptyMsg);
  }

  const raw = pathInput.trim();
  if (!raw) {
    throw new Error(emptyMsg);
  }

  // 2. 拒绝包含空字节或不可见控制字符 (\x00-\x1F, \x7F-\x9F)
  if (containsControlCharacter(raw)) {
    throw new Error(invalidMsg);
  }

  // 3. 拒绝任何形式的绝对路径或网络共享路径 (UNC)
  // - Posix 绝对路径: 开头为 /
  // - Windows 绝对路径: 开头为 盘符: 或 \
  // - UNC 路径: 开头为 // 或 \\
  if (
    raw.startsWith("/") ||
    raw.startsWith("\\") ||
    /^[a-zA-Z]:/.test(raw) ||
    (separators === "posix" && raw.includes("\\"))
  ) {
    throw new Error(invalidMsg);
  }

  // 4. 统一按斜杠拆分（同时兼容 / 与 \），逐段进行精准校验
  const segments = separators === "posix" ? raw.split("/") : raw.split(/[/\\]/);

  for (const segment of segments) {
    // 允许连续斜杠开头的末尾留空（如 'a/b/'），但排除纯空段
    if (segment === "") {
      if (allowEmptySegments) continue;
      throw new Error(invalidMsg);
    }

    // 拒绝包含空格绕过的 '.' 或 '..' 段（例如 ' .. ', ' . '）
    const trimmedSegment = segment.trim();
    if (trimmedSegment === "." || trimmedSegment === "..") {
      throw new Error(invalidMsg);
    }

    // 拒绝仅由空格组成的无效目录段（例如 'a/   /b'）
    if (trimmedSegment === "") {
      throw new Error(invalidMsg);
    }
  }

  return raw;
}

/** 使用错误优先元组判断相对路径是否合法。 */
export function isValidRelativePath(
  pathInput: unknown,
  options: Parameters<typeof validateRelativePath>[1] = {},
): [error: unknown | undefined, result: boolean] {
  try {
    validateRelativePath(pathInput, options);
    return [undefined, true];
  } catch (error) {
    return [error, false];
  }
}

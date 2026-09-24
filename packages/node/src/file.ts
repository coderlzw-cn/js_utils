import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs, { constants } from "node:fs";
import { access, lstat, mkdir, open, readdir, rename, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { resolveArchiveEntryPath } from "./path";

const COMMAND_ENV = { ...process.env, LC_ALL: "C" };
const EXTRACT_TIMEOUT_MS = 30 * 60 * 1000;
const COMMAND_KILL_GRACE_MS = 5_000;
const STDOUT_LIST_MAX_BYTES = 32 * 1024 * 1024;
const STDERR_MAX_BYTES = 64 * 1024;

/** 文件系统布尔判断结果：第一项为底层错误，第二项为判断结果。 */
export type FileCheckResult = [error: unknown | undefined, result: boolean];

/** 判断路径是否存在。 */
export async function pathExists(targetPath: string): Promise<FileCheckResult> {
  try {
    await lstat(targetPath);
    return [undefined, true];
  } catch (error) {
    return [error, false];
  }
}

/** 判断路径是否指向普通文件。 */
export async function isFile(targetPath: string): Promise<FileCheckResult> {
  try {
    return [undefined, (await lstat(targetPath)).isFile()];
  } catch (error) {
    return [error, false];
  }
}

/** 判断路径是否指向目录。 */
export async function isDirectory(targetPath: string): Promise<FileCheckResult> {
  try {
    return [undefined, (await lstat(targetPath)).isDirectory()];
  } catch (error) {
    return [error, false];
  }
}

/**
 * 检查文件或目录是否可写。
 *
 * 同时检查写权限位与当前进程的实际写权限，避免进程以 root 身份运行时将完全没有写权限位
 * 的文件误判为可写。无法判断时通过结果元组返回底层错误和 false。
 */
export async function isWritable(targetPath: string): Promise<FileCheckResult> {
  try {
    const targetStat = await lstat(targetPath);
    if ((targetStat.mode & 0o222) === 0) return [undefined, false];
    await access(targetPath, constants.W_OK);
    return [undefined, true];
  } catch (error) {
    return [error, false];
  }
}

/** 递归判断目录是否包含不可写的后代节点。 */
export async function containsUnwritableDescendant(directoryPath: string): Promise<FileCheckResult> {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const targetPath = join(directoryPath, entry.name);
      const [writableError, writable] = await isWritable(targetPath);
      if (writableError) return [writableError, false];
      if (!writable) return [undefined, true];
      if (entry.isDirectory()) {
        const [descendantError, containsUnwritable] = await containsUnwritableDescendant(targetPath);
        if (descendantError) return [descendantError, false];
        if (containsUnwritable) return [undefined, true];
      }
    }
    return [undefined, false];
  } catch (error) {
    return [error, false];
  }
}

/** 排他写入文件；目标已存在时抛出 `EEXIST`，不会覆盖原文件。 */
export function writeExclusive(filePath: string, data: Buffer | string, mode: number): void {
  const descriptor = fs.openSync(filePath, "wx", mode);
  try {
    fs.writeFileSync(descriptor, data);
  } finally {
    fs.closeSync(descriptor);
  }
}

/** 通过同目录临时文件和原子重命名完整替换目标文件。 */
export function writeAtomic(filePath: string, data: Buffer | string, mode: number): void {
  const directory = dirname(filePath);
  const filename = basename(filePath);
  const temporaryPath = join(directory, `.${filename}.tmp-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(temporaryPath, data, { mode });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // 临时文件清理失败不覆盖主异常。
    }
    throw error;
  }
}

export interface BoundedLogFileOptions {
  /** 唯一日志文件的路径；整理时文件名保持不变。 */
  readonly filePath: string;
  /** 文件允许占用的最大 UTF-8 字节数，必须为正安全整数。 */
  readonly maxBytes: number;
  /**
   * 触发整理后希望保留的最新数据字节数，必须小于 `maxBytes`。
   * 实际保留量可能更小，因为工具只从完整日志行的边界开始保留。
   */
  readonly retainedBytes: number;
  /** 文件不存在时使用的权限，默认 `0o640`。 */
  readonly mode?: number;
  /** 是否自动创建父目录，默认 `true`。 */
  readonly createParentDirectory?: boolean;
  /** 每次写入后是否执行 `datasync`；更可靠但会明显降低高频日志写入性能，默认 `false`。 */
  readonly syncOnWrite?: boolean;
}

type BoundedLogFileState = "accepting" | "closing" | "closed";

/**
 * 只保留最新内容的单文件日志写入器。
 *
 * 所有操作都经过内部队列串行执行，调用方可以并发调用 `write()` / `writeLine()`；达到
 * `maxBytes` 上限时，写入器会读取文件尾部不超过 `retainedBytes` 的完整 LF 分隔日志行，写入
 * 同目录临时文件并原子替换原文件。它不会生成带序号的历史文件。
 *
 * 一个实例应独占一个目标文件。其他进程或写入器同时修改同一文件时，内部字节计数和
 * 原子替换语义将无法保证。依赖 inode 持续不变的 `tail -f` 消费者也应改用能够按文件名
 * 重新打开文件的 `tail -F`。
 */
export class BoundedLogFileWriter {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly retainedBytes: number;
  private readonly mode: number;
  private readonly createParentDirectory: boolean;
  private readonly syncOnWrite: boolean;
  private handle?: FileHandle;
  private currentBytes = 0;
  private queue = Promise.resolve();
  private closePromise?: Promise<void>;
  private state: BoundedLogFileState = "accepting";
  private temporarySequence = 0;

  constructor(options: BoundedLogFileOptions) {
    assertFilePath(options.filePath);
    assertPositiveSafeInteger(options.maxBytes, "maxBytes");
    assertNonNegativeSafeInteger(options.retainedBytes, "retainedBytes");
    if (options.retainedBytes >= options.maxBytes) {
      throw new RangeError("retainedBytes 必须小于 maxBytes，以便整理后释放空间");
    }

    const mode = options.mode ?? 0o640;
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) {
      throw new RangeError("mode 必须是 0 到 0o777 之间的整数");
    }

    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes;
    this.retainedBytes = options.retainedBytes;
    this.mode = mode;
    this.createParentDirectory = options.createParentDirectory ?? true;
    this.syncOnWrite = options.syncOnWrite ?? false;
  }

  /** 当前实例是否已经停止接收新日志。 */
  get closed(): boolean {
    return this.state !== "accepting";
  }

  /**
   * 按 UTF-8 写入字符串，或写入调用时复制后的二进制数据。
   * 单次数据不得大于 `maxBytes`，避免无法满足固定容量约束。
   */
  write(data: string | Uint8Array) {
    this.assertAccepting();
    const content = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    if (content.byteLength === 0) return Promise.resolve();
    if (content.byteLength > this.maxBytes) {
      return Promise.reject(new RangeError(`单次写入 ${content.byteLength} 字节，超过 maxBytes ${this.maxBytes}`));
    }
    return this.enqueue(() => this.writeInternal(content));
  }

  /** 使用 LF 追加一条文本日志；不要传入控制台显示专用的尾部 CR。 */
  writeLine(line: string) {
    if (typeof line !== "string") return Promise.reject(new TypeError("line 必须是字符串"));
    return this.write(`${line}\n`);
  }

  /** 等待此前写入完成，并将当前文件的数据提交给操作系统。 */
  flush() {
    this.assertAccepting();
    return this.enqueue(async () => {
      if (this.handle) await this.handle.datasync();
    });
  }

  /**
   * 停止接收新日志，等待队列完成并关闭文件句柄。重复调用会返回同一个关闭任务。
   */
  close() {
    if (this.closePromise) return this.closePromise;
    this.state = "closing";
    this.closePromise = this.queue.then(async () => {
      try {
        if (this.handle) await this.handle.close();
      } finally {
        this.handle = undefined;
        this.state = "closed";
      }
    });
    return this.closePromise;
  }

  private assertAccepting() {
    if (this.state !== "accepting") throw new Error("日志写入器已经关闭或正在关闭");
  }

  private enqueue(operation: () => Promise<void>) {
    const result = this.queue.then(operation);
    // 单次失败应返回给调用方，但不能让队列永久停留在 rejected 状态。
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async writeInternal(content: Buffer) {
    await this.ensureOpen();
    if (this.currentBytes + content.byteLength > this.maxBytes) {
      const availableAfterWrite = this.maxBytes - content.byteLength;
      await this.compact(Math.min(this.retainedBytes, availableAfterWrite));
    }

    if (!this.handle) throw new Error("日志文件未打开");
    await writeAll(this.handle, content);
    this.currentBytes += content.byteLength;
    if (this.syncOnWrite) await this.handle.datasync();
  }

  private async ensureOpen() {
    if (this.handle) return;
    if (this.createParentDirectory) await mkdir(dirname(this.filePath), { recursive: true });
    this.handle = await open(this.filePath, "a+", this.mode);
    this.currentBytes = (await this.handle.stat()).size;
  }

  private async compact(targetBytes: number) {
    if (!this.handle) throw new Error("日志文件未打开");

    // 重新读取真实大小，使首次打开的超限文件也能被正确整理。
    const sourceHandle = this.handle;
    const sourceStat = await sourceHandle.stat();
    const retained = await readCompleteLogTail(sourceHandle, sourceStat.size, targetBytes);
    await sourceHandle.close();
    this.handle = undefined;

    const temporaryPath = join(dirname(this.filePath), `.${basename(this.filePath)}.compact-${process.pid}-${Date.now()}-${this.temporarySequence++}`);
    let temporaryHandle: FileHandle | undefined;
    let replaced = false;

    try {
      temporaryHandle = await open(temporaryPath, "wx", sourceStat.mode & 0o777);
      await writeAll(temporaryHandle, retained);
      // 原子替换前同步临时文件，避免成功 rename 后只留下尚未提交的内容。
      await temporaryHandle.datasync();
      await temporaryHandle.close();
      temporaryHandle = undefined;
      await rename(temporaryPath, this.filePath);
      replaced = true;
      this.currentBytes = retained.byteLength;
      await this.ensureOpen();
    } finally {
      if (temporaryHandle) await temporaryHandle.close().catch(() => undefined);
      if (!replaced)
        await unlink(temporaryPath).catch((error: unknown) => {
          if (!isErrnoCode(error, "ENOENT")) throw error;
        });
    }
  }
}

function assertFilePath(filePath: string) {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) {
    throw new TypeError("filePath 必须是非空且不含 NUL 的路径");
  }
}

function assertPositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} 必须是正安全整数`);
}

function assertNonNegativeSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} 必须是非负安全整数`);
}

async function writeAll(handle: FileHandle, content: Uint8Array) {
  let offset = 0;
  while (offset < content.byteLength) {
    const { bytesWritten } = await handle.write(content, offset, content.byteLength - offset, null);
    if (bytesWritten === 0) throw new Error("日志文件写入未取得进展");
    offset += bytesWritten;
  }
}

/** 从不超过目标字节数的第一个完整 LF 分隔行开始保留，避免切断 UTF-8 字符或日志行。 */
async function readCompleteLogTail(handle: FileHandle, fileBytes: number, targetBytes: number): Promise<Buffer> {
  if (targetBytes === 0 || fileBytes === 0) return Buffer.alloc(0);
  const start = Math.max(0, fileBytes - targetBytes);
  const content = Buffer.alloc(fileBytes - start);
  let offset = 0;

  while (offset < content.byteLength) {
    const { bytesRead } = await handle.read(content, offset, content.byteLength - offset, start + offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }

  const completeContent = content.subarray(0, offset);
  if (start === 0) return completeContent;
  const firstLineFeed = completeContent.indexOf(0x0a);
  return firstLineFeed === -1 ? Buffer.alloc(0) : completeContent.subarray(firstLineFeed + 1);
}

export interface DuBytesOptions {
  /** `sudo -S` 使用的密码。普通权限失败且提供了密码时才会提权重试。 */
  readonly sudoPassword?: string;
}

/**
 * 通过 `du -sb` 计算路径占用字节数（含目录本身）。
 *
 * 先以当前用户执行；若因权限失败且提供了 `sudoPassword`，再以 `sudo -S` 重试。
 */
export function duBytes(targetPath: string, options: DuBytesOptions = {}): bigint {
  if (typeof targetPath !== "string" || targetPath.length === 0 || targetPath.includes("\0")) {
    throw new TypeError("targetPath 必须是非空且不含 NUL 的路径");
  }

  try {
    return parseDuBytes(runDu(targetPath));
  } catch (error) {
    if (!canEscalate(error, options.sudoPassword)) throw error;
    return parseDuBytes(runDuWithSudo(targetPath, options.sudoPassword));
  }
}

function runDu(targetPath: string): string {
  return execFileSync("du", ["-sb", targetPath], { encoding: "utf8" });
}

function runDuWithSudo(targetPath: string, sudoPassword: string): string {
  return execFileSync("sudo", ["-S", "-p", "", "du", "-sb", targetPath], {
    encoding: "utf8",
    input: `${sudoPassword}\n`,
  });
}

function canEscalate(error: unknown, sudoPassword: string | undefined): sudoPassword is string {
  if (sudoPassword === undefined || sudoPassword.length === 0) return false;
  if (typeof process.getuid === "function" && process.getuid() === 0) return false;
  return isPermissionDenied(error);
}

function isPermissionDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = Reflect.get(error, "code");
  if (code === "EACCES" || code === "EPERM") return true;
  return /permission denied|操作不允许/iu.test(`${readStderr(error)}\n${Reflect.get(error, "message") ?? ""}`);
}

function parseDuBytes(output: string): bigint {
  const bytes = output.split("\t", 1)[0]?.trim() ?? "";
  if (!/^\d+$/.test(bytes)) throw new Error("无法解析目录占用字节数");
  return BigInt(bytes);
}

function readStderr(error: object): string {
  const stderr = Reflect.get(error, "stderr");
  if (typeof stderr === "string") return stderr;
  if (Buffer.isBuffer(stderr)) return stderr.toString("utf8");
  return "";
}

function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === code;
}

/** 最长后缀优先，避免 `.tar.gz` 被拆成 `.tar`。 */
export const ARCHIVE_SUFFIXES = [".tar.gz", ".tar.bz2", ".tar.xz", ".tar.lzma", ".tar.zst", ".tar.z", ".tgz", ".tbz2", ".tbz", ".txz", ".tzst", ".taz", ".tar", ".zip", ".7z", ".rar"] as const;

export type ArchiveSuffix = (typeof ARCHIVE_SUFFIXES)[number];

export interface ArchiveName {
  /** 不含目录的文件名 */
  readonly basename: string;
  /** 匹配到的小写后缀（含点） */
  readonly suffix: ArchiveSuffix;
  /** 去掉后缀后的名称 */
  readonly stem: string;
}

type ArchiveKind = "tar" | "zip" | "sevenZ" | "rar";

/**
 * 解析压缩包文件名（含复合后缀）。传入绝对路径时只看最后一段。
 *
 * 无法识别、或去掉后缀后名称为空 / `.` / `..` 时返回 `undefined`。
 */
export function parseArchiveName(filename: string): ArchiveName | undefined {
  if (typeof filename !== "string" || filename.length === 0 || filename.includes("\0")) {
    throw new TypeError("filename 必须是非空且不含 NUL 的路径");
  }

  const base = basename(filename);
  if (base.length === 0 || base === "." || base === "..") return undefined;
  const lower = base.toLowerCase();
  const suffix = ARCHIVE_SUFFIXES.find((item) => lower.endsWith(item));
  if (!suffix) return undefined;
  const stem = base.slice(0, -suffix.length);
  if (stem.length === 0 || stem === "." || stem === "..") return undefined;
  return { basename: base, suffix, stem };
}

/** 判断文件名是否为受支持的压缩包。 */
export function isArchiveName(filename: string): boolean {
  return parseArchiveName(filename) !== undefined;
}

/**
 * 去掉压缩包复合后缀后的名称。
 * @throws {Error} 不是合法压缩包文件名时
 */
export function archiveStem(filename: string): string {
  const parsed = parseArchiveName(filename);
  if (!parsed) throw new Error("压缩包名称非法");
  return parsed.stem;
}

/** 按文件名后缀返回下载用 Content-Type；无法识别时为 `application/octet-stream`。 */
export function archiveContentType(filename: string): string {
  const parsed = parseArchiveName(filename);
  if (!parsed) return "application/octet-stream";
  if (parsed.suffix === ".zip") return "application/zip";
  if (parsed.suffix === ".7z") return "application/x-7z-compressed";
  if (parsed.suffix === ".rar") return "application/vnd.rar";
  if (parsed.suffix === ".tar.gz" || parsed.suffix === ".tgz" || parsed.suffix === ".taz") return "application/gzip";
  if (parsed.suffix === ".tar.z") return "application/x-compress";
  if (parsed.suffix === ".tar.bz2" || parsed.suffix === ".tbz2" || parsed.suffix === ".tbz") return "application/x-bzip2";
  if (parsed.suffix === ".tar.xz" || parsed.suffix === ".txz" || parsed.suffix === ".tar.lzma") return "application/x-xz";
  if (parsed.suffix === ".tar.zst" || parsed.suffix === ".tzst") return "application/zstd";
  return "application/x-tar";
}

/**
 * 将压缩包解压到已存在的目录。使用系统命令：`tar`、`unzip`（缺失时回退 `7z`）、`7z`。
 *
 * 解压前校验条目路径；解压后拒绝符号链接与特殊文件。可通过 `signal` / `timeoutMs` 取消或限时。
 */
export async function extractArchive(archivePath: string, destination: string, options: ExtractArchiveOptions = {}) {
  assertCommandPath(archivePath, "archivePath");
  assertCommandPath(destination, "destination");
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const kind = await sniffArchiveKind(archivePath);
  const entries = await listArchiveEntries(kind, archivePath, options.signal, timeoutMs);
  for (const entry of entries) {
    if (entry.kind !== "file" && entry.kind !== "directory") {
      throw new Error("压缩包不能包含符号链接或特殊文件");
    }
    resolveArchiveEntryPath(destination, entry.path);
  }

  if (kind === "tar") {
    await runSystemCommand("tar", ["--no-same-owner", "-xaf", archivePath, "-C", destination], {
      signal: options.signal,
      timeoutMs,
      maxStdoutBytes: 0,
    });
  } else if (kind === "zip") {
    try {
      await runSystemCommand("unzip", ["-q", "-o", "-d", destination, archivePath], {
        signal: options.signal,
        timeoutMs,
        maxStdoutBytes: 0,
      });
    } catch (error) {
      if (!isMissingCommand(error, "unzip")) throw error;
      await runSystemCommand(await requireSevenZip(options.signal, timeoutMs), ["x", "-y", "-bd", `-o${destination}`, archivePath], {
        signal: options.signal,
        timeoutMs,
        maxStdoutBytes: 0,
      });
    }
  } else {
    await runSystemCommand(await requireSevenZip(options.signal, timeoutMs), ["x", "-y", "-bd", `-o${destination}`, archivePath], {
      signal: options.signal,
      timeoutMs,
      maxStdoutBytes: 0,
    });
  }

  await assertExtractedTree(destination, destination, "");
}

export interface ExtractArchiveOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/**
 * 用系统 `tar` 将目录内容打包为 gzip 流（不含目录自身名称）。
 */
export function createTarGzStream(directoryPath: string): Readable {
  assertCommandPath(directoryPath, "directoryPath");
  const child = spawn("tar", ["--force-local", "-C", directoryPath, "-czf", "-", "."], {
    env: COMMAND_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stream = child.stdout;
  if (!stream) throw new Error("无法启动 tar");

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString("utf8")}`.slice(-STDERR_MAX_BYTES);
  });
  child.on("error", (error) => {
    stream.destroy(isErrnoCode(error, "ENOENT") ? new Error("打包需要系统命令 tar，但当前环境未安装") : error);
  });
  child.on("close", (code) => {
    if (code === 0 || stream.destroyed) return;
    stream.destroy(new Error(stderr.trim() || `tar 失败（退出码 ${code ?? "unknown"}）`));
  });
  stream.on("close", () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  });
  return stream;
}

async function sniffArchiveKind(filePath: string): Promise<ArchiveKind> {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, 8, 0);
    const magic = header.subarray(0, bytesRead);
    if (magic.length >= 4 && magic[0] === 0x50 && magic[1] === 0x4b && (magic[2] === 0x03 || magic[2] === 0x05 || magic[2] === 0x07)) {
      return "zip";
    }
    if (magic.length >= 6 && magic[0] === 0x37 && magic[1] === 0x7a && magic[2] === 0xbc && magic[3] === 0xaf && magic[4] === 0x27 && magic[5] === 0x1c) {
      return "sevenZ";
    }
    if (magic.length >= 7 && magic[0] === 0x52 && magic[1] === 0x61 && magic[2] === 0x72 && magic[3] === 0x21 && magic[4] === 0x1a && magic[5] === 0x07) {
      return "rar";
    }
    return "tar";
  } finally {
    await handle.close();
  }
}

type ListedEntry = { path: string; kind: "file" | "directory" | "other" };

async function listArchiveEntries(kind: ArchiveKind, archivePath: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<ListedEntry[]> {
  if (kind === "tar") {
    const stdout = await runSystemCommand("tar", ["-tf", archivePath], { signal, timeoutMs });
    return parseNameList(stdout);
  }
  if (kind === "zip") {
    try {
      const stdout = await runSystemCommand("unzip", ["-Z", "-1", archivePath], {
        signal,
        timeoutMs,
      });
      return parseNameList(stdout);
    } catch (error) {
      if (!isMissingCommand(error, "unzip")) throw error;
      return listSevenZipEntries(archivePath, signal, timeoutMs);
    }
  }
  return listSevenZipEntries(archivePath, signal, timeoutMs);
}

function parseNameList(stdout: string): ListedEntry[] {
  return stdout
    .split("\n")
    .map((line) => line.replace(/\/$/u, "").trim())
    .filter((line) => line.length > 0)
    .map((path) => ({ path, kind: "file" }));
}

async function listSevenZipEntries(archivePath: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<ListedEntry[]> {
  const stdout = await runSystemCommand(await requireSevenZip(signal, timeoutMs), ["l", "-slt", archivePath], { signal, timeoutMs });
  const entries: ListedEntry[] = [];
  const archiveName = basename(archivePath);
  for (const block of stdout.split("\n\n")) {
    const path = /^Path = (.*)$/m.exec(block)?.[1]?.trim().replaceAll("\\", "/");
    if (!path || path === archiveName) continue;
    const symlink = /^Symbolic Link = (.+)$/m.exec(block)?.[1]?.trim();
    const hardLink = /^Hard Link = (.+)$/m.exec(block)?.[1]?.trim();
    const folder = /^Folder = \+$/m.test(block);
    if ((symlink !== undefined && symlink.length > 0) || (hardLink !== undefined && hardLink.length > 0)) {
      entries.push({ path, kind: "other" });
      continue;
    }
    entries.push({ path, kind: folder ? "directory" : "file" });
  }
  return entries;
}

let sevenZipBin: string | undefined;

async function requireSevenZip(signal: AbortSignal | undefined, timeoutMs: number): Promise<string> {
  if (sevenZipBin) return sevenZipBin;
  for (const command of ["7z", "7za", "7zz"]) {
    try {
      await runSystemCommand(command, ["-h"], { signal, timeoutMs, maxStdoutBytes: 256 * 1024 });
      sevenZipBin = command;
      return command;
    } catch (error) {
      if (isMissingCommand(error, command)) continue;
      sevenZipBin = command;
      return command;
    }
  }
  throw new Error("解压 7z/rar 需要系统命令 7z");
}

function assertCommandPath(value: string, name: string) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${name} 必须是非空且不含 NUL 的路径`);
  }
}

function resolveTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return EXTRACT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs 必须是正整数");
  return timeoutMs;
}

function runSystemCommand(command: string, args: readonly string[], options: { signal?: AbortSignal; timeoutMs: number; maxStdoutBytes?: number }): Promise<string> {
  const maxStdoutBytes = options.maxStdoutBytes ?? STDOUT_LIST_MAX_BYTES;
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError(options.signal, command));
      return;
    }

    let child: ChildProcess;
    try {
      child = spawn(command, [...args], { env: COMMAND_ENV, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      reject(error);
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;

    const finish = (error: Error | undefined, stdout: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(stdout);
    };

    const killChild = (killSignal: NodeJS.Signals = "SIGTERM") => {
      if (child.exitCode === null && child.signalCode === null) child.kill(killSignal);
    };

    const onAbort = () => {
      killChild();
      finish(abortError(options.signal, command), "");
    };

    const timer = setTimeout(() => {
      killChild();
      const killer = setTimeout(() => killChild("SIGKILL"), COMMAND_KILL_GRACE_MS);
      killer.unref();
      finish(new Error(`${command} 超时`), "");
    }, options.timeoutMs);

    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (maxStdoutBytes === 0 || stdoutBytes > maxStdoutBytes) {
        if (maxStdoutBytes === 0) return;
        killChild();
        finish(new Error(`${command} 输出过大`), "");
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-STDERR_MAX_BYTES);
    });
    child.on("error", (error) => {
      finish(isErrnoCode(error, "ENOENT") ? new Error(`解压需要系统命令 ${command}，但当前环境未安装`) : error, "");
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code === 0) {
        finish(undefined, Buffer.concat(stdoutChunks).toString("utf8"));
        return;
      }
      finish(new Error(stderr.trim() || `${command} 失败（退出码 ${code ?? "unknown"}）`), "");
    });
  });
}

function abortError(signal: AbortSignal | undefined, command: string): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error(`${command} 已取消`);
}

function isMissingCommand(error: unknown, command: string): boolean {
  return error instanceof Error && error.message === `解压需要系统命令 ${command}，但当前环境未安装`;
}

async function assertExtractedTree(root: string, directory: string, relative: string) {
  const names = await readdir(directory, { withFileTypes: true });
  for (const dirent of names) {
    const entryRelative = relative.length === 0 ? dirent.name : `${relative}/${dirent.name}`;
    const fullPath = join(directory, dirent.name);
    const stat = await lstat(fullPath);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      throw new Error("压缩包不能包含符号链接或特殊文件");
    }
    resolveArchiveEntryPath(root, entryRelative);
    if (stat.isDirectory()) await assertExtractedTree(root, fullPath, entryRelative);
  }
}

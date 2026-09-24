import { execFile, execFileSync, type ChildProcess, type ExecFileOptionsWithStringEncoding } from "node:child_process";

/**
 * Node.js 进程相关工具：构造外部命令调用、解析进程环境、查询进程及终止进程树。
 */

/** 可由 Bash 执行的高级命令描述。 */
export interface ExecutableCommand {
  /** 原样拼接到命令后的参数列表。 */
  args: readonly string[];
  /** 可执行文件路径或 Shell 内建命令，例如 `source`、`.` 或 `node`。 */
  file: string;
  /** 是否通过 sudo 启动命令。 */
  privileged?: boolean;
}

/** 可直接传给 `child_process.spawn` 的底层调用描述。 */
export interface CommandInvocation {
  /** 传给底层程序的参数数组。 */
  args: string[];
  /** 是否需要从文件描述符 3 读取命令执行后的环境变量。 */
  captureEnvironment: boolean;
  /** 实际启动的程序，例如 `/bin/bash` 或 `sudo`。 */
  file: string;
}

/** 执行一个不经过 Shell 的系统命令；调用方可在这里接入 sudo、审计或测试替身。 */
export type ProcessCommandExecutor = (file: string, args: readonly string[]) => void;

export interface TerminateChildProcessTreeOptions {
  /**
   * 将 child.pid 视为进程组 ID，并向整个进程组发送信号。
   * 仅当 spawn 使用 detached: true 创建了独立进程组时才能启用。
   */
  processGroup?: boolean;
  /** 发送给进程的 Node.js 信号，默认使用可被进程清理处理的 SIGTERM。 */
  signal?: NodeJS.Signals;
  /**
   * 命令执行器。默认不提权地执行 pkill/kill；目标进程权限更高时，应由调用方注入提权执行器。
   * 执行器必须直接执行 file/args，禁止拼接后交给 Shell。
   */
  execute?: ProcessCommandExecutor;
}

export interface ProcessTreeTerminationResult {
  /** Node.js 直接启动的进程 PID；进程尚未启动时不存在。 */
  pid?: number;
  /** 是否成功向直接后代发送了信号；false 也可能表示后代已经退出。 */
  descendantsSignalled: boolean;
  /** 是否通过系统 kill 或 ChildProcess.kill 向根进程发送了信号。 */
  rootSignalled: boolean;
}

export interface ExecFileWithSudoOptions extends Omit<ExecFileOptionsWithStringEncoding, "encoding"> {
  /** 输出文本编码，默认使用 UTF-8。 */
  encoding?: BufferEncoding;
}

export interface ExecFileResult {
  stderr: string;
  stdout: string;
}

export interface ProcessLine {
  pid: string;
  command: string;
}

const defaultExecutor: ProcessCommandExecutor = (file, args) => {
  execFileSync(file, [...args], { stdio: "ignore" });
};

/**
 * 通过 `sudo -S` 执行任意外部程序，并以 stdin 传入密码。
 *
 * 可执行文件与参数始终分别传给 `execFile`，不会经过 Shell，也不会发生额外的字符串
 * 拼接或展开。`cwd`、`env`、`timeout`、`maxBuffer`、`signal` 等 execFile 选项可直接透传。
 */
export function execFileWithSudo(file: string, args: readonly string[], password: string, options: ExecFileWithSudoOptions = {}): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    const child = execFile("sudo", ["-S", "-p", "", "--", file, ...args], { ...options, encoding: options.encoding ?? "utf8" }, (error, stdout, stderr) =>
      error ? reject(error) : resolve({ stdout, stderr }),
    );

    child.stdin?.end(`${password}\n`);
  });
}

/** 判断命令是否是在当前 Bash 上下文中加载环境脚本的内建命令。 */
export function isEnvironmentSourceCommand(file: string): boolean {
  return file === "source" || file === ".";
}

/**
 * 将高级命令转换为可供 `child_process.spawn` 使用的调用配置。
 *
 * 普通命令通过 `stdbuf` 禁用标准输出和错误输出缓冲，以便调用方实时接收日志；
 * `source` 和 `.` 通过登录 Bash 执行，并在成功后将 NUL 分隔的完整环境写入 FD 3；
 * 提权命令则由 `sudo -S -p ''` 包装。调用方必须按约定为环境捕获配置额外管道。
 *
 * 参数代表已经构建完成的 Shell 表达式，因此会原样拼接，不在此进行转义或拆分。
 */
export function createCommandInvocation(command: ExecutableCommand): CommandInvocation {
  const capturesEnvironment = isEnvironmentSourceCommand(command.file);

  if (capturesEnvironment && command.privileged) {
    throw new Error("source/. 环境步骤不支持 sudo，请在环境脚本内部处理所需权限");
  }

  // 将可执行文件作为单个 POSIX Shell 词，避免路径中的单引号破坏命令结构。
  const executable = `'${command.file.replaceAll("'", `'\\''`)}'`;
  const executableCommand = capturesEnvironment ? executable : `stdbuf -o0 -e0 ${executable}`;
  const shellCommand = command.args.length > 0 ? `${executableCommand} ${command.args.join(" ")}` : executableCommand;

  // 仅在环境脚本成功时输出环境，避免把执行失败时的中间状态传给后续命令。
  const script = capturesEnvironment ? `${shellCommand}\nstatus=$?\nif [ "$status" -eq 0 ]; then env -0 >&3; fi\nexit "$status"` : shellCommand;
  const args = ["-lc", script];

  if (!command.privileged) {
    return { file: "/bin/bash", args, captureEnvironment: capturesEnvironment };
  }

  return {
    file: "sudo",
    args: ["-S", "-p", "", "/bin/bash", ...args],
    captureEnvironment: capturesEnvironment,
  };
}

/**
 * 解析 `env -0` 产生的 NUL 分隔环境数据。
 *
 * 每个条目只在第一个等号处分割，因此变量值可安全包含换行、空格和等号。
 */
export function parseNullDelimitedEnvironment(output: Buffer): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const entry of output.toString("utf8").split("\0")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) continue;
    environment[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return environment;
}

/** 解析 `pgrep -a` / `pgrep -af` 输出：每行 `PID` 或 `PID COMMAND`。 */
export function parseProcessLines(stdout: string): ProcessLine[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const space = line.indexOf(" ");
      if (space <= 0) return { pid: line, command: "" };
      return { pid: line.slice(0, space), command: line.slice(space + 1) };
    });
}

/**
 * 终止 Node.js 启动的 POSIX 进程树或独立进程组。
 *
 * processGroup 为 true 时向负 PGID 发信号，可覆盖任意深度的后代；否则保留旧行为，
 * 先处理根进程的直接后代再处理根进程。`pkill -P` 不会递归，因此包含 Bash、sudo、
 * 构建脚本、cmake/make 等多层包装的任务应使用独立进程组模式。
 *
 * 该方法是幂等的尽力终止操作，不把“进程已经退出”视为异常。
 */
export function terminateChildProcessTree(child: Pick<ChildProcess, "pid" | "kill">, options: TerminateChildProcessTreeOptions = {}): ProcessTreeTerminationResult {
  const pid = child.pid;
  if (pid === undefined) return { descendantsSignalled: false, rootSignalled: false };
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new TypeError(`无效的子进程 PID：${pid}`);

  const signal = options.signal ?? "SIGTERM";
  if (!/^SIG[A-Z0-9]+$/.test(signal)) throw new TypeError(`无效的进程信号：${signal}`);
  const posixSignal = signal.slice(3);
  const execute = options.execute ?? defaultExecutor;
  let descendantsSignalled = false;
  let rootSignalled = false;

  if (options.processGroup) {
    try {
      // kill 的负目标表示进程组；-- 防止它被解析成命令行选项。
      execute("kill", [`-${posixSignal}`, "--", `-${pid}`]);
      return { pid, descendantsSignalled: true, rootSignalled: true };
    } catch {
      // 进程组可能已经退出；继续尝试根进程，保持尽力终止和幂等语义。
      try {
        rootSignalled = child.kill(signal);
      } catch {
        // 根进程也已退出。
      }
      return { pid, descendantsSignalled, rootSignalled };
    }
  }

  try {
    execute("pkill", [`-${posixSignal}`, "-P", String(pid)]);
    descendantsSignalled = true;
  } catch {
    // 没有直接后代、后代已退出或当前用户无权发送信号；仍继续处理根进程。
  }

  try {
    execute("kill", [`-${posixSignal}`, String(pid)]);
    rootSignalled = true;
  } catch {
    // 系统命令不可用或权限不足时，尝试 Node.js 对直接子进程的原生终止能力。
    try {
      rootSignalled = child.kill(signal);
    } catch {
      // 进程已退出等竞态属于幂等成功场景，不再向上抛出。
    }
  }

  return { pid, descendantsSignalled, rootSignalled };
}

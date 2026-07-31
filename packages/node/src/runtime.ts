interface NodeProcess {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: string;
  cwd(): string;
}

function getProcess(): NodeProcess {
  // Keep this package free of browser globals and avoid hiding an invalid runtime.
  const processValue = (globalThis as { process?: NodeProcess }).process;

  if (!processValue) {
    throw new Error("@utils/node can only be used in a Node.js runtime");
  }

  return processValue;
}

export function isNodeRuntime(): boolean {
  return Boolean((globalThis as { process?: NodeProcess }).process);
}

export function getEnv(name: string): string | undefined {
  return getProcess().env[name];
}

export function requireEnv(name: string): string {
  const value = getEnv(name);

  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getRuntimeInfo(): { cwd: string; platform: string } {
  const processValue = getProcess();
  return { cwd: processValue.cwd(), platform: processValue.platform };
}

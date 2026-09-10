import "dotenv/config";

const hasEnvValue = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

const requiredEnvError = (key: string, expectedType?: string): Error =>
  new Error(`缺少或无效的 ${key} 环境变量${expectedType ? `，期望类型为 ${expectedType}` : ""}`);

/**
 * 获取字符串环境变量
 * @param key 环境变量名称
 * @param defaultValue 默认值（可选）
 */
// 重载 1：传了默认值，就一定返回字符串
export function getEnvStr(key: string, defaultValue: string): string;
export function getEnvStr(key: string): string | undefined;
export function getEnvStr(key: string, defaultValue?: string): string | undefined {
  const val = process.env[key];
  return hasEnvValue(val) ? val : defaultValue;
}

/**
 * 获取必填字符串环境变量
 * @throws 环境变量缺失或仅包含空白字符时抛出异常
 */
export function getRequiredEnvStr(key: string): string {
  const value = getEnvStr(key);

  if (value === undefined) {
    throw requiredEnvError(key, "非空字符串");
  }

  return value;
}

/**
 * 获取数字环境变量
 * @param key 环境变量名称
 * @param defaultValue 默认值（可选）
 */
export function getEnvNum(key: string, defaultValue: number): number;
export function getEnvNum(key: string): number | undefined;
export function getEnvNum(key: string, defaultValue?: number): number | undefined {
  const val = process.env[key];
  if (!hasEnvValue(val)) {
    return defaultValue;
  }

  const num = Number(val);
  return Number.isFinite(num) ? num : defaultValue;
}

/**
 * 获取必填有限数字环境变量
 * @throws 环境变量缺失或不是有限数字时抛出异常
 */
export function getRequiredEnvNum(key: string): number {
  const value = getEnvNum(key);

  if (value === undefined) {
    throw requiredEnvError(key, "有限数字");
  }

  return value;
}

/**
 * 获取布尔环境变量
 * @param key 环境变量名称
 * @param defaultValue 默认值（可选）
 */
export function getEnvBool(key: string, defaultValue: boolean): boolean;
export function getEnvBool(key: string): boolean | undefined;
export function getEnvBool(key: string, defaultValue?: boolean): boolean | undefined {
  const val = process.env[key];
  if (!hasEnvValue(val)) {
    return defaultValue;
  }

  const cleanVal = val.trim().toLowerCase();

  if (cleanVal === "true" || cleanVal === "1" || cleanVal === "yes") {
    return true;
  }

  if (cleanVal === "false" || cleanVal === "0" || cleanVal === "no") {
    return false;
  }

  return defaultValue;
}

/**
 * 获取必填布尔环境变量
 * @throws 环境变量缺失或不是支持的布尔值时抛出异常
 */
export function getRequiredEnvBool(key: string): boolean {
  const value = getEnvBool(key);

  if (value === undefined) {
    throw requiredEnvError(key, "true、false、1、0、yes 或 no");
  }

  return value;
}

/**
 * 获取数组环境变量（默认以逗号分隔）
 * @param key 环境变量名称
 * @param defaultValue 默认值（可选）
 * @param separator 分隔符，默认为逗号
 */
export function getEnvArray(key: string, defaultValue: string[], separator?: string): string[];
export function getEnvArray(
  key: string,
  defaultValue?: undefined,
  separator?: string,
): string[] | undefined;
export function getEnvArray(
  key: string,
  defaultValue?: string[],
  separator = ",",
): string[] | undefined {
  const val = process.env[key];
  if (!hasEnvValue(val)) {
    return defaultValue;
  }

  return val.split(separator).map((item) => item.trim());
}

/**
 * 获取必填数组环境变量
 * @throws 环境变量缺失或仅包含空白字符时抛出异常
 */
export function getRequiredEnvArray(key: string, separator = ","): string[] {
  const value = getEnvArray(key, undefined, separator);

  if (value === undefined) {
    throw requiredEnvError(key, "分隔字符串");
  }

  return value;
}

/**
 * 获取字面量联合类型环境变量
 * @param key 环境变量名称
 * @param allowedValues 允许的值组成的数组
 * @param defaultValue 默认值（可选）
 * @example const nodeEnv = getEnvUnion('NODE_ENV', ['development', 'production', 'test'] as const, 'development');
 */
export function getEnvUnion<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue: T,
): T;
export function getEnvUnion<T extends string>(
  key: string,
  allowedValues: readonly T[],
): T | undefined;
export function getEnvUnion<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue?: T,
): T | undefined {
  const val = process.env[key] as T | undefined;
  if (!hasEnvValue(val) || !allowedValues.includes(val)) {
    return defaultValue;
  }
  return val;
}

/**
 * 获取必填字面量联合类型环境变量
 * @throws 环境变量缺失或不在允许值列表中时抛出异常
 */
export function getRequiredEnvUnion<T extends string>(key: string, allowedValues: readonly T[]): T {
  const value = getEnvUnion(key, allowedValues);

  if (value === undefined) {
    throw requiredEnvError(key, allowedValues.join(" | "));
  }

  return value;
}

/**
 * 获取 JSON 对象环境变量（内置 try-catch 安全解析）
 * @param key 环境变量名称
 * @param defaultValue 默认值（可选）
 */
export function getEnvJson<T>(key: string, defaultValue: T): T;
export function getEnvJson<T = unknown>(key: string): T | undefined;
export function getEnvJson<T = unknown>(key: string, defaultValue?: T): T | undefined {
  const val = process.env[key];
  if (!hasEnvValue(val)) {
    return defaultValue;
  }

  try {
    return JSON.parse(val) as T;
  } catch (error: unknown) {
    // 如果 JSON 格式非法，打印警告并返回默认值
    console.warn(`[EnvError] Failed to parse JSON for env key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * 获取必填 JSON 环境变量
 * @throws 环境变量缺失或 JSON 无法解析时抛出异常
 */
export function getRequiredEnvJson<T = unknown>(key: string): T {
  const value = getEnvJson<T>(key);

  if (value === undefined) {
    throw requiredEnvError(key, "有效 JSON");
  }

  return value;
}

/**
 * 获取严格的安全整数环境变量
 * @param key 环境变量名称
 * @param defaultValue 默认值（可选）
 * @param radix 进制，默认 10 进制
 */
export function getEnvInt(key: string, defaultValue: number, radix?: number): number;
export function getEnvInt(
  key: string,
  defaultValue?: undefined,
  radix?: number,
): number | undefined;
export function getEnvInt(key: string, defaultValue?: number, radix = 10): number | undefined {
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) {
    throw new RangeError("radix 必须是 2 到 36 之间的整数");
  }

  const val = process.env[key];
  if (!hasEnvValue(val)) {
    return defaultValue;
  }

  const normalizedValue = val.trim();
  const unsignedValue = /^[+-]/.test(normalizedValue) ? normalizedValue.slice(1) : normalizedValue;
  const hasOnlyValidDigits =
    unsignedValue.length > 0 &&
    [...unsignedValue.toLowerCase()].every((character) => {
      const digit = Number.parseInt(character, 36);
      return Number.isInteger(digit) && digit < radix;
    });

  if (!hasOnlyValidDigits) {
    return defaultValue;
  }

  const parsed = Number.parseInt(normalizedValue, radix);
  return Number.isSafeInteger(parsed) ? parsed : defaultValue;
}

/**
 * 获取必填安全整数环境变量
 * @throws 环境变量缺失或不是指定进制的安全整数时抛出异常
 */
export function getRequiredEnvInt(key: string, radix = 10): number {
  const value = getEnvInt(key, undefined, radix);

  if (value === undefined) {
    throw requiredEnvError(key, `${radix} 进制安全整数`);
  }

  return value;
}

export const environment = getEnvUnion(
  "NODE_ENV",
  ["development", "production", "test"],
  "development",
);
export const isDevelopment = environment === "development";
export const isProduction = environment === "production";
export const isTest = environment === "test";

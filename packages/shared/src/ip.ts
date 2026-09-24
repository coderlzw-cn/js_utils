/**
 * 规范化后 IP 文本允许的最大长度。
 *
 * 标准 IPv6 文本最长约 45 个字符。带 Zone ID 的原始输入可以更长，
 * 但去掉 Zone ID 之后仍超过该长度则视为非法，避免把超长字符串写入数据库或日志字段。
 */
export const IP_MAX_LENGTH = 45;

/**
 * IPv4 映射 IPv6：
 *
 * ::ffff:192.168.1.1
 */
const IPV4_MAPPED_PREFIX = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * IPv4 最大值
 */
const IPV4_MAX = 0xffffffff;

/**
 * 判断字符串是否为点分十进制 IPv4。
 *
 * 不接受前导零（`01`），也不去除首尾空白。空白和大小写请先用 {@link normalizeIp}。
 *
 * @param ip - 待判断的字符串。`null`、`undefined` 和空字符串返回 `false`。
 * @returns 四个十进制段都在 0 到 255 之间时返回 `true`。
 */
export function isIPv4(ip?: string | null): boolean {
  if (!ip) return false;

  const parts = ip.split(".");

  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }

    // 避免 01、001 这种非标准形式
    if (part.length > 1 && part.startsWith("0")) {
      return false;
    }

    const value = Number(part);

    return value >= 0 && value <= 255;
  });
}

/**
 * 将 IPv4 转成两个 IPv6 组。
 *
 * 192.168.1.1
 *
 * =>
 *
 * c0a8:0101
 */
function ipv4ToIpv6Groups(ip: string): [string, string] | undefined {
  if (!isIPv4(ip)) {
    return undefined;
  }

  const [first, second, third, fourth] = ip.split(".").map(Number);

  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return undefined;
  }

  return [((first << 8) | second).toString(16), ((third << 8) | fourth).toString(16)];
}

/**
 * 将 IPv6 展开成 8 组、无前导零的小写文本。
 *
 * 会去掉 Zone ID，并把末尾的 IPv4 点分形式换成两组十六进制。不依赖 Node.js。
 * `::` 只能出现一次。结果每组都不补齐到 4 位。
 *
 * @param ip - IPv6 文本。
 * @returns 展开后的地址。格式非法时返回 `undefined`。
 *
 * @example
 * expandIpv6("2001:db8::1");
 * // "2001:db8:0:0:0:0:0:1"
 *
 * @example
 * expandIpv6("::ffff:192.168.1.1");
 * // "0:0:0:0:0:ffff:c0a8:101"
 */
export function expandIpv6(ip: string): string | undefined {
  let value = ip.trim().toLowerCase();

  // 去除 Zone ID
  const zoneIndex = value.indexOf("%");

  if (zoneIndex !== -1) {
    value = value.slice(0, zoneIndex);
  }

  /*
   * IPv6 中可能包含 IPv4：
   *
   * ::ffff:192.168.1.1
   */
  const lastColonIndex = value.lastIndexOf(":");

  if (lastColonIndex !== -1) {
    const lastPart = value.slice(lastColonIndex + 1);

    if (lastPart.includes(".")) {
      const ipv4Groups = ipv4ToIpv6Groups(lastPart);

      if (!ipv4Groups) {
        return undefined;
      }

      value = `${value.slice(0, lastColonIndex)}:${ipv4Groups[0]}:${ipv4Groups[1]}`;
    }
  }

  /*
   * IPv6 最多只能出现一次 ::
   */
  if ((value.match(/::/g) ?? []).length > 1) {
    return undefined;
  }

  let groups: string[];

  if (value.includes("::")) {
    const [head = "", tail = ""] = value.split("::");

    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail ? tail.split(":") : [];

    /*
     * "::" 至少代表一个 0 组
     */
    const missing = 8 - headGroups.length - tailGroups.length;

    if (missing < 1) {
      return undefined;
    }

    groups = [...headGroups, ...Array<string>(missing).fill("0"), ...tailGroups];
  } else {
    groups = value.split(":");

    if (groups.length !== 8) {
      return undefined;
    }
  }

  if (groups.length !== 8) {
    return undefined;
  }

  /*
   * 每组必须为 1~4 位十六进制
   */
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
    return undefined;
  }

  /*
   * 去除每组前导 0
   */
  return groups.map((group) => parseInt(group, 16).toString(16)).join(":");
}

/**
 * 判断字符串是否为可展开的 IPv6。
 *
 * 允许 Zone ID 和末尾嵌入的 IPv4。不把纯 IPv4 当成 IPv6。
 *
 * @param ip - 待判断的字符串。`null`、`undefined` 和空字符串返回 `false`。
 * @returns {@link expandIpv6} 成功时返回 `true`。
 */
export function isIPv6(ip?: string | null): boolean {
  if (!ip) return false;

  return expandIpv6(ip) !== undefined;
}

/**
 * 判断 IP 版本。
 *
 * 返回值与 Node.js `net.isIP` 相同。不做 {@link normalizeIp} 的空白、映射地址转换。
 * 因此 `::ffff:192.168.1.1` 返回 `6`，而不是 `4`。
 *
 * @param ip - 待判断的字符串。
 * @returns `4` 表示 IPv4，`6` 表示 IPv6，`0` 表示非法或空值。
 */
export function isIP(ip?: string | null): 0 | 4 | 6 {
  if (!ip) {
    return 0;
  }

  if (isIPv4(ip)) {
    return 4;
  }

  if (isIPv6(ip)) {
    return 6;
  }

  return 0;
}

/**
 * 规范化并校验 IP 地址。
 *
 * - 去除首尾空白并转为小写；
 * - 去掉 IPv6 Zone ID（`fe80::1%eth0` → `fe80::1`）；
 * - 仅把 `::ffff:` 后紧跟点分 IPv4 的映射地址转成 IPv4；
 * - 去掉 Zone ID 后长度仍超过 {@link IP_MAX_LENGTH} 则拒绝。
 *
 * 不会把超长字符串截断后再校验，避免截断结果碰巧成为合法 IP。
 *
 * @param ip - 原始 IP 文本。
 * @returns 规范化后的 IP。空值或非法时返回 `undefined`。
 */
export function normalizeIp(ip?: string | null): string | undefined {
  if (!ip) {
    return undefined;
  }

  let normalized = ip.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  /*
   * 防止超长恶意输入。
   *
   * 注意：
   * 不应该直接 slice 后再校验，
   * 因为可能把一个非法长字符串截断成合法 IP。
   */
  if (normalized.length > IP_MAX_LENGTH + 64) {
    return undefined;
  }

  /*
   * IPv6 Zone ID
   *
   * fe80::1%eth0
   */
  const zoneIndex = normalized.indexOf("%");

  if (zoneIndex !== -1) {
    normalized = normalized.slice(0, zoneIndex);
  }

  /*
   * IPv4-Mapped IPv6
   *
   * ::ffff:192.168.1.1
   *
   * =>
   *
   * 192.168.1.1
   */
  const mappedAddress = IPV4_MAPPED_PREFIX.exec(normalized)?.[1];

  if (mappedAddress !== undefined) {
    normalized = mappedAddress;
  }

  if (normalized.length > IP_MAX_LENGTH) {
    return undefined;
  }

  return isIP(normalized) ? normalized : undefined;
}

/**
 * 判断原始文本能否规范化为合法 IP。
 *
 * 与 {@link isIP} 不同，这里会先走 {@link normalizeIp}，因此接受首尾空白、Zone ID 和 `::ffff:` 映射地址。
 *
 * @param ip - 原始 IP 文本。
 * @returns 规范化成功时返回 `true`。
 */
export function isValidIp(ip?: string | null): boolean {
  return normalizeIp(ip) !== undefined;
}

/**
 * 获取规范化之后的 IP 版本。
 *
 * `::ffff:192.168.1.1` 会先被转成 IPv4，因此返回 `4`。
 *
 * @param ip - 原始 IP 文本。
 * @returns `4` 表示 IPv4，`6` 表示 IPv6，`0` 表示非法或空值。
 */
export function getIpVersion(ip?: string | null): 0 | 4 | 6 {
  const normalized = normalizeIp(ip);

  if (!normalized) {
    return 0;
  }

  return isIP(normalized);
}

/**
 * 解析 `X-Forwarded-For`，并丢弃无法规范化的项。
 *
 * 顺序保持为 client、proxy1、proxy2。数组会被逗号拼起来再拆分。
 *
 * @param ips - 请求头原值。可以是逗号分隔字符串，或框架给出的字符串数组。
 * @returns 规范化后的 IP 列表。空值时返回空数组。
 */
export function parseForwardedFor(ips?: string | readonly string[] | null): string[] {
  if (!ips) {
    return [];
  }

  const raw = typeof ips === "string" ? ips : ips.join(",");

  return raw
    .split(",")
    .map((item) => normalizeIp(item))
    .filter((item): item is string => item !== undefined);
}

/**
 * 从 HTTP 请求头和 Socket 地址中提取客户端 IP。
 *
 * 优先级：
 * 1. `x-forwarded-for` 的第一项
 * 2. `x-real-ip`
 * 3. `remoteAddress`
 *
 * 请求头名按小写匹配。某一项非法时继续看下一级。
 *
 * @param headers - 小写请求头。值可以是字符串或字符串数组。
 * @param remoteAddress - 连接对端地址，通常来自 Socket。
 * @returns 第一个能规范化的 IP。都没有时返回 `undefined`。
 */
export function extractClientIp(headers: Readonly<Record<string, string | readonly string[] | undefined>>, remoteAddress?: string | null): string | undefined {
  const forwarded = parseForwardedFor(headers["x-forwarded-for"]);

  if (forwarded.length > 0) {
    return forwarded[0];
  }

  const realIp = headers["x-real-ip"];

  const normalizedRealIp = normalizeIp(Array.isArray(realIp) ? realIp[0] : realIp);

  if (normalizedRealIp) {
    return normalizedRealIp;
  }

  return normalizeIp(remoteAddress);
}

/**
 * 判断是否为回环地址。
 *
 * IPv4 为 `127.0.0.0/8`，IPv6 为 `::1`。先做 {@link normalizeIp}。
 *
 * @param ip - 原始 IP 文本。
 * @returns 属于回环地址时返回 `true`。非法 IP 返回 `false`。
 */
export function isLoopbackIp(ip?: string | null): boolean {
  const normalized = normalizeIp(ip);

  if (!normalized) {
    return false;
  }

  if (normalized === "::1") {
    return true;
  }

  return isIPv4(normalized) && normalized.startsWith("127.");
}

/**
 * 将 IP 脱敏到网络前缀，供日志使用。
 *
 * IPv4 保留前三段，末段改为 `0`。IPv6 保留前四组，其余收成 `::`。
 *
 * @param ip - 原始 IP 文本。
 * @returns 脱敏后的地址。非法 IP 返回 `undefined`。
 *
 * @example
 * anonymizeIp("203.0.113.7");
 * // "203.0.113.0"
 *
 * @example
 * anonymizeIp("2001:db8:a:b:c:d:e:f");
 * // "2001:db8:a:b::"
 */
export function anonymizeIp(ip?: string | null): string | undefined {
  const normalized = normalizeIp(ip);

  if (!normalized) {
    return undefined;
  }

  if (isIPv4(normalized)) {
    return `${normalized.split(".").slice(0, 3).join(".")}.0`;
  }

  const expanded = expandIpv6(normalized);

  if (!expanded) {
    return undefined;
  }

  return `${expanded.split(":").slice(0, 4).join(":")}::`;
}

/**
 * 将 IPv4 转为 32 位无符号整数。
 *
 * 先做 {@link normalizeIp}。IPv6 返回 `undefined`。
 *
 * @param ip - 原始 IP 文本。
 * @returns `0` 到 `0xffffffff` 的整数。不是 IPv4 时返回 `undefined`。
 */
export function ipv4ToLong(ip?: string | null): number | undefined {
  const normalized = normalizeIp(ip);

  if (!normalized || !isIPv4(normalized)) {
    return undefined;
  }

  return normalized.split(".").reduce((result, octet) => result * 256 + Number(octet), 0);
}

/**
 * 将 32 位无符号整数转回点分 IPv4。
 *
 * @param value - `0` 到 `0xffffffff` 的整数。
 * @returns 点分十进制地址。超出范围或不是整数时返回 `undefined`。
 */
export function longToIpv4(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > IPV4_MAX) {
    return undefined;
  }

  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
}

/**
 * 将 IPv6 转为 128 位整数。
 *
 * 可用于 CIDR、地址区间和排序。会展开压缩写法，但不走 {@link normalizeIp}，因此不会把映射地址改成 IPv4。
 *
 * @param ip - IPv6 文本。
 * @returns 对应的 `bigint`。空值或非法 IPv6 返回 `undefined`。
 */
export function ipv6ToBigInt(ip?: string | null): bigint | undefined {
  if (!ip) {
    return undefined;
  }

  const expanded = expandIpv6(ip);

  if (!expanded) {
    return undefined;
  }

  const hex = expanded
    .split(":")
    .map((group) => group.padStart(4, "0"))
    .join("");

  return BigInt(`0x${hex}`);
}

/**
 * IP -> bigint。
 *
 * IPv4 / IPv6 均支持。
 */
function ipToBigInt(ip: string): bigint | undefined {
  if (isIPv4(ip)) {
    const value = ipv4ToLong(ip);

    return value === undefined ? undefined : BigInt(value);
  }

  if (isIPv6(ip)) {
    return ipv6ToBigInt(ip);
  }

  return undefined;
}

/**
 * 判断 IP 是否属于某个 CIDR。
 */
function matchCidr(ip: string, network: string, prefix: number): boolean {
  const ipVersion = isIP(ip);
  const networkVersion = isIP(network);

  if (!ipVersion || ipVersion !== networkVersion) {
    return false;
  }

  const bits = ipVersion === 4 ? 32 : 128;

  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) {
    return false;
  }

  const ipValue = ipToBigInt(ip);
  const networkValue = ipToBigInt(network);

  if (ipValue === undefined || networkValue === undefined) {
    return false;
  }

  /*
   * /0 表示所有地址
   */
  if (prefix === 0) {
    return true;
  }

  const shift = BigInt(bits - prefix);

  return ipValue >> shift === networkValue >> shift;
}

/**
 * 判断 IP 是否处于指定范围。
 */
function matchRange(ip: string, start: string, end: string): boolean {
  const version = isIP(ip);

  if (!version || version !== isIP(start) || version !== isIP(end)) {
    return false;
  }

  const value = ipToBigInt(ip);
  const startValue = ipToBigInt(start);
  const endValue = ipToBigInt(end);

  if (value === undefined || startValue === undefined || endValue === undefined) {
    return false;
  }

  if (startValue > endValue) {
    return false;
  }

  return value >= startValue && value <= endValue;
}

/**
 * 内网 / 保留地址段。
 */
const PRIVATE_RANGES = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],

  // IPv4 Link Local
  ["169.254.0.0", 16],

  // CGNAT
  ["100.64.0.0", 10],

  // IPv6 ULA
  ["fc00::", 7],

  // IPv6 Link Local
  ["fe80::", 10],
] as const;

/**
 * 判断是否为内网或保留地址。
 *
 * 包含 RFC1918、CGNAT（`100.64.0.0/10`）、IPv4 链路本地、IPv6 ULA（`fc00::/7`）和 IPv6 链路本地。
 * 不包含回环地址，回环请用 {@link isLoopbackIp}。
 *
 * @param ip - 原始 IP 文本。
 * @returns 落在上述地址段时返回 `true`。非法 IP 返回 `false`。
 */
export function isPrivateIp(ip?: string | null): boolean {
  const normalized = normalizeIp(ip);

  if (!normalized) {
    return false;
  }

  return PRIVATE_RANGES.some(([network, prefix]) => matchCidr(normalized, network, prefix));
}

/**
 * 判断是否为公网地址。
 *
 * 合法、且既不是回环也不是 {@link isPrivateIp} 所覆盖的地址段时返回 `true`。
 *
 * @param ip - 原始 IP 文本。
 * @returns 可作为公网地址时返回 `true`。非法 IP 返回 `false`。
 */
export function isPublicIp(ip?: string | null): boolean {
  const normalized = normalizeIp(ip);

  if (!normalized) {
    return false;
  }

  return !isLoopbackIp(normalized) && !isPrivateIp(normalized);
}

type IpRule =
  | {
      readonly type: "address";
      readonly address: string;
    }
  | {
      readonly type: "cidr";
      readonly network: string;
      readonly prefix: number;
    }
  | {
      readonly type: "range";
      readonly start: string;
      readonly end: string;
    };

/**
 * 解析 IP 匹配规则。
 */
function parseIpRule(rule: string): IpRule | undefined {
  const trimmed = rule.trim();

  if (!trimmed) {
    return undefined;
  }

  /*
   * CIDR
   */
  if (trimmed.includes("/")) {
    const [networkRaw, prefixRaw, ...rest] = trimmed.split("/");

    if (rest.length) {
      return undefined;
    }

    const network = normalizeIp(networkRaw);

    const prefix = Number(prefixRaw);

    if (!network) {
      return undefined;
    }

    const maxPrefix = isIPv4(network) ? 32 : 128;

    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      return undefined;
    }

    return {
      type: "cidr",
      network,
      prefix,
    };
  }

  /*
   * IP Range
   */
  if (trimmed.includes("-")) {
    const parts = trimmed.split("-");

    if (parts.length !== 2) {
      return undefined;
    }

    const start = normalizeIp(parts[0]);
    const end = normalizeIp(parts[1]);

    if (!start || !end) {
      return undefined;
    }

    if (isIP(start) !== isIP(end)) {
      return undefined;
    }

    const startValue = ipToBigInt(start);
    const endValue = ipToBigInt(end);

    if (startValue === undefined || endValue === undefined || startValue > endValue) {
      return undefined;
    }

    return {
      type: "range",
      start,
      end,
    };
  }

  /*
   * 单 IP
   */
  const address = normalizeIp(trimmed);

  if (!address) {
    return undefined;
  }

  return {
    type: "address",
    address,
  };
}

/**
 * 创建 IP 匹配器。
 *
 * 规则在创建时解析，之后每次调用只做匹配。无法解析的规则会被跳过。
 * 全部规则都非法时，返回的函数恒为 `false`。
 *
 * 支持：
 * - 单 IP：`192.168.1.100`
 * - CIDR：`10.0.0.0/8`、`2001:db8::/32`
 * - 闭区间：`192.168.1.1-192.168.1.50`
 *
 * IPv4 与 IPv6 不互相匹配。区间起点大于终点时该条规则无效。
 *
 * @param rules - 匹配规则列表。
 * @returns 判断一个 IP 是否命中任一规则的函数。入参会先规范化。
 */
export function createIpMatcher(rules: readonly string[]): (ip?: string | null) => boolean {
  /*
   * 创建 matcher 时预解析，
   * 避免每次请求重新解析规则。
   */
  const parsedRules = rules.map(parseIpRule).filter((rule): rule is IpRule => rule !== undefined);

  if (!parsedRules.length) {
    return () => false;
  }

  return (ip?: string | null): boolean => {
    const normalized = normalizeIp(ip);

    if (!normalized) {
      return false;
    }

    return parsedRules.some((rule) => {
      switch (rule.type) {
        case "address":
          return normalized === rule.address;

        case "cidr":
          return matchCidr(normalized, rule.network, rule.prefix);

        case "range":
          return matchRange(normalized, rule.start, rule.end);

        default:
          return false;
      }
    });
  };
}

/**
 * 判断 IP 是否命中一条规则。
 *
 * 规则写法与 {@link createIpMatcher} 相同，可以是单 IP、CIDR 或闭区间。
 *
 * @param ip - 待判断的 IP。
 * @param cidr - 一条匹配规则。空值返回 `false`。
 * @returns 命中时返回 `true`。
 *
 * @example
 * isIpInCidr("192.168.1.10", "192.168.1.0/24");
 * // true
 */
export function isIpInCidr(ip?: string | null, cidr?: string | null): boolean {
  if (!cidr) {
    return false;
  }

  return createIpMatcher([cidr])(ip);
}

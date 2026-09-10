/**
 * 数据库/日志中 IP 字段的最大长度。
 *
 * 标准 IPv6 文本最大约 45 字符，
 * 例如 IPv4 Embedded IPv6 + Zone ID 等场景。
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
 * 判断 IPv4 是否合法。
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

  const parts = ip.split(".").map(Number);

  return [((parts[0] << 8) | parts[1]).toString(16), ((parts[2] << 8) | parts[3]).toString(16)];
}

/**
 * 将 IPv6 展开成完整 8 组。
 *
 * 不依赖 Node.js。
 *
 * @example
 *
 * expandIpv6('2001:db8::1')
 *
 * =>
 *
 * '2001:db8:0:0:0:0:0:1'
 *
 * @example
 *
 * expandIpv6('::ffff:192.168.1.1')
 *
 * =>
 *
 * '0:0:0:0:0:ffff:c0a8:101'
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
 * 判断 IPv6 是否合法。
 */
export function isIPv6(ip?: string | null): boolean {
  if (!ip) return false;

  return expandIpv6(ip) !== undefined;
}

/**
 * 判断是否为 IPv4 / IPv6。
 *
 * 等价于 Node.js：
 *
 * net.isIP(ip)
 *
 * @returns
 *
 * 0 非法
 * 4 IPv4
 * 6 IPv6
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
 * - 去除首尾空白；
 * - 转换为小写；
 * - 去除 IPv6 Zone ID；
 * - IPv4-Mapped IPv6 转换为 IPv4；
 * - 校验 IP 合法性。
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
  const mapped = IPV4_MAPPED_PREFIX.exec(normalized);

  if (mapped) {
    normalized = mapped[1];
  }

  if (normalized.length > IP_MAX_LENGTH) {
    return undefined;
  }

  return isIP(normalized) ? normalized : undefined;
}

/**
 * 判断是否为合法 IP。
 */
export function isValidIp(ip?: string | null): boolean {
  return normalizeIp(ip) !== undefined;
}

/**
 * 获取 IP 版本。
 *
 * @returns
 *
 * 4 IPv4
 * 6 IPv6
 * 0 非法 IP
 */
export function getIpVersion(ip?: string | null): 0 | 4 | 6 {
  const normalized = normalizeIp(ip);

  if (!normalized) {
    return 0;
  }

  return isIP(normalized);
}

/**
 * 解析 X-Forwarded-For。
 *
 * 顺序：
 *
 * client -> proxy1 -> proxy2
 */
export function parseForwardedFor(ips?: string | string[] | null): string[] {
  if (!ips) {
    return [];
  }

  const raw = Array.isArray(ips) ? ips.join(",") : ips;

  return raw
    .split(",")
    .map((item) => normalizeIp(item))
    .filter((item): item is string => item !== undefined);
}

/**
 * 从 HTTP 请求头和 Socket 地址中提取 IP。
 *
 * 优先级：
 *
 * 1. x-forwarded-for
 * 2. x-real-ip
 * 3. remoteAddress
 */
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string | null,
): string | undefined {
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
 * IPv4:
 *
 * 127.0.0.0/8
 *
 * IPv6:
 *
 * ::1
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
 * IP 脱敏。
 *
 * IPv4：
 *
 * 203.0.113.7
 *
 * =>
 *
 * 203.0.113.0
 *
 * IPv6：
 *
 * 2001:db8:a:b:c:d:e:f
 *
 * =>
 *
 * 2001:db8:a:b::
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
 * IPv4 -> 32 位无符号整数。
 */
export function ipv4ToLong(ip?: string | null): number | undefined {
  const normalized = normalizeIp(ip);

  if (!normalized || !isIPv4(normalized)) {
    return undefined;
  }

  return normalized.split(".").reduce((result, octet) => result * 256 + Number(octet), 0);
}

/**
 * 32 位无符号整数 -> IPv4。
 */
export function longToIpv4(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > IPV4_MAX) {
    return undefined;
  }

  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
}

/**
 * IPv6 -> bigint。
 *
 * 用于：
 *
 * - CIDR 判断
 * - IP Range 判断
 * - IPv6 排序
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
 * 判断是否为内网地址。
 *
 * 包含：
 *
 * - RFC1918
 * - CGNAT
 * - IPv4 Link Local
 * - IPv6 ULA
 * - IPv6 Link Local
 *
 * 不包含 loopback。
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
      type: "address";
      address: string;
    }
  | {
      type: "cidr";
      network: string;
      prefix: number;
    }
  | {
      type: "range";
      start: string;
      end: string;
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
 * 支持：
 *
 * 单 IP：
 *
 * 192.168.1.100
 *
 * CIDR：
 *
 * 10.0.0.0/8
 *
 * IPv6 CIDR：
 *
 * 2001:db8::/32
 *
 * IP Range：
 *
 * 192.168.1.1-192.168.1.50
 */
export function createIpMatcher(rules: string[]): (ip?: string | null) => boolean {
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
 * 判断 IP 是否属于 CIDR / 单 IP。
 *
 * @example
 *
 * isIpInCidr(
 *   '192.168.1.10',
 *   '192.168.1.0/24',
 * );
 *
 * // true
 */
export function isIpInCidr(ip?: string | null, cidr?: string | null): boolean {
  if (!cidr) {
    return false;
  }

  return createIpMatcher([cidr])(ip);
}

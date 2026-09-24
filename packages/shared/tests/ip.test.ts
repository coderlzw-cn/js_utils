import { describe, expect, it } from "vitest";

import {
  IP_MAX_LENGTH,
  anonymizeIp,
  createIpMatcher,
  expandIpv6,
  extractClientIp,
  getIpVersion,
  ipv4ToLong,
  ipv6ToBigInt,
  isIP,
  isIPv4,
  isIPv6,
  isIpInCidr,
  isLoopbackIp,
  isPrivateIp,
  isPublicIp,
  isValidIp,
  longToIpv4,
  normalizeIp,
  parseForwardedFor,
} from "../src/ip.js";

describe("IPv4 / IPv6 校验", () => {
  it("拒绝空值、前导零和段数不对的 IPv4", () => {
    expect(isIPv4("192.168.1.1")).toBe(true);
    expect(isIPv4("0.0.0.0")).toBe(true);
    expect(isIPv4("255.255.255.255")).toBe(true);
    expect(isIPv4("192.168.001.1")).toBe(false);
    expect(isIPv4("192.168.1")).toBe(false);
    expect(isIPv4("192.168.1.256")).toBe(false);
    expect(isIPv4(" 192.168.1.1 ")).toBe(false);
    expect(isIPv4(null)).toBe(false);
    expect(isIPv4("")).toBe(false);
  });

  it("展开 IPv6，并识别嵌入的 IPv4 和 Zone ID", () => {
    expect(expandIpv6("2001:db8::1")).toBe("2001:db8:0:0:0:0:0:1");
    expect(expandIpv6("::ffff:192.168.1.1")).toBe("0:0:0:0:0:ffff:c0a8:101");
    expect(expandIpv6("FE80::1%eth0")).toBe("fe80:0:0:0:0:0:0:1");
    expect(expandIpv6("2001:db8::1::2")).toBeUndefined();
    expect(expandIpv6("gggg::1")).toBeUndefined();
    expect(isIPv6("::1")).toBe(true);
    expect(isIPv6("192.168.1.1")).toBe(false);
    expect(isIPv6(null)).toBe(false);
  });

  it("isIP 不规范化，getIpVersion 会把映射地址当成 IPv4", () => {
    expect(isIP("192.168.1.1")).toBe(4);
    expect(isIP("::1")).toBe(6);
    expect(isIP("::ffff:192.168.1.1")).toBe(6);
    expect(isIP("nope")).toBe(0);
    expect(getIpVersion("::ffff:192.168.1.1")).toBe(4);
    expect(getIpVersion(" 2001:DB8::1 ")).toBe(6);
    expect(getIpVersion("")).toBe(0);
  });
});

describe("规范化", () => {
  it("去掉空白、Zone ID，并把 ::ffff: 点分映射转成 IPv4", () => {
    expect(IP_MAX_LENGTH).toBe(45);
    expect(normalizeIp("  ::FFFF:192.168.1.1  ")).toBe("192.168.1.1");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeIp("192.168.001.1")).toBeUndefined();
    expect(normalizeIp(null)).toBeUndefined();
    expect(isValidIp(" fe80::1%eth0 ")).toBe(true);
    expect(isValidIp("999.1.1.1")).toBe(false);
  });

  it("超长输入直接拒绝，不截断成合法地址", () => {
    expect(normalizeIp(`1.2.3.4${"x".repeat(IP_MAX_LENGTH + 64)}`)).toBeUndefined();
  });
});

describe("请求头与地址分类", () => {
  it("按 client、proxy 顺序解析转发头，并跳过非法项", () => {
    expect(parseForwardedFor(" 203.0.113.7, ::ffff:192.168.1.1 , nope ")).toEqual(["203.0.113.7", "192.168.1.1"]);
    expect(parseForwardedFor(["10.0.0.1", " 8.8.8.8 "])).toEqual(["10.0.0.1", "8.8.8.8"]);
    expect(parseForwardedFor(null)).toEqual([]);
  });

  it("按转发头、真实 IP、连接地址的顺序取值", () => {
    expect(extractClientIp({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-real-ip": "198.51.100.1" }, "127.0.0.1")).toBe("203.0.113.7");
    expect(extractClientIp({ "x-forwarded-for": "nope", "x-real-ip": ["198.51.100.1"] }, "127.0.0.1")).toBe("198.51.100.1");
    expect(extractClientIp({}, "::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(extractClientIp({})).toBeUndefined();
  });

  it("区分回环、内网和公网", () => {
    expect(isLoopbackIp("127.1.2.3")).toBe(true);
    expect(isLoopbackIp("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackIp("::1")).toBe(true);
    expect(isLoopbackIp("8.8.8.8")).toBe(false);

    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("169.254.1.1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fe80::1%eth0")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(false);

    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("10.0.0.1")).toBe(false);
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("not-an-ip")).toBe(false);
  });

  it("脱敏到网络前缀", () => {
    expect(anonymizeIp("203.0.113.7")).toBe("203.0.113.0");
    expect(anonymizeIp("2001:db8:a:b:c:d:e:f")).toBe("2001:db8:a:b::");
    expect(anonymizeIp("nope")).toBeUndefined();
  });
});

describe("整数转换与匹配", () => {
  it("在 IPv4 与 32 位整数之间往返", () => {
    expect(ipv4ToLong("192.168.1.1")).toBe(3232235777);
    expect(longToIpv4(3232235777)).toBe("192.168.1.1");
    expect(longToIpv4(0)).toBe("0.0.0.0");
    expect(longToIpv4(0xffffffff)).toBe("255.255.255.255");
    expect(ipv4ToLong("::1")).toBeUndefined();
    expect(longToIpv4(-1)).toBeUndefined();
    expect(longToIpv4(1.5)).toBeUndefined();
  });

  it("把 IPv6 转成 128 位整数", () => {
    expect(ipv6ToBigInt("::1")).toBe(1n);
    expect(ipv6ToBigInt("2001:db8::")).toBe(0x20010db8000000000000000000000000n);
    expect(ipv6ToBigInt("192.168.1.1")).toBeUndefined();
    expect(ipv6ToBigInt(null)).toBeUndefined();
  });

  it("匹配单地址、CIDR 和闭区间", () => {
    const matches = createIpMatcher(["192.168.1.100", "10.0.0.0/8", "2001:db8::/32", "172.16.0.1-172.16.0.3", "bad-rule", "10.0.0.1-1.1.1.1"]);

    expect(matches("192.168.1.100")).toBe(true);
    expect(matches("10.1.2.3")).toBe(true);
    expect(matches("11.0.0.1")).toBe(false);
    expect(matches("2001:db8::1")).toBe(true);
    expect(matches("2001:db9::1")).toBe(false);
    expect(matches("172.16.0.2")).toBe(true);
    expect(matches("172.16.0.4")).toBe(false);
    expect(matches("::ffff:10.0.0.1")).toBe(true);
    expect(matches(null)).toBe(false);
    expect(createIpMatcher([])("8.8.8.8")).toBe(false);
    expect(createIpMatcher(["0.0.0.0/0"])("8.8.8.8")).toBe(true);

    expect(isIpInCidr("192.168.1.10", "192.168.1.0/24")).toBe(true);
    expect(isIpInCidr("192.168.2.10", "192.168.1.0/24")).toBe(false);
    expect(isIpInCidr("192.168.1.10", null)).toBe(false);
  });
});

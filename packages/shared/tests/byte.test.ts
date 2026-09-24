import { describe, expect, it } from "vitest";

import { AssertionError } from "../src/assert.js";

import {
  RATE_UNITS,
  STORAGE_UNITS,
  compareRate,
  compareStorage,
  convertRate,
  convertStorage,
  formatRate,
  formatStorage,
  isRateUnit,
  isStorageUnit,
  normalizeRateUnit,
  normalizeStorageUnit,
  parseRate,
  parseStorage,
  toBits,
  tobps,
  toBytes,
  toBps,
  toGB,
  toGBps,
  toGbps,
  toGiB,
  toGiBps,
  toKB,
  toKBps,
  toKbps,
  toKiB,
  toKiBps,
  toMB,
  toMBps,
  toMbps,
  toMiB,
  toMiBps,
  toPB,
  toPiB,
  toTB,
  toTbps,
  toTiB,
} from "../src/byte.js";

describe("单位表", () => {
  it("包含 bit、Byte 以及 SI、IEC 前缀", () => {
    expect(STORAGE_UNITS).toContain("bit");
    expect(STORAGE_UNITS).toContain("B");
    expect(STORAGE_UNITS).toContain("MB");
    expect(STORAGE_UNITS).toContain("Mbit");
    expect(STORAGE_UNITS).toContain("MiB");
    expect(STORAGE_UNITS).toContain("YiB");
    expect(STORAGE_UNITS).toHaveLength(2 + 8 * 4);
    expect(RATE_UNITS).toContain("Mbit/s");
    expect(RATE_UNITS).toContain("YiB/s");
    expect(RATE_UNITS).toHaveLength(STORAGE_UNITS.length);
  });
});

describe("单位规范化", () => {
  it("区分 bit 与 Byte，并识别长短别名", () => {
    expect(normalizeStorageUnit("mb")).toBe("Mbit");
    expect(normalizeStorageUnit("Mbit")).toBe("Mbit");
    expect(normalizeStorageUnit("megabit")).toBe("Mbit");
    expect(normalizeStorageUnit("MB")).toBe("MB");
    expect(normalizeStorageUnit("MByte")).toBe("MB");
    expect(normalizeStorageUnit("megabytes")).toBe("MB");
    expect(normalizeStorageUnit("kib")).toBe("Kibit");
    expect(normalizeStorageUnit("KiB")).toBe("KiB");
    expect(normalizeStorageUnit("kibibytes")).toBe("KiB");
    expect(normalizeStorageUnit("bit")).toBe("bit");
    expect(normalizeStorageUnit("bytes")).toBe("B");
  });

  it("存储单位不接受速率写法", () => {
    expect(normalizeStorageUnit("Mbps")).toBeUndefined();
    expect(normalizeStorageUnit("MB/s")).toBeUndefined();
    expect(normalizeStorageUnit("not-a-unit")).toBeUndefined();
    expect(isStorageUnit("MiB")).toBe(true);
    expect(isStorageUnit("Mbps")).toBe(false);
  });

  it("速率单位接受 bps、/s 和英文短语", () => {
    expect(normalizeRateUnit("Mbps")).toBe("Mbit/s");
    expect(normalizeRateUnit("MBps")).toBe("MB/s");
    expect(normalizeRateUnit("MB/s")).toBe("MB/s");
    expect(normalizeRateUnit("megabits per second")).toBe("Mbit/s");
    expect(normalizeRateUnit("MiB")).toBeUndefined();
    expect(isRateUnit("12")).toBe(false);
    expect(isRateUnit("Gbps")).toBe(true);
  });
});

describe("解析", () => {
  it("解析存储量的小数和科学计数法", () => {
    expect(parseStorage("1.5 MiB")).toEqual({
      value: 1.5,
      unit: "MiB",
      bits: 1.5 * 1024 * 1024 * 8,
      bytes: 1.5 * 1024 * 1024,
    });
    expect(parseStorage("8e3 bit")).toMatchObject({ value: 8000, unit: "bit", bits: 8000, bytes: 1000 });
  });

  it("拒绝负数、缺单位、非法单位和速率单位", () => {
    expect(parseStorage("-1 B")).toBeUndefined();
    expect(parseStorage("1")).toBeUndefined();
    expect(parseStorage("1 nope")).toBeUndefined();
    expect(parseStorage("1 Mbps")).toBeUndefined();
    expect(parseStorage("Infinity B")).toBeUndefined();
  });

  it("解析网络速率", () => {
    expect(parseRate("100 Mbps")).toMatchObject({
      value: 100,
      unit: "Mbit/s",
      bitsPerSecond: 100_000_000,
      bytesPerSecond: 12_500_000,
    });
    expect(parseRate("12.5 MB/s")).toMatchObject({
      value: 12.5,
      unit: "MB/s",
      bitsPerSecond: 100_000_000,
    });
    expect(parseRate("1e9 bit/s")).toMatchObject({ bitsPerSecond: 1_000_000_000 });
    expect(parseRate("-1 Mbps")).toBeUndefined();
    expect(parseRate("1 MiB")).toBeUndefined();
  });
});

describe("换算", () => {
  it("在存储单位之间换算 number 和 bigint", () => {
    expect(convertStorage(1, "MiB", "B")).toBe(1_048_576);
    expect(convertStorage(8n, "bit", "B")).toBe(1n);
    expect(convertStorage(1, "GB", "GiB")).toBeCloseTo(1_000_000_000 / 1024 ** 3);
    expect(convertStorage(0, "B", "MiB")).toBe(0);
  });

  it("bigint 不能整除或数值非法时抛出 AssertionError", () => {
    expect(() => convertStorage(1n, "bit", "B")).toThrow(AssertionError);
    expect(() => convertStorage(-1, "B", "KiB")).toThrow(AssertionError);
    expect(() => convertStorage(1, "Mbps", "B")).toThrow(AssertionError);
    expect(() => convertStorage(Number.POSITIVE_INFINITY, "B", "KiB")).toThrow(AssertionError);
  });

  it("在速率单位之间换算，不和存储单位混用", () => {
    expect(convertRate(1, "MB/s", "Mbps")).toBe(8);
    expect(convertRate(1000, "Mbps", "Gbps")).toBe(1);
    expect(convertRate(8n, "bit/s", "B/s")).toBe(1n);
    expect(() => convertRate(1, "MiB", "MB/s")).toThrow(AssertionError);
    expect(() => convertRate(1n, "bit/s", "B/s")).toThrow(AssertionError);
  });

  it("比较时先换算到同一单位", () => {
    expect(compareStorage(1, "KiB", 1024, "B")).toBe(0);
    expect(compareStorage(2, "B", 1, "B")).toBe(1);
    expect(compareStorage(1, "B", 2, "B")).toBe(-1);
    expect(compareRate(1, "MB/s", 8, "Mbps")).toBe(0);
    expect(compareRate(1, "Mbps", 2, "Mbps")).toBe(-1);
    expect(() => compareStorage(1, "nope", 1, "B")).toThrow(AssertionError);
  });
});

describe("快捷换算", () => {
  it("按默认输入单位转换存储量和速率", () => {
    expect(toBytes(1, "MiB")).toBe(1_048_576);
    expect(toBytes(8n, "bit")).toBe(1n);
    expect(toBits(1, "B")).toBe(8);
    expect(tobps(1, "Mbps")).toBe(1_000_000);
    expect(toBps(8, "bit/s")).toBe(1);

    expect(toKB(1000)).toBe(1);
    expect(toMB(1_000_000)).toBe(1);
    expect(toGB(1_000_000_000)).toBe(1);
    expect(toTB(1e12)).toBe(1);
    expect(toPB(1e15)).toBe(1);
    expect(toKiB(1024)).toBe(1);
    expect(toMiB(1024 ** 2)).toBe(1);
    expect(toGiB(1024 ** 3)).toBe(1);
    expect(toTiB(1024 ** 4)).toBe(1);
    expect(toPiB(1024 ** 5)).toBe(1);

    expect(toKbps(1000)).toBe(1);
    expect(toMbps(1_000_000)).toBe(1);
    expect(toGbps(1_000_000_000)).toBe(1);
    expect(toTbps(1e12)).toBe(1);
    expect(toKBps(8_000)).toBe(1);
    expect(toMBps(8_000_000)).toBe(1);
    expect(toGBps(8_000_000_000)).toBe(1);
    expect(toKiBps(8 * 1024)).toBe(1);
    expect(toMiBps(8 * 1024 ** 2)).toBe(1);
    expect(toGiBps(8 * 1024 ** 3)).toBe(1);
  });
});

describe("格式化", () => {
  it("按默认单位制选择易读单位", () => {
    expect(formatStorage(1536)).toBe("1.5 KiB");
    expect(formatStorage(1_000_000, { system: "si" })).toBe("1 MB");
    expect(formatStorage(0)).toBe("0 B");
    expect(formatRate(1_000_000)).toBe("1 Mbps");
    expect(formatRate(69.6 * 1000 * 1000)).toBe("69.6 Mbps");
    expect(formatRate(1_048_576, { from: "B/s", quantity: "byte", system: "iec" })).toBe("1 MiB/s");
  });

  it("遵守精度、末尾零、分组和空格配置", () => {
    expect(formatStorage(1536, { precision: 2, trimZeros: false })).toBe("1.50 KiB");
    expect(formatStorage(1536, { space: false })).toBe("1.5KiB");
    expect(formatStorage(1_024_000, { precision: 0 })).toBe("1,000 KiB");
    expect(formatStorage(1_024_000, { precision: 0, grouping: false })).toBe("1000 KiB");
    expect(formatStorage(8, { from: "bit", quantity: "bit" })).toBe("8 bit");
    expect(formatStorage(1, { quantity: "bit" })).toBe("8 bit");
  });

  it("拒绝非法数值、单位和精度", () => {
    expect(() => formatStorage(-1)).toThrow(AssertionError);
    expect(() => formatStorage(1, { from: "Mbps" })).toThrow(AssertionError);
    expect(() => formatStorage(1, { precision: 21 })).toThrow(AssertionError);
    expect(() => formatStorage(1, { precision: 1.5 })).toThrow(AssertionError);
    expect(() => formatRate(1, { from: "MiB" })).toThrow(AssertionError);
    expect(() => formatRate(-1n)).toThrow(AssertionError);
  });

  it("bigint 路径在可整除时格式化", () => {
    expect(formatStorage(1536n)).toBe("1.5 KiB");
    expect(formatRate(1_000_000n)).toBe("1 Mbps");
  });
});

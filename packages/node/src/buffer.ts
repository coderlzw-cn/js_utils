import { Buffer } from "node:buffer"; // 或直接使用全局 Buffer

export type RawData = string | Buffer | ArrayBuffer | Buffer[] | Uint8Array;

/**
 * 将多种原始数据格式高效且安全地转换为 UTF-8 字符串
 *
 * @param raw 待转换的数据，支持 string, Buffer, ArrayBuffer, Buffer[], Uint8Array
 * @returns 转换后的 UTF-8 字符串
 * @throws {TypeError} 当输入类型不匹配或参数为空时抛出异常
 */
export function toUtf8(raw: RawData): string {
  if (raw == null) {
    throw new TypeError("[toUtf8] Input data cannot be null or undefined.");
  }

  if (typeof raw === "string") {
    return raw;
  }

  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }

  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }

  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8");
  }

  throw new TypeError(`[toUtf8] Unsupported data type: ${Object.prototype.toString.call(raw)}`);
}

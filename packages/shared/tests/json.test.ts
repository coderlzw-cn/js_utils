import { describe, expect, it, vi } from "vitest";

import {
  formatJson,
  isValidJson,
  isValidJsonObject,
  parseJson,
  parseJsonObject,
  safeParseJson,
  safeParseJsonObject,
  stringifyJson,
  type JsonFormat,
  type ParseJsonOptions,
  type StringifyJsonOptions,
} from "../src/json.js";

describe("parseJson", () => {
  it("默认按 JSON5 解析扩展语法", () => {
    expect(
      parseJson(`
        {
          // comment
          unquoted: 'value',
          trailingComma: true,
        }
      `),
    ).toEqual({ unquoted: "value", trailingComma: true });
  });

  it("可按严格 JSON 格式解析", () => {
    expect(parseJson('{"name":"utils","items":[1,2]}', { format: "json" })).toEqual({
      name: "utils",
      items: [1, 2],
    });
    expect(() => parseJson('{"trailing":true,}', { format: "json" })).toThrow(SyntaxError);
  });

  it.each(["json", "json5"] satisfies JsonFormat[])(
    "%s reviver 自底向上转换值并绑定父容器",
    (format) => {
      const calls: Array<{ key: string; value: unknown; holder: unknown }> = [];
      const result = parseJson<{ nested: { count: number }; removed?: boolean }>(
        '{"nested":{"count":2},"removed":true}',
        {
          format,
          reviver(key, value) {
            calls.push({ key, value, holder: this });
            if (key === "count") {
              return (value as number) * 3;
            }
            if (key === "removed") {
              return undefined;
            }
            return value;
          },
        },
      );

      expect(result).toEqual({ nested: { count: 6 } });
      expect(calls.map(({ key }) => key)).toEqual(["count", "nested", "removed", ""]);
      expect(calls[0]?.holder).toMatchObject({ count: 6 });
      expect(calls.at(-1)?.holder).toHaveProperty("", result);
    },
  );

  it("不配置 fieldName 时保留解析器的原始语法错误", () => {
    const captureError = () => {
      try {
        parseJson("{");
      } catch (error) {
        return error;
      }
      throw new Error("Expected parseJson to throw");
    };

    const error = captureError();
    expect(error).toBeInstanceOf(SyntaxError);
    expect((error as Error).message).not.toContain("不是有效的 JSON");
  });

  it("配置 fieldName 时包装错误并保留 cause", () => {
    const cause = new Error("reviver failed");
    const captureError = () => {
      try {
        parseJson('{"value":1}', {
          fieldName: "settings",
          reviver() {
            throw cause;
          },
        });
      } catch (error) {
        return error;
      }
      throw new Error("Expected parseJson to throw");
    };

    const error = captureError();
    expect(error).toBeInstanceOf(SyntaxError);
    expect(error).toHaveProperty("message", "settings 不是有效的 JSON: reviver failed");
    expect(error).toHaveProperty("cause", cause);
  });

  it.each([
    {
      name: "非字符串文本",
      text: 1,
      options: {},
      error: TypeError,
      message: "text must be a string",
    },
    {
      name: "未知格式",
      text: "{}",
      options: { format: "yaml" },
      error: RangeError,
      message: 'format must be either "json" or "json5"',
    },
    {
      name: "非函数 reviver",
      text: "{}",
      options: { reviver: true },
      error: TypeError,
      message: "reviver must be a function",
    },
    {
      name: "空 fieldName",
      text: "{}",
      options: { fieldName: "" },
      error: TypeError,
      message: "fieldName must be a non-empty string",
    },
    {
      name: "非字符串 fieldName",
      text: "{}",
      options: { fieldName: 1 },
      error: TypeError,
      message: "fieldName must be a non-empty string",
    },
  ])("拒绝$name", ({ text, options, error, message }) => {
    expect(() => parseJson(text as string, options as unknown as ParseJsonOptions)).toThrowError(
      error,
    );
    expect(() => parseJson(text as string, options as unknown as ParseJsonOptions)).toThrow(
      message,
    );
  });
});

describe("parseJsonObject", () => {
  it("返回 JSON 对象并支持普通解析选项", () => {
    expect(
      parseJsonObject<{ enabled: boolean }>("{ enabled: false }", {
        reviver(key, value) {
          return key === "enabled" ? !value : value;
        },
      }),
    ).toEqual({ enabled: true });
  });

  it.each([
    ["null", "null"],
    ["数组", "[]"],
    ["字符串", '"value"'],
    ["数字", "1"],
    ["布尔值", "true"],
  ])("拒绝%s结果", (_, text) => {
    expect(() => parseJsonObject(text)).toThrowError(new TypeError("JSON 必须是 JSON 对象"));
  });

  it("对象类型错误包含 fieldName", () => {
    expect(() => parseJsonObject("[]", { fieldName: "payload" })).toThrowError(
      new TypeError("payload 必须是 JSON 对象"),
    );
  });

  it("把已检查对象和字段名传给 deserialize 并返回转换结果", () => {
    const deserialize = vi.fn((value: Readonly<Record<string, unknown>>, fieldName: string) => ({
      port: Number(value.port),
      source: fieldName,
    }));

    const result = parseJsonObject('{"port":"3000"}', {
      fieldName: "server",
      deserialize,
    });

    expect(result).toEqual({ port: 3000, source: "server" });
    expect(deserialize).toHaveBeenCalledOnce();
    expect(deserialize).toHaveBeenCalledWith({ port: "3000" }, "server");
  });

  it("deserialize 默认接收 JSON 字段名并透传业务异常", () => {
    const error = new TypeError("JSON.port 必须是数字");

    expect(() =>
      parseJsonObject('{"port":"invalid"}', {
        deserialize(_value, fieldName) {
          expect(fieldName).toBe("JSON");
          throw error;
        },
      }),
    ).toThrow(error);
  });

  it("拒绝运行时传入的非函数 deserialize", () => {
    expect(() =>
      parseJsonObject("{}", {
        deserialize: true,
      } as unknown as Parameters<typeof parseJsonObject>[1]),
    ).toThrowError(new TypeError("deserialize must be a function"));
  });
});

describe("safe parse helpers", () => {
  it("safeParseJson 返回成功结果", () => {
    expect(safeParseJson<number[]>("[1, 2, 3,]")).toEqual({
      success: true,
      data: [1, 2, 3],
    });
  });

  it("safeParseJson 捕获 Error", () => {
    const result = safeParseJson("{");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(SyntaxError);
    }
  });

  it("safeParseJson 将任意抛出值标准化为 Error", () => {
    const result = safeParseJson('{"value":1}', {
      reviver() {
        throw "reviver failed";
      },
    });

    expect(result).toEqual({
      success: false,
      error: new Error("reviver failed"),
    });
  });

  it("safeParseJsonObject 返回对象和反序列化结果", () => {
    expect(safeParseJsonObject('{"value":1}')).toEqual({
      success: true,
      data: { value: 1 },
    });
    expect(
      safeParseJsonObject('{"value":1}', {
        deserialize: (value) => Number(value.value) + 1,
      }),
    ).toEqual({ success: true, data: 2 });
  });

  it("safeParseJsonObject 捕获对象检查和业务校验错误", () => {
    const nonObjectResult = safeParseJsonObject("null");
    expect(nonObjectResult.success).toBe(false);
    if (!nonObjectResult.success) {
      expect(nonObjectResult.error).toEqual(new TypeError("JSON 必须是 JSON 对象"));
    }

    const deserializeResult = safeParseJsonObject("{}", {
      deserialize() {
        throw new RangeError("missing value");
      },
    });
    expect(deserializeResult.success).toBe(false);
    if (!deserializeResult.success) {
      expect(deserializeResult.error).toEqual(new RangeError("missing value"));
    }
  });
});

describe("validation helpers", () => {
  it("isValidJson 接受任意合法值并遵守格式选项", () => {
    expect(isValidJson("null")).toBe(true);
    expect(isValidJson("[1, 2,]")).toBe(true);
    expect(isValidJson("[1, 2,]", { format: "json" })).toBe(false);
    expect(isValidJson("{")).toBe(false);
  });

  it("isValidJson 把 reviver 和选项错误视为无效", () => {
    expect(
      isValidJson("{}", {
        reviver() {
          throw new Error("invalid");
        },
      }),
    ).toBe(false);
    expect(
      isValidJson("{}", {
        format: "yaml",
      } as unknown as ParseJsonOptions),
    ).toBe(false);
  });

  it("isValidJsonObject 只接受解析后仍为对象的值", () => {
    expect(isValidJsonObject("{ value: 1 }")).toBe(true);
    expect(isValidJsonObject("[]")).toBe(false);
    expect(isValidJsonObject("null")).toBe(false);
    expect(isValidJsonObject('"value"')).toBe(false);
    expect(isValidJsonObject("{")).toBe(false);
    expect(
      isValidJsonObject('{"value":1}', {
        reviver(key, value) {
          return key === "" ? [] : value;
        },
      }),
    ).toBe(false);
  });
});

describe("stringifyJson", () => {
  it("默认输出紧凑的标准 JSON", () => {
    expect(stringifyJson({ name: "utils", enabled: true })).toBe('{"name":"utils","enabled":true}');
  });

  it("支持 JSON5 输出", () => {
    const text = stringifyJson({ name: "utils", count: 2 }, { format: "json5" });

    expect(text).toBeDefined();
    expect(parseJson(text!, { format: "json5" })).toEqual({
      name: "utils",
      count: 2,
    });
  });

  it.each(["json", "json5"] satisfies JsonFormat[])(
    "%s 支持函数 replacer 的 this、转换和删除语义",
    (format) => {
      const holders: unknown[] = [];
      const text = stringifyJson(
        { count: 2, omitted: true, items: [1, 2] },
        {
          format,
          replacer(key, value) {
            holders.push(this);
            if (key === "count") {
              return (value as number) * 2;
            }
            if (key === "omitted" || key === "0") {
              return undefined;
            }
            return value;
          },
        },
      );

      expect(parseJson(text!, { format })).toEqual({
        count: 4,
        items: [null, 2],
      });
      expect(holders[0]).toHaveProperty("", expect.any(Object));
    },
  );

  it.each(["json", "json5"] satisfies JsonFormat[])("%s 支持字符串和数字属性白名单", (format) => {
    const whitelist: Array<string | number> = ["keep", 1];
    const text = stringifyJson(
      {
        keep: "yes",
        drop: "no",
        nested: { keep: "nested", drop: "no" },
        1: "numeric",
      },
      { format, replacer: whitelist },
    );

    expect(parseJson(text!, { format })).toEqual({
      1: "numeric",
      keep: "yes",
    });
    expect(whitelist).toEqual(["keep", 1]);
  });

  it("支持数字和字符串缩进，并遵循最多 10 个字符的原生限制", () => {
    expect(stringifyJson({ value: 1 }, { space: 2 })).toContain('\n  "value"');
    expect(stringifyJson({ value: 1 }, { space: "--" })).toContain('\n--"value"');
    expect(stringifyJson({ value: 1 }, { space: 20 })).toContain(`\n${" ".repeat(10)}"value"`);
    expect(stringifyJson({ value: 1 }, { space: "abcdefghijkl" })).toContain('\nabcdefghij"value"');
  });

  it("递归排序对象键但不改变数组顺序", () => {
    const text = stringifyJson(
      {
        z: 1,
        a: { d: 4, c: 3 },
        list: [{ b: 2, a: 1 }, { z: 0 }],
      },
      { sortKeys: true },
    );

    expect(text).toBe('{"a":{"c":3,"d":4},"list":[{"a":1,"b":2},{"z":0}],"z":1}');
  });

  it("排序前先应用函数 replacer", () => {
    const text = stringifyJson(
      { original: true },
      {
        sortKeys: true,
        replacer(key, value) {
          if (key === "original") {
            return { z: 1, a: 2 };
          }
          return value;
        },
      },
    );

    expect(text).toBe('{"original":{"a":2,"z":1}}');
  });

  it("排序可与属性白名单组合", () => {
    const text = stringifyJson(
      {
        z: 1,
        keep: { z: 3, keep: 2, drop: 1 },
        drop: true,
      },
      { replacer: ["z", "keep"], sortKeys: true },
    );

    expect(text).toBe('{"keep":{"keep":2,"z":3},"z":1}');
  });

  it("排序时正确处理共享引用，并仍拒绝循环引用", () => {
    const shared = { b: 2, a: 1 };
    expect(stringifyJson({ second: shared, first: shared }, { sortKeys: true })).toBe(
      '{"first":{"a":1,"b":2},"second":{"a":1,"b":2}}',
    );

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => stringifyJson(circular, { sortKeys: true })).toThrow(TypeError);
  });

  it.each([undefined, vi.fn(), Symbol("value")])("顶层不可表示的值返回 undefined", (value) => {
    expect(stringifyJson(value)).toBeUndefined();
  });

  it("透传底层序列化错误", () => {
    expect(() => stringifyJson(1n)).toThrow(TypeError);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => stringifyJson(circular)).toThrow(TypeError);
  });

  it.each([
    {
      name: "未知格式",
      options: { format: "yaml" },
      error: RangeError,
      message: 'format must be either "json" or "json5"',
    },
    {
      name: "非法 replacer",
      options: { replacer: true },
      error: TypeError,
      message: "replacer must be a function or an array of property names",
    },
    {
      name: "包含非法键的 replacer",
      options: { replacer: ["valid", false] },
      error: TypeError,
      message: "replacer property names must be strings or numbers",
    },
    {
      name: "非法 space 类型",
      options: { space: true },
      error: TypeError,
      message: "space must be a string or number",
    },
    {
      name: "无限 space",
      options: { space: Number.POSITIVE_INFINITY },
      error: RangeError,
      message: "space must be a finite number",
    },
    {
      name: "NaN space",
      options: { space: Number.NaN },
      error: RangeError,
      message: "space must be a finite number",
    },
    {
      name: "非法 sortKeys",
      options: { sortKeys: 1 },
      error: TypeError,
      message: "sortKeys must be a boolean",
    },
  ])("拒绝$name", ({ options, error, message }) => {
    expect(() => stringifyJson({}, options as unknown as StringifyJsonOptions)).toThrowError(error);
    expect(() => stringifyJson({}, options as unknown as StringifyJsonOptions)).toThrow(message);
  });
});

describe("formatJson", () => {
  it("默认把 JSON5 格式化为缩进 2 空格的标准 JSON", () => {
    expect(formatJson("{ z: 1, a: 'value', }")).toBe(
      `{
  "z": 1,
  "a": "value"
}`,
    );
  });

  it("支持输入输出格式、缩进和递归排序选项", () => {
    const text = formatJson('{"z":1,"a":{"d":4,"c":3}}', {
      inputFormat: "json",
      outputFormat: "json5",
      space: 0,
      sortKeys: true,
    });

    expect(text).toBe("{a:{c:3,d:4},z:1}");
  });

  it("透传输入语法和输出选项错误", () => {
    expect(() => formatJson("{", { inputFormat: "json" })).toThrow(SyntaxError);
    expect(() =>
      formatJson("{}", {
        outputFormat: "yaml",
      } as unknown as Parameters<typeof formatJson>[1]),
    ).toThrow(RangeError);
    expect(() =>
      formatJson("{}", {
        sortKeys: "yes",
      } as unknown as Parameters<typeof formatJson>[1]),
    ).toThrow(TypeError);
  });
});

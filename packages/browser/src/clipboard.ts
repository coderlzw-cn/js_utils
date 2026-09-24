import { isBrowserRuntime } from "./runtime";
/**
 * 剪贴板操作类型。
 */
export type ClipboardAction = "copy" | "cut";

/**
 * 剪贴板操作方式。
 */
export type ClipboardMethod = "clipboard-api" | "exec-command";

/**
 * 剪贴板操作成功结果。
 *
 * 成功时一定执行了具体的剪贴板写入方式，因此 method 和 text 必然存在。
 */
export interface ClipboardSuccessResult {
  /**
   * 操作是否成功。
   */
  success: true;

  /**
   * 操作类型。
   */
  action: ClipboardAction;

  /**
   * 实际使用的底层操作方式。
   */
  method: ClipboardMethod;

  /**
   * 写入剪贴板的纯文本内容。
   */
  text: string;
}

/**
 * 剪贴板操作失败结果。
 *
 * method 仅在剪贴板写入成功、但后续清理失败等场景中存在。
 */
export interface ClipboardFailureResult {
  /**
   * 操作是否成功。
   */
  success: false;

  /**
   * 操作类型。
   */
  action: ClipboardAction;

  /**
   * 失败前已经使用的底层操作方式。
   */
  method?: ClipboardMethod;

  /**
   * 尝试写入剪贴板的纯文本内容。
   */
  text?: string;

  /**
   * 操作失败时的错误。
   */
  error: unknown;
}

/**
 * 通过 success 字段区分成功与失败，便于调用方安全地缩窄结果类型。
 */
export type ClipboardResult = ClipboardSuccessResult | ClipboardFailureResult;

/**
 * 复制文本配置。
 */
export interface CopyTextOptions {
  /**
   * 是否允许在 Clipboard API 失败后使用 execCommand 降级。
   *
   * @default true
   */
  fallback?: boolean;
}

/**
 * 复制 HTML 配置。
 */
export interface CopyHtmlOptions extends CopyTextOptions {
  /**
   * HTML 对应的纯文本内容。
   *
   * 未提供时，会自动移除 HTML 标签生成纯文本。
   */
  text?: string;
}

/**
 * 复制元素配置。
 */
export interface CopyElementOptions extends CopyTextOptions {
  /**
   * 是否复制元素的 HTML。
   *
   * 为 false 时只复制元素文本。
   *
   * @default true
   */
  includeHtml?: boolean;
}

/**
 * 剪切配置。
 */
export interface CutOptions {
  /**
   * 未选择任何文本时，是否剪切目标元素全部内容。
   *
   * @default false
   */
  selectAllWhenEmpty?: boolean;

  /**
   * 是否允许使用 execCommand 降级。
   *
   * @default true
   */
  fallback?: boolean;
}

/**
 * 可执行剪切操作的元素。
 */
export type CuttableElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/**
 * 企业级剪贴板工具。
 */
export const clipboard = {
  /**
   * 判断当前环境是否支持现代 Clipboard API。
   */
  isSupported(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.clipboard !== "undefined";
  },

  /**
   * 判断当前环境是否支持 ClipboardItem。
   */
  isClipboardItemSupported(): boolean {
    return typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function";
  },

  /**
   * 复制纯文本。
   *
   * @param text 要复制的文本
   * @param options 复制配置
   */
  async copyText(text: string, options: CopyTextOptions = {}): Promise<ClipboardResult> {
    const { fallback = true } = options;

    if (!isBrowserRuntime()) {
      return createFailure("copy", new Error("Clipboard API is unavailable outside the browser."));
    }

    if (typeof text !== "string") {
      return createFailure("copy", new TypeError("The copied content must be a string."));
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);

        return {
          success: true,
          action: "copy",
          method: "clipboard-api",
          text,
        };
      }
    } catch (error) {
      if (!fallback) {
        return createFailure("copy", error, text);
      }
    }

    if (!fallback) {
      return createFailure("copy", new Error("The Clipboard API is not supported."), text);
    }

    return copyTextByExecCommand(text);
  },

  /**
   * 复制 HTML 富文本。
   *
   * 支持富文本的应用会读取 text/html，
   * 普通文本应用会读取 text/plain。
   *
   * @param html 要复制的 HTML
   * @param options 复制配置
   */
  async copyHtml(html: string, options: CopyHtmlOptions = {}): Promise<ClipboardResult> {
    const { fallback = true } = options;
    const text = options.text ?? htmlToText(html);

    if (!isBrowserRuntime()) {
      return createFailure("copy", new Error("Clipboard API is unavailable outside the browser."), text);
    }

    if (typeof html !== "string") {
      return createFailure("copy", new TypeError("The copied HTML must be a string."));
    }

    try {
      if (this.isClipboardItemSupported()) {
        const item = new ClipboardItem({
          "text/plain": new Blob([text], {
            type: "text/plain;charset=utf-8",
          }),
          "text/html": new Blob([html], {
            type: "text/html;charset=utf-8",
          }),
        });

        await navigator.clipboard.write([item]);

        return {
          success: true,
          action: "copy",
          method: "clipboard-api",
          text,
        };
      }
    } catch (error) {
      if (!fallback) {
        return createFailure("copy", error, text);
      }
    }

    if (!fallback) {
      return createFailure("copy", new Error("HTML clipboard writing is not supported."), text);
    }

    return copyHtmlByExecCommand(html, text);
  },

  /**
   * 复制指定 DOM 元素的内容。
   *
   * @param element 要复制的元素
   * @param options 复制配置
   */
  async copyElement(element: HTMLElement | null | undefined, options: CopyElementOptions = {}): Promise<ClipboardResult> {
    if (!element) {
      return createFailure("copy", new TypeError("The copied element cannot be null."));
    }

    const { includeHtml = true, fallback = true } = options;
    const text = element.innerText || element.textContent || "";

    if (!includeHtml) {
      return this.copyText(text, { fallback });
    }

    return this.copyHtml(element.innerHTML, {
      text,
      fallback,
    });
  },

  /**
   * 剪切输入框、文本域或可编辑元素中的内容。
   *
   * 输入框和文本域优先剪切选中的内容。
   * contenteditable 元素优先剪切当前 Selection 中的内容。
   *
   * @param element 要执行剪切操作的元素
   * @param options 剪切配置
   */
  async cut(element: CuttableElement | null | undefined, options: CutOptions = {}): Promise<ClipboardResult> {
    const { selectAllWhenEmpty = false, fallback = true } = options;

    if (!isBrowserRuntime()) {
      return createFailure("cut", new Error("Clipboard API is unavailable outside the browser."));
    }

    if (!element) {
      return createFailure("cut", new TypeError("The cut element cannot be null."));
    }

    if (isTextControl(element)) {
      return cutTextControl(element, {
        selectAllWhenEmpty,
        fallback,
      });
    }

    if (element.isContentEditable) {
      return cutContentEditable(element, {
        selectAllWhenEmpty,
        fallback,
      });
    }

    return createFailure("cut", new TypeError("Only input, textarea, and contenteditable elements can be cut."));
  },

  /**
   * 复制文本，并在复制成功后执行清理逻辑。
   *
   * 适用于“复制后清空”“复制后删除源数据”等场景。
   *
   * @param text 要复制的文本
   * @param clear 复制成功后的清理函数
   * @param options 复制配置
   */
  async copyAndClear(text: string, clear: () => void | Promise<void>, options: CopyTextOptions = {}): Promise<ClipboardResult> {
    const result = await this.copyText(text, options);

    if (!result.success) {
      return result;
    }

    try {
      await clear();
      return result;
    } catch (error) {
      return {
        ...result,
        success: false,
        error,
      };
    }
  },
};

/**
 * 剪切 input 或 textarea 中的内容。
 */
async function cutTextControl(element: HTMLInputElement | HTMLTextAreaElement, options: Required<CutOptions>): Promise<ClipboardResult> {
  if (element.disabled || element.readOnly) {
    return createFailure("cut", new Error("The target element is disabled or readonly."));
  }

  const value = element.value;
  let start = element.selectionStart ?? 0;
  let end = element.selectionEnd ?? 0;

  if (start === end) {
    if (!options.selectAllWhenEmpty) {
      return createFailure("cut", new Error("No text is selected."));
    }

    start = 0;
    end = value.length;
  }

  const selectedText = value.slice(start, end);

  if (!selectedText) {
    return createFailure("cut", new Error("The selected text is empty."));
  }

  const copyResult = await clipboard.copyText(selectedText, {
    fallback: options.fallback,
  });

  if (!copyResult.success) {
    return {
      ...copyResult,
      action: "cut",
    };
  }

  const nextValue = value.slice(0, start) + value.slice(end);

  setNativeValue(element, nextValue);
  element.setSelectionRange(start, start);
  dispatchInputEvents(element, "deleteByCut");

  return {
    success: true,
    action: "cut",
    method: copyResult.method,
    text: selectedText,
  };
}

/**
 * 剪切 contenteditable 元素中的内容。
 */
async function cutContentEditable(element: HTMLElement, options: Required<CutOptions>): Promise<ClipboardResult> {
  element.focus();

  const selection = window.getSelection();

  if (!selection) {
    return createFailure("cut", new Error("The Selection API is unavailable."));
  }

  let range: Range;

  if (selection.rangeCount > 0 && !selection.isCollapsed && selectionBelongsToElement(selection, element)) {
    range = selection.getRangeAt(0);
  } else {
    if (!options.selectAllWhenEmpty) {
      return createFailure("cut", new Error("No editable content is selected."));
    }

    range = document.createRange();
    range.selectNodeContents(element);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  const fragment = range.cloneContents();
  const text = selection.toString();
  const html = fragmentToHtml(fragment);

  if (!text && !html) {
    return createFailure("cut", new Error("The selected content is empty."));
  }

  const copyResult = html
    ? await clipboard.copyHtml(html, {
        text,
        fallback: options.fallback,
      })
    : await clipboard.copyText(text, {
        fallback: options.fallback,
      });

  if (!copyResult.success) {
    return {
      ...copyResult,
      action: "cut",
    };
  }

  range.deleteContents();
  selection.removeAllRanges();

  const collapsedRange = document.createRange();
  collapsedRange.setStart(range.startContainer, range.startOffset);
  collapsedRange.collapse(true);

  selection.addRange(collapsedRange);

  dispatchInputEvents(element, "deleteByCut");

  return {
    success: true,
    action: "cut",
    method: copyResult.method,
    text,
  };
}

/**
 * 使用 execCommand 复制纯文本。
 */
function copyTextByExecCommand(text: string): ClipboardResult {
  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");

  Object.assign(textarea.style, {
    position: "fixed",
    top: "0",
    left: "-9999px",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });

  return executeTemporaryCopy(textarea, text);
}

/**
 * 使用 execCommand 复制 HTML。
 */
function copyHtmlByExecCommand(html: string, text: string): ClipboardResult {
  const container = document.createElement("div");

  container.contentEditable = "true";
  container.setAttribute("aria-hidden", "true");
  container.innerHTML = html;

  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "-9999px",
    opacity: "0",
    pointerEvents: "none",
  });

  const previousSelection = saveSelection();

  document.body.appendChild(container);

  try {
    const range = document.createRange();
    range.selectNodeContents(container);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const success = document.execCommand("copy");

    return success
      ? {
          success: true,
          action: "copy",
          method: "exec-command",
          text,
        }
      : createFailure("copy", new Error("The browser rejected the copy command."), text);
  } catch (error) {
    return createFailure("copy", error, text);
  } finally {
    container.remove();
    restoreSelection(previousSelection);
  }
}

/**
 * 将临时输入控件中的内容复制到剪贴板。
 */
function executeTemporaryCopy(element: HTMLTextAreaElement, text: string): ClipboardResult {
  const activeElement = document.activeElement as HTMLElement | null;
  const previousSelection = saveSelection();

  document.body.appendChild(element);

  try {
    element.focus();
    element.select();
    element.setSelectionRange(0, element.value.length);

    const success = document.execCommand("copy");

    return success
      ? {
          success: true,
          action: "copy",
          method: "exec-command",
          text,
        }
      : createFailure("copy", new Error("The browser rejected the copy command."), text);
  } catch (error) {
    return createFailure("copy", error, text);
  } finally {
    element.remove();
    activeElement?.focus();
    restoreSelection(previousSelection);
  }
}

/**
 * 设置 input 或 textarea 的原生 value。
 *
 * 相比直接赋值，该方式对 React 等受控组件兼容性更好。
 */
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  descriptor?.set?.call(element, value);
}

/**
 * 触发输入事件。
 */
function dispatchInputEvents(element: HTMLElement, inputType: string): void {
  try {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType,
        data: null,
      }),
    );
  } catch {
    element.dispatchEvent(
      new Event("input", {
        bubbles: true,
      }),
    );
  }

  element.dispatchEvent(
    new Event("change", {
      bubbles: true,
    }),
  );
}

/**
 * 判断元素是否为支持文本选择的输入控件。
 */
function isTextControl(element: CuttableElement): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  return ["text", "search", "tel", "url", "password", "email"].includes(element.type);
}

/**
 * 判断当前选择范围是否位于指定元素内部。
 */
function selectionBelongsToElement(selection: Selection, element: HTMLElement): boolean {
  if (selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;

  return commonAncestor === element || element.contains(commonAncestor.nodeType === Node.ELEMENT_NODE ? (commonAncestor as Element) : commonAncestor.parentElement);
}

/**
 * 将文档片段转换为 HTML。
 */
function fragmentToHtml(fragment: DocumentFragment): string {
  const container = document.createElement("div");
  container.appendChild(fragment.cloneNode(true));
  return container.innerHTML;
}

/**
 * 将 HTML 转换为纯文本。
 */
function htmlToText(html: string): string {
  if (!isBrowserRuntime()) {
    return html.replace(/<[^>]*>/g, "");
  }

  const element = document.createElement("div");
  element.innerHTML = html;

  return element.innerText || element.textContent || "";
}

/**
 * 保存当前选区。
 */
function saveSelection(): Range[] {
  const selection = window.getSelection();

  if (!selection) {
    return [];
  }

  return Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());
}

/**
 * 恢复选区。
 */
function restoreSelection(ranges: Range[]): void {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  selection.removeAllRanges();

  for (const range of ranges) {
    selection.addRange(range);
  }
}

/**
 * 创建失败结果。
 */
function createFailure(action: ClipboardAction, error: unknown, text?: string): ClipboardResult {
  return {
    success: false,
    action,
    ...(text === undefined ? {} : { text }),
    error,
  };
}

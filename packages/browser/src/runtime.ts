export interface BrowserRuntimeInfo {
  /** The current page URL, including its query string and hash. */
  readonly url: string;
  /** The user's preferred browser language, such as `zh-CN`. */
  readonly language: string;
  /** Whether the browser currently considers the network reachable. */
  readonly online: boolean;
  /** The document's current foreground/background visibility state. */
  readonly visibilityState: DocumentVisibilityState;
}

/**
 * Returns whether both core browser globals are available.
 *
 * Checking both globals is important for code that can also run during SSR,
 * where browser types may be compiled successfully but no DOM exists at runtime.
 */
export function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Returns the current Window or throws a descriptive error outside a browser.
 * Use this at browser-only entry points to avoid an opaque `window is not defined` error.
 */
export function getBrowserWindow(): Window {
  if (!isBrowserRuntime()) {
    throw new Error("@utils/browser can only be used in a browser runtime");
  }

  return window;
}

/**
 * Reads stable runtime metadata without parsing the user agent.
 *
 * `online` is only the browser's connectivity hint; a true value does not
 * guarantee that a particular server or request is reachable.
 */
export function getRuntimeInfo(): BrowserRuntimeInfo {
  const browserWindow = getBrowserWindow();

  return {
    url: browserWindow.location.href,
    language: browserWindow.navigator.language,
    online: browserWindow.navigator.onLine,
    visibilityState: browserWindow.document.visibilityState,
  };
}

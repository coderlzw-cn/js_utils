export type StorageReadResult<T> = { ok: true; value: T | undefined } | { ok: false; error: Error };

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Reads JSON while representing unavailable storage and invalid data explicitly. */
export function readStorage(key: string, storage: Storage = localStorage): StorageReadResult<unknown> {
  try {
    const serialized = storage.getItem(key);
    const value: unknown = serialized === null ? undefined : JSON.parse(serialized);

    return {
      ok: true,
      value,
    };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export function writeStorage(key: string, value: unknown, storage: Storage = localStorage): void {
  storage.setItem(key, JSON.stringify(value));
}

export function removeStorage(key: string, storage: Storage = localStorage): void {
  storage.removeItem(key);
}

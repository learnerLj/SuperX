import type { AnalysisResult } from "../shared/contracts";

interface CacheState {
  bytes: number;
  clock: number;
  migrated: boolean;
}
interface CacheRecord {
  key: string;
  value: AnalysisResult;
  bytes: number;
  provider: string;
  lastAccess: number;
}
export interface CachePage {
  items: { key: string; value: unknown }[];
  next: string | null;
}
function identity(key: string): readonly unknown[] {
  try {
    const value: unknown = JSON.parse(key);
    return Array.isArray(value) ? (value as unknown[]) : [];
  } catch {
    return [];
  }
}

// Persistent byte accounting, transactions and LRU stay identical to the JS owner.
export const byteSize = (key: string, value: unknown): number =>
  new TextEncoder().encode(JSON.stringify([key, value])).byteLength;
const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export function create({
  indexedDB,
  name = "SuperXAnswers",
  keyRange = globalThis.IDBKeyRange,
}: {
  indexedDB: IDBFactory;
  name?: string;
  keyRange?: typeof IDBKeyRange;
}) {
  let opening: Promise<IDBDatabase> | undefined;
  function open() {
    if (!opening)
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => {
          const entries = req.result.createObjectStore("answers", {
            keyPath: "key",
          });
          entries.createIndex("lastAccess", "lastAccess");
          entries.createIndex("provider", "provider");
          req.result.createObjectStore("meta");
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            opening = undefined;
          };
          resolve(db);
        };
        req.onerror = () => {
          opening = undefined;
          reject(req.error);
        };
      });
    return opening;
  }
  async function transaction<T>(
    mode: IDBTransactionMode,
    work: (entries: IDBObjectStore, meta: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await open(),
      tx = db.transaction(["answers", "meta"], mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error || new Error("Answer cache transaction aborted."));
      tx.onerror = () => {};
    });
    const entries = tx.objectStore("answers"),
      meta = tx.objectStore("meta");
    try {
      const result = await work(entries, meta);
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw error;
    }
  }
  const state = async (meta: IDBObjectStore): Promise<CacheState> =>
    (await request<CacheState | undefined>(meta.get("state"))) || {
      bytes: 0,
      clock: 0,
      migrated: false,
    };
  async function evict(
    entries: IDBObjectStore,
    total: CacheState,
    limit: number,
  ): Promise<void> {
    if (total.bytes <= limit) return;
    await new Promise<void>((resolve, reject) => {
      const req = entries.index("lastAccess").openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || total.bytes <= limit) {
          resolve();
          return;
        }
        total.bytes -= (cursor.value as CacheRecord).bytes;
        cursor.delete();
        cursor.continue();
      };
    });
  }
  async function write(
    entries: IDBObjectStore,
    total: CacheState,
    key: string,
    value: AnalysisResult,
    limit: number,
  ): Promise<boolean> {
    const bytes = byteSize(key, value);
    if (bytes > limit) {
      await evict(entries, total, limit);
      return false;
    } // Preserve a fitting successful answer.
    const previous = await request<CacheRecord | undefined>(entries.get(key));
    total.bytes += bytes - (previous?.bytes || 0);
    const partition = identity(key)[1],
      provider =
        value.provider || (typeof partition === "string" ? partition : "");
    await request(
      entries.put({ key, value, bytes, provider, lastAccess: ++total.clock }),
    );
    await evict(entries, total, limit);
    return true;
  }
  return {
    // Export owns its instance; the worker keeps its existing long-lived handle.
    async close(): Promise<void> {
      const pending = opening;
      opening = undefined;
      if (pending) (await pending).close();
    },
    readPage({
      after,
      limit = 128,
      maxBytes = 1024 * 1024,
    }: {
      after?: string;
      limit?: number;
      maxBytes?: number;
    } = {}): Promise<CachePage> {
      const count = Number.isFinite(limit)
        ? Math.max(1, Math.min(128, Math.floor(limit)))
        : 128;
      const budget = Number.isFinite(maxBytes)
        ? Math.max(1, Math.min(1024 * 1024, Math.floor(maxBytes)))
        : 1024 * 1024;
      return transaction(
        "readonly",
        (entries) =>
          new Promise<CachePage>((resolve, reject) => {
            if (after !== undefined && !keyRange) {
              reject(
                new Error("IDBKeyRange is required for cache pagination."),
              );
              return;
            }
            const req = entries.openCursor(
              after === undefined
                ? undefined
                : keyRange!.lowerBound(after, true),
            );
            const items: CachePage["items"] = [];
            let bytes = 0;
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const cursor = req.result;
              if (!cursor) {
                resolve({ items, next: null });
                return;
              }
              // The owner writes only string primary keys. Never resume from an
              // inferred value.key: the exclusive primary-key bound ensures progress.
              if (typeof cursor.primaryKey !== "string") {
                reject(new Error("Invalid answer cache primary key."));
                return;
              }
              const raw: unknown = cursor.value;
              const value =
                raw && typeof raw === "object" && "value" in raw
                  ? raw.value
                  : undefined;
              let size: number;
              try {
                size = byteSize(cursor.primaryKey, value);
              } catch {
                // A corrupt, non-JSON value is still returned for the exporter to
                // count; one oversized record must always be able to advance.
                size = budget + 1;
              }
              if (
                items.length &&
                (items.length >= count || bytes + size > budget)
              ) {
                resolve({ items, next: items[items.length - 1]!.key });
                return;
              }
              items.push({ key: cursor.primaryKey, value });
              bytes += size;
              cursor.continue();
            };
          }),
      );
    },
    ready() {
      return transaction("readonly", async (_, meta) => {
        await state(meta);
        return true;
      });
    },
    get(key: string) {
      return transaction("readwrite", async (entries, meta) => {
        const entry = await request<CacheRecord | undefined>(entries.get(key));
        if (!entry) return null;
        const total = await state(meta);
        entry.lastAccess = ++total.clock;
        await request(entries.put(entry));
        await request(meta.put(total, "state"));
        return entry.value;
      });
    },
    put(key: string, value: AnalysisResult, limit: number) {
      return transaction("readwrite", async (entries, meta) => {
        const total = await state(meta),
          stored = await write(entries, total, key, value, limit);
        await request(meta.put(total, "state"));
        return stored;
      });
    },
    trim(limit: number) {
      return transaction("readwrite", async (entries, meta) => {
        const total = await state(meta);
        await evict(entries, total, limit);
        await request(meta.put(total, "state"));
      });
    },
    clear() {
      return transaction("readwrite", async (entries, meta) => {
        const total = await state(meta);
        await request(entries.clear());
        total.bytes = 0;
        total.migrated = true;
        await request(meta.put(total, "state"));
      });
    },
    removeProvider(provider: string, keepCredential?: string) {
      return transaction("readwrite", async (entries, meta) => {
        const total = await state(meta);
        await new Promise<void>((resolve, reject) => {
          const req = entries.index("provider").openCursor(provider);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
              resolve();
              return;
            }
            let keep = false;
            if (keepCredential) {
              const account = identity(String(cursor.primaryKey))[2];
              keep = Array.isArray(account) && account[0] === keepCredential;
            }
            if (!keep) {
              total.bytes -= (cursor.value as CacheRecord).bytes;
              cursor.delete();
            }
            cursor.continue();
          };
        });
        await request(meta.put(total, "state"));
      });
    },
    migrate(
      values: readonly (readonly [string, AnalysisResult])[],
      limit: number,
    ) {
      return transaction("readwrite", async (entries, meta) => {
        const total = await state(meta);
        if (total.migrated) return;
        for (const [key, value] of values)
          if (!(await request<CacheRecord | undefined>(entries.get(key))))
            await write(entries, total, key, value, limit);
        total.migrated = true;
        await request(meta.put(total, "state"));
      });
    },
  };
}

import type { AnalysisResult } from "../shared/contracts";
import {
  cleanComments,
  cleanPost,
  legacyEntries,
  postIdentity,
  type PostContent,
  type PostRecord,
  type PostSnapshot,
} from "./post-records";
export type { PostRecord } from "./post-records";

interface CacheState {
  bytes: number;
  clock: number;
  migrated: boolean;
  /** v2: every answer has a `postId` (possibly "" for an orphan). */
  backfillDone?: boolean;
  /** v2: exclusive primary-key cursor of the resumable backfill. */
  backfillAfter?: string;
  /** v2: the retired `superxHistory` was imported (or superseded by clear). */
  historyMigrated?: boolean;
}
export interface CacheRecord {
  key: string;
  value: AnalysisResult;
  bytes: number;
  provider: string;
  lastAccess: number;
  /** Absent only before the v2 backfill reached this answer. */
  postId?: string;
}
export interface ExportPost {
  url: string;
  text: string;
  author: string;
}
export interface CachePage {
  items: { key: string; value: unknown; post: ExportPost | null }[];
  next: string | null;
}
export interface RecordItem {
  post: PostRecord;
  answers: CacheRecord[];
}
export type RecordCursor = [number, string];
export interface RecordPage {
  items: RecordItem[];
  next: RecordCursor | null;
}
export interface CacheUsage {
  bytes: number;
  records: number;
  answers: number;
}
export interface KeyMetadata {
  postUrl: string | null;
  language: string | null;
  provider: string | null;
  model: string | null;
  reasoningEffort: string | null;
  /** OAuth credential or public X profile marker; never exported. */
  account: string | null;
}
interface Stores {
  answers: IDBObjectStore;
  meta: IDBObjectStore;
  posts: IDBObjectStore;
}

export const RECORD_PAGE_SIZE = 50;
const SEARCH_POST_BUDGET = 2000,
  SEARCH_BYTE_BUDGET = 8 * 1024 * 1024,
  BACKFILL_BATCH = 128;

function identity(key: string): readonly unknown[] {
  try {
    const value: unknown = JSON.parse(key);
    return Array.isArray(value) ? (value as unknown[]) : [];
  } catch {
    return [];
  }
}
function parsedArray(value: unknown): unknown[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as unknown[]) : null;
  } catch {
    return null;
  }
}
export function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
export function provider(value: unknown): string | null {
  return value === "api" ||
    value === "oauth" ||
    value === "build" ||
    value === "x-native"
    ? value
    : null;
}
function effort(value: unknown): string | null {
  return typeof value === "string" &&
    [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ].includes(value)
    ? value
    : null;
}
export function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || /[\u0000- \u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function postUrl(value: unknown): string | null {
  const safe = httpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (
    !["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(
      url.hostname,
    ) ||
    url.port ||
    !/^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/\d+\/?$/u.test(url.pathname)
  )
    return null;
  // The public post identity does not need query parameters or a fragment.
  return `${url.protocol}//${url.hostname}${url.pathname}`;
}
/** Parses only the known current cache key versions. Export and the records
 * page share this owner; it never guesses older key layouts. */
export function keyMetadata(key: string): KeyMetadata {
  const empty: KeyMetadata = {
    postUrl: null,
    language: null,
    provider: null,
    model: null,
    reasoningEffort: null,
    account: null,
  };
  const parts = parsedArray(key);
  if (!parts) return empty;
  if (
    parts.length === 9 &&
    parts[0] === "SuperX-native-answers-v1" &&
    parts[1] === "x-native" &&
    typeof parts[2] === "string" &&
    typeof parts[4] === "string" &&
    typeof parts[5] === "string" &&
    parts[6] === "native-prompt-v1-fast-markdown-format" &&
    typeof parts[7] === "string" &&
    parts[8] === "fast"
  ) {
    return {
      postUrl: postUrl(parts[3]),
      language: string(parts[5]),
      provider: "x-native",
      model: "fast",
      reasoningEffort: null,
      account: string(parts[2]),
    };
  }
  if (
    parts.length !== 13 ||
    parts[0] !== "GrokFirst-v1" ||
    !["api", "oauth", "build"].includes(String(parts[1])) ||
    typeof parts[3] !== "string" ||
    typeof parts[4] !== "boolean" ||
    typeof parts[5] !== "boolean" ||
    parts[6] !== "api-v11-context-images" ||
    !["preset", "custom"].includes(String(parts[7])) ||
    parts[8] !== "only" ||
    parts[10] !== "fact-check-prompts-v2-deeper" ||
    typeof parts[11] !== "string" ||
    !effort(parts[12])
  )
    return empty;
  let model: string | null,
    account: string | null = null;
  const credential = parts[2];
  if (parts[1] === "api") {
    if (typeof credential !== "string") return empty;
    model = string(credential);
  } else if (parts[1] === "oauth") {
    if (
      !Array.isArray(credential) ||
      credential.length !== 2 ||
      (credential[0] !== null && typeof credential[0] !== "string") ||
      typeof credential[1] !== "string"
    )
      return empty;
    model = string(credential[1]);
    account = string(credential[0]);
  } else {
    if (
      !Array.isArray(credential) ||
      credential.length !== 3 ||
      credential[0] !== "official-ws-v1" ||
      typeof credential[1] !== "number" ||
      !Number.isFinite(credential[1]) ||
      typeof credential[2] !== "string"
    )
      return empty;
    model = string(credential[2]);
  }
  const input = parsedArray(parts[9]);
  if (
    !input ||
    input.length !== 4 ||
    input[0] !== "post-input-v4-source-full-url" ||
    input[1] !== parts[1] ||
    typeof input[3] !== "string"
  )
    return empty;
  return {
    postUrl: postUrl(input[2]),
    language: string(input[3]),
    provider: provider(parts[1]),
    model,
    reasoningEffort: effort(parts[12]),
    account,
  };
}
/** The post a cached answer belongs to. Unlike `keyMetadata` this accepts
 * earlier prompt/settings versions: only the URL position must be known. */
export function keyPost(key: string): { id: string; url: string } | null {
  const parts = parsedArray(key);
  if (!parts) return null;
  if (
    typeof parts[0] === "string" &&
    parts[0].startsWith("SuperX-native-answers-") &&
    parts[1] === "x-native"
  )
    return postIdentity(parts[3]);
  if (parts[0] !== "GrokFirst-v1") return null;
  const input = parsedArray(parts[9]);
  return input ? postIdentity(input[2]) : null;
}

// Persistent byte accounting covers both stores' logical content.
export const byteSize = (key: string, value: unknown): number =>
  new TextEncoder().encode(JSON.stringify([key, value])).byteLength;
function content(record: PostRecord): PostContent {
  const { id, activityAt, lastUsed, bytes, ...rest } = record;
  return rest;
}
/** Bookkeeping (`activityAt`, `lastUsed`, `bytes`) is not counted. */
export const postBytes = (record: PostRecord): number =>
  byteSize(record.id, content(record));
const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
function completedAt(value: unknown): number {
  const raw =
    value && typeof value === "object" && "completedAt" in value
      ? value.completedAt
      : undefined;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}
function hasSnapshot(record: PostContent) {
  return typeof record.text === "string";
}
function first<T>(
  source: IDBObjectStore | IDBIndex,
  range?: IDBKeyRange | IDBValidKey,
  direction?: IDBCursorDirection,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = source.openCursor(range, direction);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result?.value as T | undefined);
  });
}
function collect<T>(
  source: IDBObjectStore | IDBIndex,
  count: number,
  range?: IDBKeyRange,
  direction?: IDBCursorDirection,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const items: T[] = [],
      req = source.openCursor(range, direction);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || items.length >= count) {
        resolve(items);
        return;
      }
      items.push(cursor.value as T);
      cursor.continue();
    };
  });
}
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
        const req = indexedDB.open(name, 2);
        // Only schema changes run here. A failure rolls the upgrade back; the
        // answer backfill runs later in small resumable transactions.
        req.onupgradeneeded = (event) => {
          const db = req.result,
            old = event.oldVersion;
          const entries =
            old < 1
              ? db.createObjectStore("answers", { keyPath: "key" })
              : req.transaction!.objectStore("answers");
          if (old < 1) {
            entries.createIndex("lastAccess", "lastAccess");
            entries.createIndex("provider", "provider");
            db.createObjectStore("meta");
          }
          if (old < 2) {
            entries.createIndex("postId", "postId");
            entries.createIndex("postLastAccess", ["postId", "lastAccess"]);
            const posts = db.createObjectStore("posts", { keyPath: "id" });
            posts.createIndex("lastUsed", "lastUsed");
            posts.createIndex("activity", ["activityAt", "id"]);
          }
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
    work: (stores: Stores) => Promise<T>,
  ): Promise<T> {
    const db = await open(),
      tx = db.transaction(["answers", "meta", "posts"], mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error || new Error("Answer cache transaction aborted."));
      tx.onerror = () => {};
    });
    const stores = {
      answers: tx.objectStore("answers"),
      meta: tx.objectStore("meta"),
      posts: tx.objectStore("posts"),
    };
    try {
      const result = await work(stores);
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
  function range(): typeof IDBKeyRange {
    if (!keyRange) throw new Error("IDBKeyRange is required for this cursor.");
    return keyRange;
  }
  const state = async (meta: IDBObjectStore): Promise<CacheState> =>
    (await request<CacheState | undefined>(meta.get("state"))) || {
      bytes: 0,
      clock: 0,
      migrated: false,
    };
  async function storePost(
    s: Stores,
    total: CacheState,
    next: PostRecord,
    previous: PostRecord | undefined,
  ) {
    next.bytes = postBytes(next);
    total.bytes += next.bytes - (previous?.bytes || 0);
    await request(s.posts.put(next));
  }
  /** Creates or refreshes a post record; a snapshot fills only a missing one. */
  async function upsertPost(
    s: Stores,
    total: CacheState,
    identity: { id: string; url: string },
    update: {
      snapshot?: PostSnapshot | null;
      activityAt: number;
      lastUsed: number;
      comments?: ReturnType<typeof cleanComments>;
    },
  ) {
    const previous = await request<PostRecord | undefined>(
      s.posts.get(identity.id),
    );
    const next: PostRecord = previous
      ? { ...previous }
      : {
          id: identity.id,
          url: identity.url,
          activityAt: 0,
          lastUsed: 0,
          bytes: 0,
        };
    if (update.snapshot && !hasSnapshot(next))
      Object.assign(next, update.snapshot);
    if (update.comments) {
      delete next.commentsScope;
      delete next.commentsModel;
      delete next.commentsUsage;
      Object.assign(next, update.comments);
    }
    next.activityAt = Math.max(next.activityAt, update.activityAt);
    next.lastUsed = Math.max(next.lastUsed, update.lastUsed);
    await storePost(s, total, next, previous);
  }
  async function deleteGroup(s: Stores, total: CacheState, id: string) {
    const post = await request<PostRecord | undefined>(s.posts.get(id));
    await new Promise<void>((resolve, reject) => {
      const req = s.answers.index("postId").openCursor(id);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        total.bytes -= (cursor.value as CacheRecord).bytes;
        cursor.delete();
        cursor.continue();
      };
    });
    if (post) {
      total.bytes -= post.bytes;
      await request(s.posts.delete(id));
    }
    return Boolean(post);
  }
  /** Invariant: a post keeps at least one answer or its comments. */
  async function pruneEmpty(s: Stores, total: CacheState, ids: Set<string>) {
    for (const id of ids) {
      if (!id) continue;
      const post = await request<PostRecord | undefined>(s.posts.get(id));
      if (!post || post.comments?.length) continue;
      if (await request(s.answers.index("postId").count(id))) continue;
      total.bytes -= post.bytes;
      await request(s.posts.delete(id));
    }
  }
  async function evict(s: Stores, total: CacheState, limit: number) {
    if (total.bytes <= limit) return;
    const touched = new Set<string>();
    // Before the backfill finishes some answers have no post yet, so they are
    // evicted by the v1 rule rather than being mistaken for orphans.
    const backfilled = total.backfillDone === true;
    await new Promise<void>((resolve, reject) => {
      const req = backfilled
        ? s.answers.index("postLastAccess").openCursor()
        : s.answers.index("lastAccess").openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        const entry = cursor?.value as CacheRecord | undefined;
        // "" sorts before every status id: orphans come first, oldest first.
        if (!cursor || total.bytes <= limit || (backfilled && entry!.postId)) {
          resolve();
          return;
        }
        if (entry!.postId) touched.add(entry!.postId);
        total.bytes -= entry!.bytes;
        cursor.delete();
        cursor.continue();
      };
    });
    await pruneEmpty(s, total, touched);
    while (total.bytes > limit) {
      const oldest = await first<PostRecord>(s.posts.index("lastUsed"));
      if (!oldest) break;
      await deleteGroup(s, total, oldest.id);
    }
  }
  async function write(
    s: Stores,
    total: CacheState,
    key: string,
    value: AnalysisResult,
    limit: number,
    post?: unknown,
  ): Promise<boolean> {
    const bytes = byteSize(key, value);
    if (bytes > limit) {
      await evict(s, total, limit);
      return false;
    } // Preserve a fitting successful answer.
    const previous = await request<CacheRecord | undefined>(s.answers.get(key));
    const snapshot = post === undefined ? null : cleanPost(post);
    const owner = snapshot
      ? { id: snapshot.id, url: snapshot.url }
      : keyPost(key);
    total.bytes += bytes - (previous?.bytes || 0);
    const partition = identity(key)[1],
      providerName =
        value.provider || (typeof partition === "string" ? partition : "");
    const lastAccess = ++total.clock;
    await request(
      s.answers.put({
        key,
        value,
        bytes,
        provider: providerName,
        lastAccess,
        postId: owner?.id || "",
      }),
    );
    if (owner) {
      let clean: PostSnapshot | null = null;
      if (snapshot) {
        const { id, ...rest } = snapshot;
        clean = rest;
      }
      await upsertPost(s, total, owner, {
        snapshot: clean,
        activityAt: completedAt(value),
        lastUsed: lastAccess,
      });
    }
    if (previous?.postId && previous.postId !== owner?.id)
      await pruneEmpty(s, total, new Set([previous.postId]));
    await evict(s, total, limit);
    return true;
  }
  /** Search matches the saved snapshot, author and answer/comment text. */
  function matches(item: RecordItem, needle: string) {
    const fields = [
      item.post.text,
      item.post.author,
      ...(item.post.comments || []),
      ...item.answers.map((answer) => answer.value?.text),
    ];
    return fields.some(
      (value) =>
        typeof value === "string" && value.toLocaleLowerCase().includes(needle),
    );
  }
  async function answersOf(s: Stores, id: string) {
    const list = await request<CacheRecord[]>(
      s.answers.index("postId").getAll(id),
    );
    return list.sort(
      (a, b) =>
        completedAt(b.value) - completedAt(a.value) ||
        b.lastAccess - a.lastAccess,
    );
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
      return transaction("readonly", async (s) => {
        const owners: (string | undefined)[] = [];
        const page = await new Promise<CachePage>((resolve, reject) => {
          if (after !== undefined && !keyRange) {
            reject(new Error("IDBKeyRange is required for cache pagination."));
            return;
          }
          const req = s.answers.openCursor(
            after === undefined ? undefined : keyRange!.lowerBound(after, true),
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
            const postId =
              raw && typeof raw === "object" && "postId" in raw
                ? raw.postId
                : undefined;
            owners.push(typeof postId === "string" ? postId : undefined);
            items.push({ key: cursor.primaryKey, value, post: null });
            bytes += size;
            cursor.continue();
          };
        });
        // Snapshots come from the same read-only transaction as the answers.
        for (const [index, item] of page.items.entries()) {
          const id = owners[index];
          if (!id) continue;
          const post = await request<PostRecord | undefined>(s.posts.get(id));
          if (post && hasSnapshot(post))
            item.post = {
              url: post.url,
              text: post.text || "",
              author: post.author || "",
            };
        }
        return page;
      });
    },
    ready() {
      return transaction("readonly", async (s) => {
        await state(s.meta);
        return true;
      });
    },
    get(key: string) {
      return transaction("readwrite", async (s) => {
        const entry = await request<CacheRecord | undefined>(
          s.answers.get(key),
        );
        if (!entry) return null;
        const total = await state(s.meta);
        entry.lastAccess = ++total.clock;
        await request(s.answers.put(entry));
        if (entry.postId) {
          const post = await request<PostRecord | undefined>(
            s.posts.get(entry.postId),
          );
          if (post) {
            post.lastUsed = entry.lastAccess;
            await request(s.posts.put(post));
          }
        }
        await request(s.meta.put(total, "state"));
        return entry.value;
      });
    },
    /** `post` is the job's visible snapshot; without it the key's URL is used. */
    put(key: string, value: AnalysisResult, limit: number, post?: unknown) {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta),
          stored = await write(s, total, key, value, limit, post);
        await request(s.meta.put(total, "state"));
        return stored;
      });
    },
    /** Latest completed comments for a post; creates a record when needed. */
    putComments(post: unknown, comments: unknown, limit: number, now: number) {
      return transaction("readwrite", async (s) => {
        const snapshot = cleanPost(post),
          clean = cleanComments(comments, now);
        if (!snapshot || !clean) return false;
        const total = await state(s.meta),
          { id, ...rest } = snapshot;
        await upsertPost(
          s,
          total,
          { id, url: snapshot.url },
          {
            snapshot: rest,
            comments: clean,
            activityAt: clean.commentsCompletedAt,
            lastUsed: ++total.clock,
          },
        );
        await evict(s, total, limit);
        await request(s.meta.put(total, "state"));
        return true;
      });
    },
    trim(limit: number) {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta);
        await evict(s, total, limit);
        await request(s.meta.put(total, "state"));
      });
    },
    clear() {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta);
        await request(s.answers.clear());
        await request(s.posts.clear());
        total.bytes = 0;
        total.migrated = true;
        total.backfillDone = true;
        delete total.backfillAfter;
        // Clearing records also supersedes the retired history import.
        total.historyMigrated = true;
        await request(s.meta.put(total, "state"));
      });
    },
    /** Removes one post record and all of its answer versions. */
    deletePost(id: string) {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta),
          deleted = await deleteGroup(s, total, id);
        await request(s.meta.put(total, "state"));
        return deleted;
      });
    },
    removeProvider(providerName: string, keepCredential?: string) {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta),
          touched = new Set<string>();
        await new Promise<void>((resolve, reject) => {
          const req = s.answers.index("provider").openCursor(providerName);
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
              const entry = cursor.value as CacheRecord;
              if (entry.postId) touched.add(entry.postId);
              total.bytes -= entry.bytes;
              cursor.delete();
            }
            cursor.continue();
          };
        });
        await pruneEmpty(s, total, touched);
        await request(s.meta.put(total, "state"));
        return touched.size > 0;
      });
    },
    migrate(
      values: readonly (readonly [string, AnalysisResult])[],
      limit: number,
    ) {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta);
        if (total.migrated) return;
        for (const [key, value] of values)
          if (!(await request<CacheRecord | undefined>(s.answers.get(key))))
            await write(s, total, key, value, limit);
        total.migrated = true;
        await request(s.meta.put(total, "state"));
      });
    },
    /** One resumable v2 backfill batch. Resolves true once every answer has
     * a `postId`; a post record without a snapshot is created per status. */
    backfill(batch = BACKFILL_BATCH) {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta);
        if (total.backfillDone) return true;
        const list = await collect<CacheRecord>(
          s.answers,
          batch,
          total.backfillAfter === undefined
            ? undefined
            : range().lowerBound(total.backfillAfter, true),
        );
        for (const entry of list) {
          if (typeof entry.postId === "string") continue;
          const owner = keyPost(entry.key);
          entry.postId = owner?.id || "";
          await request(s.answers.put(entry));
          if (owner)
            await upsertPost(s, total, owner, {
              activityAt: completedAt(entry.value),
              lastUsed: entry.lastAccess,
            });
        }
        if (list.length < batch) {
          total.backfillDone = true;
          delete total.backfillAfter;
        } else total.backfillAfter = list[list.length - 1]!.key;
        await request(s.meta.put(total, "state"));
        return total.backfillDone === true;
      });
    },
    /** Imports the retired 24-hour history once, after the backfill. Only
     * entries that already have a cached answer or saved comments survive. */
    migrateHistory(input: unknown, now: number, limit: number) {
      return transaction("readwrite", async (s) => {
        const total = await state(s.meta);
        if (total.historyMigrated) return "done" as const;
        if (!total.backfillDone) return "pending" as const;
        for (const entry of legacyEntries(input, now)) {
          const known =
            Boolean(await request(s.posts.get(entry.id))) ||
            (await request(s.answers.index("postId").count(entry.id))) > 0;
          if (!known && !entry.comments) continue;
          await upsertPost(
            s,
            total,
            { id: entry.id, url: entry.snapshot.url },
            {
              snapshot: entry.snapshot,
              ...(entry.comments ? { comments: entry.comments } : {}),
              activityAt: entry.comments?.commentsCompletedAt || 0,
              lastUsed: ++total.clock,
            },
          );
        }
        await evict(s, total, limit);
        total.historyMigrated = true;
        await request(s.meta.put(total, "state"));
        return "done" as const;
      });
    },
    /** One read-only transaction: the atomic byte counter plus store counts. */
    usage(): Promise<CacheUsage> {
      return transaction("readonly", async (s) => {
        const total = await state(s.meta);
        return {
          bytes: Math.max(0, total.bytes),
          records: await request(s.posts.count()),
          answers: await request(s.answers.count()),
        };
      });
    },
    /** Newest-first record pages by the `[activityAt, id]` index. A search
     * scans at most 2000 posts or 8 MB per request and returns its cursor. */
    records({
      after,
      query = "",
      limit = RECORD_PAGE_SIZE,
    }: {
      after?: RecordCursor;
      query?: string;
      limit?: number;
    } = {}): Promise<RecordPage> {
      const size = Math.max(1, Math.min(RECORD_PAGE_SIZE, Math.floor(limit)));
      const needle = query.trim().toLocaleLowerCase();
      return transaction("readonly", async (s) => {
        const index = s.posts.index("activity"),
          items: RecordItem[] = [];
        let cursor: RecordCursor | undefined = after,
          scanned = 0,
          bytes = 0;
        for (;;) {
          const posts = await collect<PostRecord>(
            index,
            needle ? 100 : size + 1,
            cursor === undefined ? undefined : range().upperBound(cursor, true),
            "prev",
          );
          for (const [position, post] of posts.entries()) {
            if (!needle && position === size)
              return { items, next: cursor ?? null };
            const item = { post, answers: await answersOf(s, post.id) };
            cursor = [post.activityAt, post.id];
            if (!needle) {
              items.push(item);
              continue;
            }
            scanned++;
            bytes += item.answers.reduce(
              (sum, answer) => sum + answer.bytes,
              post.bytes,
            );
            if (matches(item, needle)) items.push(item);
            if (
              items.length >= size ||
              scanned >= SEARCH_POST_BUDGET ||
              bytes >= SEARCH_BYTE_BUDGET
            )
              return { items, next: cursor };
          }
          if (!needle || posts.length < 100) return { items, next: null };
        }
      });
    },
  };
}

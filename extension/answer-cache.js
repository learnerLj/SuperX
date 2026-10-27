// GENERATED from src/background/answer-cache.ts. Edit src/ and run npm run build.
"use strict";
var SuperXAnswerCache = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/background/answer-cache.ts
  var answer_cache_exports = {};
  __export(answer_cache_exports, {
    byteSize: () => byteSize,
    create: () => create
  });
  function identity(key) {
    try {
      const value = JSON.parse(key);
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }
  var byteSize = (key, value) => new TextEncoder().encode(JSON.stringify([key, value])).byteLength;
  var request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  function create({
    indexedDB,
    name = "SuperXAnswers"
  }) {
    let opening;
    function open() {
      if (!opening)
        opening = new Promise((resolve, reject) => {
          const req = indexedDB.open(name, 1);
          req.onupgradeneeded = () => {
            const entries = req.result.createObjectStore("answers", {
              keyPath: "key"
            });
            entries.createIndex("lastAccess", "lastAccess");
            entries.createIndex("provider", "provider");
            req.result.createObjectStore("meta");
          };
          req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => {
              db.close();
              opening = void 0;
            };
            resolve(db);
          };
          req.onerror = () => {
            opening = void 0;
            reject(req.error);
          };
        });
      return opening;
    }
    async function transaction(mode, work) {
      const db = await open(), tx = db.transaction(["answers", "meta"], mode);
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error("Answer cache transaction aborted."));
        tx.onerror = () => {
        };
      });
      const entries = tx.objectStore("answers"), meta = tx.objectStore("meta");
      try {
        const result = await work(entries, meta);
        await done;
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {
        }
        await done.catch(() => {
        });
        throw error;
      }
    }
    const state = async (meta) => await request(meta.get("state")) || {
      bytes: 0,
      clock: 0,
      migrated: false
    };
    async function evict(entries, total, limit) {
      if (total.bytes <= limit) return;
      await new Promise((resolve, reject) => {
        const req = entries.index("lastAccess").openCursor();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor || total.bytes <= limit) {
            resolve();
            return;
          }
          total.bytes -= cursor.value.bytes;
          cursor.delete();
          cursor.continue();
        };
      });
    }
    async function write(entries, total, key, value, limit) {
      const bytes = byteSize(key, value);
      if (bytes > limit) {
        await evict(entries, total, limit);
        return false;
      }
      const previous = await request(entries.get(key));
      total.bytes += bytes - (previous?.bytes || 0);
      const partition = identity(key)[1], provider = value.provider || (typeof partition === "string" ? partition : "");
      await request(
        entries.put({ key, value, bytes, provider, lastAccess: ++total.clock })
      );
      await evict(entries, total, limit);
      return true;
    }
    return {
      ready() {
        return transaction("readonly", async (_, meta) => {
          await state(meta);
          return true;
        });
      },
      get(key) {
        return transaction("readwrite", async (entries, meta) => {
          const entry = await request(entries.get(key));
          if (!entry) return null;
          const total = await state(meta);
          entry.lastAccess = ++total.clock;
          await request(entries.put(entry));
          await request(meta.put(total, "state"));
          return entry.value;
        });
      },
      put(key, value, limit) {
        return transaction("readwrite", async (entries, meta) => {
          const total = await state(meta), stored = await write(entries, total, key, value, limit);
          await request(meta.put(total, "state"));
          return stored;
        });
      },
      trim(limit) {
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
      removeProvider(provider, keepCredential) {
        return transaction("readwrite", async (entries, meta) => {
          const total = await state(meta);
          await new Promise((resolve, reject) => {
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
                total.bytes -= cursor.value.bytes;
                cursor.delete();
              }
              cursor.continue();
            };
          });
          await request(meta.put(total, "state"));
        });
      },
      migrate(values, limit) {
        return transaction("readwrite", async (entries, meta) => {
          const total = await state(meta);
          if (total.migrated) return;
          for (const [key, value] of values)
            if (!await request(entries.get(key)))
              await write(entries, total, key, value, limit);
          total.migrated = true;
          await request(meta.put(total, "state"));
        });
      }
    };
  }
  return __toCommonJS(answer_cache_exports);
})();
if (typeof module === "object" && module.exports) module.exports = SuperXAnswerCache;

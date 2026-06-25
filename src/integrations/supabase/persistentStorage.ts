// Custom Supabase auth storage adapter that mirrors the session into IndexedDB
// in addition to localStorage. This rescues the anonymous account from a
// localStorage-only wipe (e.g. our in-app reset or a partial site-data clear).
// A full "clear all site data" still wipes both stores — that's expected.

const DB_NAME = "poketrivia-auth";
const STORE_NAME = "kv";
const DB_VERSION = 1;

type IDBLike = IDBFactory;

function getIDB(): IDBLike | null {
  if (typeof window === "undefined") return null;
  const idb = (window as unknown as { indexedDB?: IDBFactory }).indexedDB;
  return idb ?? null;
}

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const idb = getIDB();
    if (!idb) {
      resolve(null);
      return;
    }
    try {
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === "string" ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbRemove(key: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}
function lsRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export interface PersistentStorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export function createPersistentAuthStorage(): PersistentStorageAdapter | undefined {
  if (typeof window === "undefined") return undefined;

  return {
    async getItem(key: string): Promise<string | null> {
      const fromLS = lsGet(key);
      if (fromLS !== null) return fromLS;
      const fromIDB = await idbGet(key);
      if (fromIDB !== null) {
        // Rehydrate localStorage so supabase-js's sync paths still work.
        lsSet(key, fromIDB);
        return fromIDB;
      }
      return null;
    },
    async setItem(key: string, value: string): Promise<void> {
      lsSet(key, value);
      await idbSet(key, value);
    },
    async removeItem(key: string): Promise<void> {
      lsRemove(key);
      await idbRemove(key);
    },
  };
}

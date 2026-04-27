/**
 * IndexedDB-backed offline queue for mutations that must survive being
 * offline (photo reports from the field, time logs, comments).
 *
 * Client-only. Each entry holds the request URL, method, headers, and a
 * serialized body (Blob/FormData kept as ArrayBuffer for IDB durability).
 *
 * Drain strategy: call `flushQueue()` on online events and on app load.
 * Failed entries stay queued until next attempt.
 */

const DB_NAME = "metrum-offline";
const DB_VERSION = 1;
const STORE = "queue";

type QueuedRequest = {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: ArrayBuffer | null;
  contentType: string | null;
  createdAt: number;
  attempts: number;
};

function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    Promise.resolve(fn(store)).then(resolve, reject);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function enqueueRequest(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  if (!isClient()) return;
  const req = new Request(input, init);
  const body = req.body ? await req.clone().arrayBuffer() : null;
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  const entry: QueuedRequest = {
    url: req.url,
    method: req.method,
    headers,
    body,
    contentType: req.headers.get("content-type"),
    createdAt: Date.now(),
    attempts: 0,
  };

  await tx("readwrite", (store) => {
    store.add(entry);
  });
}

export async function pendingCount(): Promise<number> {
  if (!isClient()) return 0;
  return tx("readonly", (store) =>
    new Promise<number>((resolve, reject) => {
      const r = store.count();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    })
  );
}

async function listAll(): Promise<QueuedRequest[]> {
  return tx("readonly", (store) =>
    new Promise<QueuedRequest[]>((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result as QueuedRequest[]);
      r.onerror = () => reject(r.error);
    })
  );
}

async function remove(id: number): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}

async function bumpAttempts(id: number, attempts: number): Promise<void> {
  await tx("readwrite", (store) =>
    new Promise<void>((resolve, reject) => {
      const r = store.get(id);
      r.onsuccess = () => {
        const entry = r.result as QueuedRequest | undefined;
        if (!entry) return resolve();
        entry.attempts = attempts;
        const u = store.put(entry);
        u.onsuccess = () => resolve();
        u.onerror = () => reject(u.error);
      };
      r.onerror = () => reject(r.error);
    })
  );
}

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (!isClient() || !navigator.onLine) return { sent: 0, failed: 0 };

  const pending = await listAll();
  let sent = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body ?? undefined,
      });
      if (res.ok) {
        await remove(entry.id!);
        sent += 1;
      } else if (res.status >= 400 && res.status < 500) {
        // 4xx — won't succeed on retry, drop
        await remove(entry.id!);
        failed += 1;
      } else {
        await bumpAttempts(entry.id!, entry.attempts + 1);
        failed += 1;
      }
    } catch {
      await bumpAttempts(entry.id!, entry.attempts + 1);
      failed += 1;
    }
  }

  return { sent, failed };
}

export function installAutoFlush(): () => void {
  if (!isClient()) return () => {};
  const handler = () => {
    void flushQueue();
  };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

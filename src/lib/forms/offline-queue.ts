/**
 * Site Forms Builder — IndexedDB outbox для foreman PWA.
 *
 * Окрема БД `metrum-forms-outbox` (не змішуємо з src/lib/pwa/offline-queue
 * — інша cadence schema). Підтримує:
 *  - enqueue(record) — додає одну форму у чергу;
 *  - listPending() — перелік для UI у /foreman/forms/queue;
 *  - flush(triggerSource) — обходить чергу, POST-ить, видаляє успішні;
 *  - autoFlushOnOnline() — bind на window.online + sw `sync`.
 *
 * Idempotency: кожен запис має stable `clientUuid` (UUID v4). Сервер
 * upsert-ить по unique у БД, тому повторні POST-и не створюють дублікатів.
 *
 * TTL: записи у статусі DRAFT (не sent через сервер) автопурджаться через
 * 30 днів (Open Question — підтвердити).
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "metrum-forms-outbox";
const DB_VERSION = 1;
const STORE = "submissions";

export type OutboxStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED";

export type OutboxRecord = {
  clientUuid: string;
  templateId: string;
  templateVersion: number;
  projectId: string | null;
  taskId: string | null;
  foremanReportId: string | null;
  data: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

interface FormsOutboxDB extends DBSchema {
  [STORE]: {
    key: string; // clientUuid
    value: OutboxRecord;
    indexes: { "by-status": OutboxStatus; "by-createdAt": number };
  };
}

let dbPromise: Promise<IDBPDatabase<FormsOutboxDB>> | null = null;

function getDb(): Promise<IDBPDatabase<FormsOutboxDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB недоступний (SSR?)"));
  }
  if (!dbPromise) {
    dbPromise = openDB<FormsOutboxDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: "clientUuid" });
          store.createIndex("by-status", "status");
          store.createIndex("by-createdAt", "createdAt");
        }
        // Майбутні upgrade-и: if (oldVersion < 2) { ... }
      },
    });
  }
  return dbPromise;
}

export function makeClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  // Fallback: RFC 4122-ish v4
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function enqueue(record: Omit<
  OutboxRecord,
  "status" | "attempts" | "lastError" | "createdAt" | "updatedAt"
>): Promise<OutboxRecord> {
  const db = await getDb();
  const now = Date.now();
  const full: OutboxRecord = {
    ...record,
    status: "PENDING",
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put(STORE, full);
  return full;
}

export async function listPending(): Promise<OutboxRecord[]> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  return all
    .filter((r) => r.status !== "SENT")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listAll(): Promise<OutboxRecord[]> {
  const db = await getDb();
  return db.getAll(STORE);
}

export async function remove(clientUuid: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, clientUuid);
}

const MAX_ATTEMPTS = 5;

/**
 * Прохід черги. Повертає підсумок. Не throw-ить — кожен запис обробляється
 * незалежно. Виклик: window 'online' event, SW 'sync' event tag forms-outbox,
 * ручний кнопка у /foreman/forms/queue.
 */
export async function flush(): Promise<{
  sent: number;
  failed: number;
  remaining: number;
}> {
  const db = await getDb();
  const records = await listPending();
  let sent = 0;
  let failed = 0;

  for (const rec of records) {
    if (rec.attempts >= MAX_ATTEMPTS) {
      failed += 1;
      continue;
    }
    await db.put(STORE, { ...rec, status: "SENDING", updatedAt: Date.now() });
    try {
      const res = await fetch("/api/foreman/form-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientUuid: rec.clientUuid,
          templateId: rec.templateId,
          templateVersion: rec.templateVersion,
          projectId: rec.projectId,
          taskId: rec.taskId,
          foremanReportId: rec.foremanReportId,
          data: rec.data,
        }),
      });
      if (res.ok) {
        // Успішно — видаляємо з outbox (історія є на сервері).
        await remove(rec.clientUuid);
        sent += 1;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        // 4xx (крім 408/429) — фатальна помилка, не ретраїм безкінечно.
        const body = await res.text().catch(() => "");
        await db.put(STORE, {
          ...rec,
          status: "FAILED",
          attempts: rec.attempts + 1,
          lastError: `${res.status}: ${body.slice(0, 200)}`,
          updatedAt: Date.now(),
        });
        failed += 1;
      } else {
        // 5xx / network — ретраїмо.
        await db.put(STORE, {
          ...rec,
          status: "PENDING",
          attempts: rec.attempts + 1,
          lastError: `${res.status}`,
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      // Мережа недоступна — лишаємо PENDING.
      await db.put(STORE, {
        ...rec,
        status: "PENDING",
        attempts: rec.attempts + 1,
        lastError: e instanceof Error ? e.message : "network",
        updatedAt: Date.now(),
      });
    }
  }

  const remaining = (await listPending()).length;
  return { sent, failed, remaining };
}

/** Bind на window 'online' event та реєструє SW background sync tag. */
export function autoFlushOnOnline(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    void flush();
  };
  window.addEventListener("online", handler);

  // SW message 'forms-outbox:flush' (надсилається з sync event)
  const swMessageHandler = (event: MessageEvent) => {
    if (event.data && event.data.type === "forms-outbox:flush") {
      void flush();
    }
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", swMessageHandler);
  }

  // Background Sync API — якщо доступно (Chrome, без Safari).
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    void navigator.serviceWorker.ready.then((reg) => {
      const withSync = reg as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      if (withSync.sync) {
        void withSync.sync.register("forms-outbox").catch(() => {});
      }
    });
  }

  return () => {
    window.removeEventListener("online", handler);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", swMessageHandler);
    }
  };
}

/** Утиліта для UI: лічильник pending. */
export async function countPending(): Promise<number> {
  return (await listPending()).length;
}

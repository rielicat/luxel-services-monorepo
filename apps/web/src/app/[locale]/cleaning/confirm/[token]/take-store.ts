const DB_NAME = 'luxel-walkthrough';
const STORE = 'takes';
const DB_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StoredTake {
  blob: Blob;
  contentType: string;
  seconds: number;
}

interface TakeRow extends StoredTake {
  savedAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function saveTake(token: string, take: StoredTake): Promise<void> {
  const row: TakeRow = { ...take, savedAt: Date.now() };
  await withStore('readwrite', (store) => store.put(row, token));
}

export async function dropTake(token: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(token));
}

export async function loadTake(token: string): Promise<StoredTake | null> {
  const row = await withStore<TakeRow>('readonly', (store) => store.get(token));
  if (!row || !(row.blob instanceof Blob) || !row.blob.size) return null;
  if (typeof row.savedAt !== 'number' || Date.now() - row.savedAt > MAX_AGE_MS) {
    await dropTake(token);
    return null;
  }
  return { blob: row.blob, contentType: row.contentType, seconds: row.seconds };
}

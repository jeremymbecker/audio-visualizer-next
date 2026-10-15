/** A user's own background, saved in this browser. */
export type StoredBackground = { id: string; name: string; blob: Blob; createdAt: number };

const DB_NAME = "audio-visualizer";
const STORE = "backgrounds";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listBackgrounds(): Promise<StoredBackground[]> {
  const all = await withStore("readonly", (store) => store.getAll() as IDBRequest<StoredBackground[]>);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveBackground(background: StoredBackground): Promise<void> {
  await withStore("readwrite", (store) => store.put(background));
}

export async function deleteBackground(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
// Small keep-for-later store in the browser (IndexedDB) for fetched forecasts (2026-11-02: faster reopening).
// Everything stays in this browser; if the browser blocks storage it silently does nothing.

const DB = 'windy-plugin-passage-plan';
const STORE = 'cache';
let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
    if (dbp) return dbp;
    dbp = new Promise(resolve => {
        try {
            if (typeof indexedDB === 'undefined') return resolve(null);
            const req = indexedDB.open(DB, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return dbp;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
    const db = await open();
    if (!db) return undefined;
    return new Promise(resolve => {
        try {
            const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            r.onsuccess = () => resolve(r.result as T | undefined);
            r.onerror = () => resolve(undefined);
        } catch {
            resolve(undefined);
        }
    });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
    const db = await open();
    if (!db) return;
    await new Promise<void>(resolve => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/** Remove entries older than `maxAgeMs` whose key starts with `prefix` (values must have a `fetchedAt` ms field) */
export async function idbPrune(prefix: string, maxAgeMs: number): Promise<void> {
    const db = await open();
    if (!db) return;
    await new Promise<void>(resolve => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            const st = tx.objectStore(STORE);
            const req = st.openCursor();
            req.onsuccess = () => {
                const c = req.result;
                if (!c) return;
                const k = String(c.key);
                const v = c.value as { fetchedAt?: number };
                if (k.startsWith(prefix) && (!v?.fetchedAt || Date.now() - v.fetchedAt > maxAgeMs)) c.delete();
                c.continue();
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

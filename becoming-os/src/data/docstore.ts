// Where records physically live. The engine talks to one small document
// interface; three implementations sit behind it:
//   • SharedPageStore — the claude.ai page's own database (synced, private
//     per person, nothing to set up)
//   • DeviceStore     — IndexedDB in this browser (works anywhere, offline)
//   • MemoryStore     — tests, and the last resort when the browser blocks storage

export interface StoredDoc {
  id: string;
  data: Record<string, unknown>;
}

export type StoreKind = "shared-page" | "device" | "memory";

export interface DocStore {
  readonly kind: StoreKind;
  /** Every document directly in a collection (odd-segment path). */
  list(collection: string): Promise<StoredDoc[]>;
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  /** Live updates for a collection (other devices or tabs). */
  watch(collection: string, onChange: (docs: StoredDoc[]) => void, onError?: (e: StorageError) => void): () => void;
}

export class StorageError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const parent = (path: string) => path.slice(0, path.lastIndexOf("/"));
const leaf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ───────────────────────────────────────────────────────────────── memory ──
export class MemoryStore implements DocStore {
  readonly kind: StoreKind = "memory";
  docs = new Map<string, Record<string, unknown>>();
  writes = 0;
  private watchers = new Map<string, Set<(docs: StoredDoc[]) => void>>();
  /** Test hook: make the next N writes fail. */
  failNext = 0;

  async list(collection: string) {
    return [...this.docs.entries()]
      .filter(([p]) => parent(p) === collection)
      .map(([p, data]) => ({ id: leaf(p), data: clone(data) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  async get(path: string) {
    const d = this.docs.get(path);
    return d ? clone(d) : null;
  }
  async set(path: string, data: Record<string, unknown>) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new StorageError("unavailable", "Simulated storage failure.");
    }
    this.writes++;
    this.docs.set(path, clone(data));
    this.notify(parent(path));
  }
  async remove(path: string) {
    this.docs.delete(path);
    this.notify(parent(path));
  }
  watch(collection: string, onChange: (docs: StoredDoc[]) => void) {
    const set = this.watchers.get(collection) ?? new Set();
    set.add(onChange);
    this.watchers.set(collection, set);
    return () => set.delete(onChange);
  }
  private notify(collection: string) {
    const ws = this.watchers.get(collection);
    if (ws?.size) this.list(collection).then((docs) => ws.forEach((w) => w(docs)));
  }
}

// ─────────────────────────────────────────────────────────────── device ──
const DB_NAME = "becoming-os";
const STORE = "docs";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "path" });
        s.createIndex("collection", "collection");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Storage is blocked by another tab."));
  });
}

const tx = <T,>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error ?? r.error);
    t.onabort = () => reject(t.error ?? new Error("Storage transaction aborted."));
  });

/** IndexedDB in this browser. Other tabs of the same app hear about changes. */
export class DeviceStore implements DocStore {
  readonly kind: StoreKind = "device";
  private channel: BroadcastChannel | null = null;
  private watchers = new Map<string, Set<(docs: StoredDoc[]) => void>>();

  private constructor(private db: IDBDatabase) {
    try {
      this.channel = new BroadcastChannel("becoming-os-device");
      this.channel.onmessage = (e) => {
        const c = (e.data as { collection?: string })?.collection;
        if (c && this.watchers.get(c)?.size) this.list(c).then((docs) => this.watchers.get(c)!.forEach((w) => w(docs)));
      };
    } catch {
      this.channel = null;
    }
  }

  static async open(): Promise<DeviceStore> {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable.");
    return new DeviceStore(await idb());
  }

  async list(collection: string) {
    const rows = await tx<{ path: string; data: Record<string, unknown> }[]>(this.db, "readonly", (s) =>
      s.index("collection").getAll(collection) as IDBRequest<{ path: string; data: Record<string, unknown> }[]>);
    return rows.map((r) => ({ id: leaf(r.path), data: r.data })).sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  async get(path: string) {
    const r = await tx<{ data: Record<string, unknown> } | undefined>(this.db, "readonly", (s) =>
      s.get(path) as IDBRequest<{ data: Record<string, unknown> } | undefined>);
    return r ? r.data : null;
  }
  async set(path: string, data: Record<string, unknown>) {
    try {
      await tx(this.db, "readwrite", (s) => s.put({ path, collection: parent(path), data: clone(data) }));
    } catch (e) {
      const name = (e as DOMException)?.name;
      throw new StorageError(name === "QuotaExceededError" ? "quota_exceeded" : "unavailable",
        name === "QuotaExceededError" ? "This device is out of storage space for BECOMING OS." : "Couldn't save on this device.");
    }
    this.channel?.postMessage({ collection: parent(path) });
  }
  async remove(path: string) {
    await tx(this.db, "readwrite", (s) => s.delete(path));
    this.channel?.postMessage({ collection: parent(path) });
  }
  watch(collection: string, onChange: (docs: StoredDoc[]) => void) {
    const set = this.watchers.get(collection) ?? new Set();
    set.add(onChange);
    this.watchers.set(collection, set);
    return () => set.delete(onChange);
  }
}

// ───────────────────────────────────────────────────────── shared page ──
interface DbSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface DbQuerySnap { docs: DbSnap[] }
interface DbQuery {
  where(f: string, op: string, v: unknown): DbQuery;
  orderBy(f: string, dir?: "asc" | "desc"): DbQuery;
  limit(n: number): DbQuery;
  get(): Promise<DbQuerySnap>;
  onSnapshot(next: (s: DbQuerySnap) => void, error?: (e: { code: string; message: string }) => void): () => void;
}
interface DbDoc {
  get(): Promise<DbSnap>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface ClaudeDb {
  doc(path: string): DbDoc;
  collection(path: string): DbQuery & { doc(id?: string): DbDoc };
}

const FRIENDLY: Record<string, string> = {
  invalid_argument: "This page doesn't let your account save here. Ask the owner to invite you as an Editor.",
  quota_exceeded: "The page's storage is full. Export a backup and remove old photos to make room.",
  resource_exhausted: "Saving too quickly. Waiting a moment before trying again.",
  unavailable: "Couldn't reach storage. Will keep trying.",
  revoked: "Access to this page changed. Reload to continue.",
};

function wrap(e: unknown): StorageError {
  const code = (e as { code?: string })?.code ?? "unavailable";
  return new StorageError(code, FRIENDLY[code] ?? (e as Error)?.message ?? "Storage error.");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The claude.ai page's database. Documents carry `_k` (their own id) so they can be paged in order. */
export class SharedPageStore implements DocStore {
  readonly kind: StoreKind = "shared-page";
  constructor(private db: ClaudeDb) {}

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "unavailable" || code === "resource_exhausted") {
        await sleep(400 + Math.random() * 900);
        try {
          return await fn();
        } catch (e2) {
          throw wrap(e2);
        }
      }
      throw wrap(e);
    }
  }

  async list(collection: string) {
    const out: StoredDoc[] = [];
    let after: string | null = null;
    for (;;) {
      let q = this.db.collection(collection).orderBy("_k").limit(500);
      if (after !== null) q = q.where("_k", ">", after);
      const snap = await this.retry(() => q.get());
      const docs = snap.docs.filter((d) => d.exists);
      out.push(...docs.map((d) => ({ id: d.id, data: d.data() ?? {} })));
      if (snap.docs.length < 500) break;
      after = snap.docs[snap.docs.length - 1].id;
    }
    return out;
  }
  async get(path: string) {
    const s = await this.retry(() => this.db.doc(path).get());
    return s.exists ? s.data() ?? null : null;
  }
  async set(path: string, data: Record<string, unknown>) {
    await this.retry(() => this.db.doc(path).set({ ...data, _k: leaf(path) }));
  }
  async remove(path: string) {
    await this.retry(() => this.db.doc(path).delete());
  }
  watch(collection: string, onChange: (docs: StoredDoc[]) => void, onError?: (e: StorageError) => void) {
    return this.db.collection(collection).onSnapshot(
      (snap) => onChange(snap.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: d.data() ?? {} }))),
      (e) => onError?.(wrap(e)),
    );
  }
}

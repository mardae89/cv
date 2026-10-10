// The storage engine. Every record for one person lives in memory, is
// validated here (uniqueness, parent links, the money rules), and is saved to
// a DocStore in month-sized chunks. Changes show on screen immediately; each
// mutation's promise resolves only once its chunks are actually stored, so a
// "Saved" message is never shown for data that didn't save.
import type { Profile } from "@/lib/types";
import type { DocStore, StoredDoc } from "./docstore";
import { StorageError } from "./docstore";
import {
  bucketOf, LIST_KEYS, SINGLE_DEFAULTS, SINGLE_KEYS, TABLES, validateRow, validateSingle, ValidationError,
  type ListKey, type Row, type SingleKey,
} from "./schema";

export interface EngineState {
  rev: number;
  profile: Profile;
  tables: Record<ListKey, Row[]>;
  singles: Record<SingleKey, Row | null>;
}

export interface SaveStatus {
  /** Chunks waiting to be stored. */
  pending: number;
  /** Last storage failure, cleared by the next successful save. */
  error: string | null;
  lastSavedAt: number | null;
}

export interface ExportFile {
  app: "becoming-os";
  version: 1;
  exported_at: string;
  profile: Profile;
  singles: Partial<Record<SingleKey, Row | null>>;
  tables: Partial<Record<ListKey, Row[]>>;
  images?: Record<string, string>;
}

const PAGE_CHARS = 150_000;
const CONCURRENCY = 6;

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) {
    try {
      return c.randomUUID();
    } catch {
      /* not a secure context */
    }
  }
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const nowIso = () => new Date().toISOString();
const emptyTables = () => Object.fromEntries(LIST_KEYS.map((k) => [k, [] as Row[]])) as Record<ListKey, Row[]>;
const emptySingles = () => Object.fromEntries(SINGLE_KEYS.map((k) => [k, null])) as Record<SingleKey, Row | null>;

const UNIQUE_MESSAGE: Partial<Record<ListKey, string>> = {
  weights: "There's already a weigh-in for that date — edit it instead.",
  checkins: "There's already a check-in for that date — edit it instead.",
  completions: "That habit is already checked off for that day.",
  restDays: "That day is already a rest day.",
  activityLogs: "That activity is already logged for that day — edit the count instead.",
  reviews: "There's already a review for that period.",
};

type BucketKey = string; // "t~<table>~<bucket>" | "s~<single>" | "profile"

function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export class Engine {
  private state: EngineState;
  private listeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();
  private status: SaveStatus = { pending: 0, error: null, lastSavedAt: null };
  private chains = new Map<BucketKey, Promise<void>>();
  private queued = new Map<BucketKey, Promise<void>>();
  private inflight = new Set<BucketKey>();
  private failed = new Set<BucketKey>();
  /** Page count and version last stored for each chunk, for cleanup and echo detection. */
  private stored = new Map<BucketKey, { pages: number; ver: string }>();
  private active = 0;
  private waiting: (() => void)[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 3000;
  private unwatch: (() => void) | null = null;
  readonly base: string;

  private constructor(readonly store: DocStore, readonly uid: string, profile: Profile) {
    this.base = `data/users/${uid}`;
    this.state = { rev: 0, profile, tables: emptyTables(), singles: emptySingles() };
  }

  /** Load everything this person has stored (creating a profile on first use). */
  static async open(store: DocStore, uid: string, init: { displayName: string; timezone: string }): Promise<Engine> {
    const tz = validTimeZone(init.timezone) ? init.timezone : "America/New_York";
    const fresh: Profile = {
      id: uid, display_name: init.displayName.slice(0, 60), timezone: tz, plan_preset: null, business_enabled: false,
      onboarding_done: false, demo_mode: false, demo_today: null, created_at: nowIso(),
    };
    const e = new Engine(store, uid, fresh);
    const docs = await store.list(e.base);
    e.hydrate(docs);
    if (!docs.some((d) => d.id === "profile")) {
      for (const k of SINGLE_KEYS) {
        if (k === "shareSettings" || k === "reminderSettings") e.state.singles[k] = { id: k, user_id: uid, ...SINGLE_DEFAULTS[k] };
      }
      await Promise.all([e.persist("profile"), e.persist("s~shareSettings"), e.persist("s~reminderSettings")]);
    }
    e.unwatch = store.watch(e.base, (all) => e.applyRemote(all));
    return e;
  }

  close() {
    this.unwatch?.();
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  // ─────────────────────────────────────────────────────────── reading ──
  getState = (): EngineState => this.state;
  getStatus = (): SaveStatus => this.status;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  subscribeStatus = (fn: () => void) => {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  };

  /** Resolves once every queued chunk has been stored (or failed). */
  async settled(): Promise<void> {
    while (this.queued.size || this.inflight.size) await Promise.allSettled([...this.chains.values()]);
  }

  // ───────────────────────────────────────────────────────── mutations ──
  async insert(table: ListKey, input: Record<string, unknown> | Record<string, unknown>[]): Promise<Row[]> {
    const rows = (Array.isArray(input) ? input : [input]).map((r) => this.prepare(table, r));
    let list = this.state.tables[table];
    for (const r of rows) {
      this.checkCross(table, r, list, null);
      list = [...list, r];
    }
    const keys = this.touch(table, rows);
    let next = { ...this.state.tables, [table]: list };
    next = this.applyCap(table, next, keys);
    this.commit({ tables: next });
    await this.persistAll(keys);
    return rows;
  }

  async update(table: ListKey, id: string, patch: Record<string, unknown>): Promise<Row> {
    const list = this.state.tables[table];
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) throw new ValidationError("That record no longer exists.");
    const before = list[i];
    const after: Row = { ...before, ...stripMeta(patch), id, updated_at: nowIso() } as Row;
    validateRow(table, after);
    this.checkCross(table, after, list, id);
    const next = [...list];
    next[i] = after;
    const keys = new Set([...this.touch(table, [before]), ...this.touch(table, [after])]);
    this.commit({ tables: { ...this.state.tables, [table]: next } });
    await this.persistAll(keys);
    return after;
  }

  async remove(table: ListKey, ids: string | string[]): Promise<void> {
    const targets = new Set(Array.isArray(ids) ? ids : [ids]);
    const tables = { ...this.state.tables };
    const keys = new Set<BucketKey>();
    const drop = (t: ListKey, gone: Set<string>) => {
      if (!gone.size) return;
      const removed = tables[t].filter((r) => gone.has(r.id));
      if (!removed.length) return;
      this.touch(t, removed).forEach((k) => keys.add(k));
      tables[t] = tables[t].filter((r) => !gone.has(r.id));
      // Children follow their parent: delete or unlink, as the schema says.
      for (const child of LIST_KEYS) {
        for (const p of TABLES[child].parents ?? []) {
          if (p.table !== t) continue;
          const affected = tables[child].filter((r) => gone.has(r[p.field] as string));
          if (!affected.length) continue;
          if (p.onDelete === "cascade") drop(child, new Set(affected.map((r) => r.id)));
          else {
            this.touch(child, affected).forEach((k) => keys.add(k));
            tables[child] = tables[child].map((r) => (gone.has(r[p.field] as string) ? { ...r, [p.field]: null } : r));
          }
        }
      }
    };
    drop(table, targets);
    if (!keys.size) return;
    this.commit({ tables });
    await this.persistAll(keys);
    if (table === "photos") await Promise.allSettled([...targets].map((id) => this.deleteImage(id)));
  }

  /** Insert, or merge into the row matching `conflict` fields (default: the table's first unique set). */
  async upsert(table: ListKey, row: Record<string, unknown>, conflict?: string[]): Promise<Row> {
    const keysFor = conflict ?? TABLES[table].unique?.[0];
    const existing = keysFor ? this.state.tables[table].find((r) => keysFor.every((k) => r[k] === row[k])) : undefined;
    if (existing) return this.update(table, existing.id, row);
    return (await this.insert(table, row))[0];
  }

  async saveSingle(key: SingleKey, patch: Record<string, unknown>): Promise<Row> {
    const before = this.state.singles[key] ?? { id: key, user_id: this.uid, ...SINGLE_DEFAULTS[key] };
    const after = { ...before, ...stripMeta(patch), id: key, user_id: this.uid, updated_at: nowIso() } as Row;
    validateSingle(key, after);
    this.commit({ singles: { ...this.state.singles, [key]: after } });
    await this.persist(`s~${key}`);
    return after;
  }

  async saveProfile(patch: Partial<Profile>): Promise<void> {
    const next = { ...this.state.profile, ...patch, id: this.uid };
    if (!validTimeZone(next.timezone)) throw new ValidationError(`Unknown time zone: ${next.timezone}`);
    if (typeof next.display_name === "string") next.display_name = next.display_name.slice(0, 60);
    this.commit({ profile: next });
    await this.persist("profile");
  }

  /** Load many rows at once (demo data, imports) with the same row rules. */
  async bulk(plan: { tables?: Partial<Record<ListKey, Record<string, unknown>[]>>; singles?: Partial<Record<SingleKey, Record<string, unknown>>> }) {
    const tables = { ...this.state.tables };
    const keys = new Set<BucketKey>();
    for (const t of LIST_KEYS) {
      const rows = plan.tables?.[t];
      if (!rows?.length) continue;
      const prepared = rows.map((r) => this.prepare(t, r));
      tables[t] = [...tables[t], ...prepared];
      this.touch(t, prepared).forEach((k) => keys.add(k));
    }
    const singles = { ...this.state.singles };
    for (const k of SINGLE_KEYS) {
      const s = plan.singles?.[k];
      if (!s) continue;
      const row = { ...(singles[k] ?? SINGLE_DEFAULTS[k]), ...s, id: k, user_id: this.uid } as Row;
      validateSingle(k, row);
      singles[k] = row;
      keys.add(`s~${k}`);
    }
    this.commit({ tables, singles });
    await this.persistAll(keys);
  }

  /** Delete every record (and photo) this person has stored. */
  async reset(): Promise<void> {
    await this.settled();
    const all = await this.store.list(this.base);
    const photos = await this.store.list(this.mediaCollection).catch(() => [] as StoredDoc[]);
    for (const d of photos) await this.store.remove(`${this.mediaCollection}/${d.id}`);
    for (const d of all) if (d.id.startsWith("t~")) await this.store.remove(`${this.base}/${d.id}`);
    for (const k of SINGLE_KEYS) if (k !== "shareSettings" && k !== "reminderSettings") await this.store.remove(`${this.base}/s~${k}`);
    this.stored.clear();
    this.commit({
      tables: emptyTables(),
      singles: { ...emptySingles(), shareSettings: this.state.singles.shareSettings, reminderSettings: this.state.singles.reminderSettings },
      profile: { ...this.state.profile, onboarding_done: false, demo_mode: false, demo_today: null, plan_preset: null, business_enabled: false },
    });
    await this.persist("profile");
  }

  async exportAll(includeImages = true): Promise<ExportFile> {
    const images: Record<string, string> = {};
    if (includeImages) {
      for (const p of this.state.tables.photos) {
        const img = await this.getImage(p.id).catch(() => null);
        if (img) images[p.id] = img;
      }
    }
    return {
      app: "becoming-os", version: 1, exported_at: nowIso(), profile: this.state.profile,
      singles: { ...this.state.singles }, tables: { ...this.state.tables }, images,
    };
  }

  /** Replace everything with a backup file's contents. */
  async importAll(file: ExportFile): Promise<void> {
    if (file?.app !== "becoming-os" || file.version !== 1 || !file.tables) throw new ValidationError("That file isn't a BECOMING OS backup.");
    await this.reset();
    const tables: Partial<Record<ListKey, Record<string, unknown>[]>> = {};
    for (const t of LIST_KEYS) tables[t] = (file.tables[t] ?? []) as Record<string, unknown>[];
    const singles: Partial<Record<SingleKey, Record<string, unknown>>> = {};
    for (const k of SINGLE_KEYS) if (file.singles?.[k]) singles[k] = file.singles[k] as Record<string, unknown>;
    await this.bulk({ tables, singles });
    for (const [id, data] of Object.entries(file.images ?? {})) await this.putImage(id, data);
    const { id: _ignore, ...profile } = file.profile;
    void _ignore;
    await this.saveProfile({ ...profile, timezone: validTimeZone(profile.timezone) ? profile.timezone : this.state.profile.timezone });
  }

  // ──────────────────────────────────────────────────────────── photos ──
  get mediaCollection() {
    return `${this.base}/media/photos`;
  }
  async putImage(photoId: string, dataUrl: string) {
    if (dataUrl.length > 240_000) throw new ValidationError("That photo is too large to store. Try a smaller image.");
    await this.store.set(`${this.mediaCollection}/${photoId}`, { data: dataUrl });
  }
  async getImage(photoId: string): Promise<string | null> {
    const d = await this.store.get(`${this.mediaCollection}/${photoId}`);
    return typeof d?.data === "string" ? d.data : null;
  }
  async deleteImage(photoId: string) {
    await this.store.remove(`${this.mediaCollection}/${photoId}`);
  }

  // ─────────────────────────────────────────────────────────── internals ──
  private prepare(table: ListKey, input: Record<string, unknown>): Row {
    const row = {
      ...TABLES[table].defaults,
      ...stripMeta(input),
      id: typeof input.id === "string" && input.id ? input.id : table === "roadmapNotes" && input.chapter_key ? String(input.chapter_key) : newId(),
      user_id: this.uid,
      created_at: typeof input.created_at === "string" ? input.created_at : nowIso(),
    } as Row;
    validateRow(table, row);
    return row;
  }

  /** Uniqueness, parent links and the money rules that span rows. */
  private checkCross(table: ListKey, r: Row, list: Row[], selfId: string | null) {
    for (const set of TABLES[table].unique ?? []) {
      if (list.some((o) => o.id !== r.id && o.id !== selfId && set.every((f) => o[f] === r[f]))) {
        throw new ValidationError(UNIQUE_MESSAGE[table] ?? "That entry already exists — edit the existing one instead.");
      }
    }
    for (const p of TABLES[table].parents ?? []) {
      const v = r[p.field];
      if (v === null || v === undefined) {
        if (p.required) throw new ValidationError(`Missing ${p.field.replace(/_id$/, "").replace(/_/g, " ")}.`);
        continue;
      }
      if (!this.state.tables[p.table].some((x) => x.id === v)) throw new ValidationError("The linked record no longer exists.");
    }
    if (table === "payments") {
      const t = this.state.tables.transactions.find((x) => x.id === r.transaction_id);
      if (!t || t.kind !== "sale") throw new ValidationError("Payments can only be recorded against sales.");
      const paid = this.state.tables.payments.filter((p) => p.transaction_id === t.id && p.id !== r.id && p.id !== selfId)
        .reduce((s, p) => s + Number(p.amount), 0);
      if (paid + Number(r.amount) > Number(t.amount) + 0.004) {
        throw new ValidationError(`Cash collected ($${(paid + Number(r.amount)).toFixed(2)}) would exceed the sale amount ($${Number(t.amount).toFixed(2)}).`);
      }
    }
    if (table === "transactions" && selfId) {
      const paid = this.state.tables.payments.filter((p) => p.transaction_id === selfId).reduce((s, p) => s + Number(p.amount), 0);
      if (paid > 0 && r.kind !== "sale") throw new ValidationError("Remove the recorded payments before changing this sale's type.");
      if (paid > Number(r.amount) + 0.004) throw new ValidationError(`Sale amount can't be less than cash already collected ($${paid.toFixed(2)}).`);
    }
  }

  private touch(table: ListKey, rows: Row[]): Set<BucketKey> {
    return new Set(rows.map((r) => `t~${table}~${bucketOf(table, r)}`));
  }

  private applyCap(table: ListKey, tables: Record<ListKey, Row[]>, keys: Set<BucketKey>) {
    const cap = TABLES[table].cap;
    const list = tables[table];
    if (!cap || list.length <= cap) return tables;
    const sorted = [...list].sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1));
    const drop = new Set(sorted.slice(0, list.length - cap).map((r) => r.id));
    this.touch(table, list.filter((r) => drop.has(r.id))).forEach((k) => keys.add(k));
    return { ...tables, [table]: list.filter((r) => !drop.has(r.id)) };
  }

  private commit(patch: Partial<Omit<EngineState, "rev">>) {
    this.state = { ...this.state, ...patch, rev: this.state.rev + 1 };
    this.listeners.forEach((l) => l());
  }

  private setStatus(patch: Partial<SaveStatus>) {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach((l) => l());
  }

  private async persistAll(keys: Set<BucketKey>) {
    const results = await Promise.allSettled([...keys].map((k) => this.persist(k)));
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) throw failed.reason;
  }

  /** Queue a chunk write; concurrent requests for one chunk share a single write of the latest state. */
  persist(key: BucketKey): Promise<void> {
    const q = this.queued.get(key);
    if (q) return q;
    const prev = this.chains.get(key) ?? Promise.resolve();
    const p = prev.catch(() => undefined).then(async () => {
      this.queued.delete(key);
      await this.slot();
      this.inflight.add(key);
      this.setStatus({ pending: this.queued.size + this.inflight.size });
      try {
        await this.writeKey(key);
        this.failed.delete(key);
        this.retryDelay = 3000;
        this.setStatus({ error: this.failed.size ? this.status.error : null, lastSavedAt: Date.now() });
      } catch (e) {
        this.failed.add(key);
        const msg = e instanceof StorageError ? e.message : "Couldn't save. Will keep trying.";
        this.setStatus({ error: msg });
        this.scheduleRetry();
        throw e instanceof StorageError ? e : new StorageError("unavailable", msg);
      } finally {
        this.inflight.delete(key);
        this.release();
        this.setStatus({ pending: this.queued.size + this.inflight.size });
      }
    });
    this.queued.set(key, p);
    this.chains.set(key, p);
    return p;
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      const keys = [...this.failed];
      this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
      keys.forEach((k) => this.persist(k).catch(() => undefined));
    }, this.retryDelay);
  }

  private async slot() {
    if (this.active < CONCURRENCY) {
      this.active++;
      return;
    }
    await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
  }
  private release() {
    this.active--;
    this.waiting.shift()?.();
  }

  private async writeKey(key: BucketKey) {
    if (key === "profile") {
      await this.store.set(`${this.base}/profile`, { row: this.state.profile });
      return;
    }
    if (key.startsWith("s~")) {
      const single = key.slice(2) as SingleKey;
      const row = this.state.singles[single];
      if (row) await this.store.set(`${this.base}/${key}`, { row });
      else await this.store.remove(`${this.base}/${key}`);
      return;
    }
    const [, table, bucket] = key.split("~") as [string, ListKey, string];
    const rows = this.state.tables[table].filter((r) => bucketOf(table, r) === bucket);
    const pages = paginate(rows);
    const ver = newId().slice(0, 8);
    // Extra pages first, page 0 last: page 0 names the version, so a reader
    // never mixes pages from two different writes.
    for (let i = pages.length - 1; i >= 0; i--) {
      await this.store.set(`${this.base}/${key}~${i}`, { table, bucket, page: i, pages: pages.length, ver, rows: pages[i] });
    }
    const prev = this.stored.get(key);
    if (prev && prev.pages > pages.length) {
      for (let i = pages.length; i < prev.pages; i++) await this.store.remove(`${this.base}/${key}~${i}`).catch(() => undefined);
    }
    this.stored.set(key, { pages: pages.length, ver });
  }

  /** Build state from stored documents. */
  private hydrate(docs: StoredDoc[]) {
    const tables = emptyTables();
    const singles = emptySingles();
    let profile = this.state.profile;
    for (const d of docs) {
      if (d.id === "profile" && d.data.row) profile = { ...profile, ...(d.data.row as Profile), id: this.uid };
      else if (d.id.startsWith("s~")) {
        const k = d.id.slice(2) as SingleKey;
        if ((SINGLE_KEYS as readonly string[]).includes(k) && d.data.row) singles[k] = d.data.row as Row;
      }
    }
    for (const [key, rows] of groupChunks(docs, this.stored)) {
      const table = key.split("~")[1] as ListKey;
      if ((LIST_KEYS as readonly string[]).includes(table)) tables[table].push(...rows);
    }
    for (const t of LIST_KEYS) tables[t] = dedupe(tables[t]);
    this.state = { rev: this.state.rev + 1, profile, tables, singles };
  }

  /** Another device (or tab) changed something: take its chunks unless ours are mid-save. */
  private applyRemote(docs: StoredDoc[]) {
    const busy = (k: BucketKey) => this.queued.has(k) || this.inflight.has(k) || this.failed.has(k);
    let changed = false;
    const tables = { ...this.state.tables };
    const singles = { ...this.state.singles };
    let profile = this.state.profile;
    for (const d of docs) {
      if (d.id === "profile" && !busy("profile") && d.data.row) {
        const next = { ...profile, ...(d.data.row as Profile), id: this.uid };
        if (JSON.stringify(next) !== JSON.stringify(profile)) {
          profile = next;
          changed = true;
        }
      } else if (d.id.startsWith("s~") && !busy(d.id) && d.data.row) {
        const k = d.id.slice(2) as SingleKey;
        if ((SINGLE_KEYS as readonly string[]).includes(k) && JSON.stringify(singles[k]) !== JSON.stringify(d.data.row)) {
          singles[k] = d.data.row as Row;
          changed = true;
        }
      }
    }
    const known = new Map(this.stored);
    for (const [key, rows] of groupChunks(docs, this.stored)) {
      if (busy(key)) continue;
      const before = known.get(key);
      const after = this.stored.get(key);
      if (before && after && before.ver === after.ver) continue;
      const [, table, bucket] = key.split("~") as [string, ListKey, string];
      if (!(LIST_KEYS as readonly string[]).includes(table)) continue;
      tables[table] = dedupe([...tables[table].filter((r) => bucketOf(table, r) !== bucket), ...rows]);
      changed = true;
    }
    if (changed) this.commit({ tables, singles, profile });
  }
}

function stripMeta(r: Record<string, unknown>) {
  const { user_id: _u, ...rest } = r;
  void _u;
  return rest;
}

function dedupe(rows: Row[]): Row[] {
  const m = new Map<string, Row>();
  for (const r of rows) m.set(r.id, r);
  return [...m.values()];
}

function paginate(rows: Row[]): Row[][] {
  const pages: Row[][] = [[]];
  let size = 0;
  for (const r of rows) {
    const n = JSON.stringify(r).length + 1;
    if (size + n > PAGE_CHARS && pages[pages.length - 1].length) {
      pages.push([]);
      size = 0;
    }
    pages[pages.length - 1].push(r);
    size += n;
  }
  return pages;
}

/** Group chunk pages into rows per chunk, keeping only pages from the version page 0 names. */
function groupChunks(docs: StoredDoc[], stored: Map<BucketKey, { pages: number; ver: string }>): Map<BucketKey, Row[]> {
  const byKey = new Map<BucketKey, StoredDoc[]>();
  for (const d of docs) {
    if (!d.id.startsWith("t~")) continue;
    const key = d.id.slice(0, d.id.lastIndexOf("~"));
    byKey.set(key, [...(byKey.get(key) ?? []), d]);
  }
  const out = new Map<BucketKey, Row[]>();
  for (const [key, pages] of byKey) {
    const head = pages.find((p) => p.data.page === 0);
    if (!head) continue;
    const ver = head.data.ver as string;
    const rows = pages.filter((p) => p.data.ver === ver).sort((a, b) => Number(a.data.page) - Number(b.data.page))
      .flatMap((p) => (Array.isArray(p.data.rows) ? (p.data.rows as Row[]) : []));
    stored.set(key, { pages: Math.max(Number(head.data.pages) || 1, pages.length), ver });
    out.set(key, rows);
  }
  return out;
}

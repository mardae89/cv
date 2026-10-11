// The storage engine. Every record for one person lives in memory, is
// validated here (uniqueness, parent links, the money rules), and is saved to
// a DocStore in month-sized chunks. Changes show on screen immediately; each
// mutation's promise resolves only once its chunks are actually stored, so a
// "Saved" message is never shown for data that didn't save.
import type { Profile } from "@/lib/types";
import type { DocStore, StoredDoc } from "./docstore";
import { StorageError } from "./docstore";
import {
  bucketOf, LIST_KEYS, normalize, SINGLE_DEFAULTS, SINGLE_KEYS, TABLES, validateProfile, validateRow, validateSingle, ValidationError,
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
  /** True while a failed save will be tried again by itself; false when it needs the person to act. */
  retrying: boolean;
  /** Why changes from other devices aren't arriving, when they aren't. */
  sync: string | null;
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

/** Bytes per stored page; a document may hold 256 KiB. */
const PAGE_BYTES = 150_000;
const CONCURRENCY = 6;
/** Storage answers that another attempt can't change (too large, storage full, access gone). */
const PERMANENT = new Set(["invalid_argument", "quota_exceeded", "revoked", "transform_error"]);

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

/** Page 0 keeps a fixed id; the others carry their version, so a new write never overwrites the pages the current page 0 names. */
const pageId = (key: BucketKey, i: number, ver: string) => (i === 0 ? `${key}~0` : `${key}~${i}~${ver}`);

/** Sortable, so a later reset always wins over an earlier one. */
const newEpoch = () => `${Date.now().toString(36).padStart(9, "0")}-${newId().slice(0, 6)}`;
/** What a reset puts back to the start (a restore then applies the backup's own profile over it). */
const CLEARED_PROFILE: Partial<Profile> = { onboarding_done: false, demo_mode: false, demo_today: null, plan_preset: null, business_enabled: false };

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
  private status: SaveStatus = { pending: 0, error: null, retrying: false, sync: null, lastSavedAt: null };
  private chains = new Map<BucketKey, Promise<void>>();
  private queued = new Map<BucketKey, Promise<void>>();
  /** Chunks being written, or waiting for a write slot. */
  private inflight = new Set<BucketKey>();
  /** Chunks whose last write failed → whether that failure is permanent (no automatic retry). */
  private failed = new Map<BucketKey, boolean>();
  /**
   * For each chunk: the version page 0 names, the versions it builds on, and
   * the extra page ids to delete once a newer page 0 is stored.
   */
  private stored = new Map<BucketKey, { ver: string; after: string[]; extra: Set<string> }>();
  /**
   * Rows changed here that no other device has built on yet, per chunk (row id → change number).
   * When another device writes a version of the chunk that doesn't include ours (it was
   * offline, or both saved at once), these rows keep their local state and everything else
   * comes from the other version, so neither side's rows are lost.
   */
  private dirty = new Map<BucketKey, Map<string, number>>();
  /** Our recent versions of each chunk, and the last change number each one carried. */
  private acks = new Map<BucketKey, { ver: string; mark: number }[]>();
  private seq = 0;
  /** Bumped by reset (and so import); a newer one from another device means "start over from storage". */
  private epoch = "";
  private active = 0;
  private waiting: (() => void)[] = [];
  private retryTimers = new Map<BucketKey, ReturnType<typeof setTimeout>>();
  private retryDelays = new Map<BucketKey, number>();
  private unwatch: (() => void) | null = null;
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  private watchDelay = 1000;
  private closed = false;
  /**
   * Versions already reflected in our state (written here, loaded, or taken
   * from another device). A snapshot carrying one of these is old news — often
   * a late echo of our own earlier save — and must not overwrite newer edits.
   */
  private seen = new Set<string>();
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
        // Only fill in what's missing: a first run that half-saved may already have stored these.
        if ((k === "shareSettings" || k === "reminderSettings") && !e.state.singles[k]) {
          e.state.singles[k] = { id: k, user_id: uid, ...SINGLE_DEFAULTS[k] };
        }
      }
      try {
        await Promise.all([e.persist("profile"), e.persist("s~shareSettings"), e.persist("s~reminderSettings")]);
      } catch (err) {
        // Nobody holds this engine, so stop its retries: a late retry would
        // overwrite the profile a later successful open goes on to save.
        e.close();
        throw err;
      }
    }
    e.startWatch();
    return e;
  }

  close() {
    this.closed = true;
    this.unwatch?.();
    this.unwatch = null;
    for (const t of this.retryTimers.values()) clearTimeout(t);
    this.retryTimers.clear();
    if (this.watchTimer) clearTimeout(this.watchTimer);
  }

  /** Listen for other devices; if the listener dies, say so and reconnect when that can help. */
  private startWatch() {
    if (this.closed) return;
    this.unwatch = this.store.watch(this.base, (all) => {
      this.watchDelay = 1000;
      if (this.status.sync) this.setStatus({ sync: null });
      this.applyRemote(all);
    }, (err) => {
      if (this.closed) return;
      this.unwatch = null;
      if (err.code === "unavailable" || err.code === "resource_exhausted") {
        this.setStatus({ sync: "Changes from your other devices are paused. Reconnecting…" });
        const delay = this.watchDelay;
        this.watchDelay = Math.min(delay * 2, 60_000);
        this.watchTimer = setTimeout(() => {
          this.watchTimer = null;
          this.startWatch();
        }, delay);
      } else {
        this.setStatus({ sync: "Changes from your other devices have stopped arriving. Reload the page to see them." });
      }
    });
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
    const after: Row = normalize(table, { ...before, ...stripMeta(patch), id, updated_at: nowIso() } as Row);
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
    const after = normalize(key, { ...before, ...stripMeta(patch), id: key, user_id: this.uid, updated_at: nowIso() } as Row);
    validateSingle(key, after);
    this.commit({ singles: { ...this.state.singles, [key]: after } });
    await this.persist(`s~${key}`);
    return after;
  }

  async saveProfile(patch: Partial<Profile>): Promise<void> {
    const next = { ...this.state.profile, ...patch, id: this.uid };
    if (!validTimeZone(next.timezone)) throw new ValidationError(`Unknown time zone: ${next.timezone}`);
    if (typeof next.display_name === "string") next.display_name = next.display_name.slice(0, 60);
    validateProfile(next as unknown as Record<string, unknown>);
    this.commit({ profile: next });
    await this.persist("profile");
  }

  /** Load many rows at once (demo data, imports) with the same rules as insert, all or nothing. */
  async bulk(plan: BulkPlan) {
    const { tables, singles, keys } = this.stage(this.state.tables, this.state.singles, plan, true);
    this.commit({ tables, singles });
    await this.persistAll(keys);
  }

  /** Check a bulk plan row by row against `base` and return the resulting state. Throws on the first bad row. */
  private stage(base: Record<ListKey, Row[]>, baseSingles: Record<SingleKey, Row | null>, plan: BulkPlan, mark: boolean) {
    const tables = { ...base };
    const keys = new Set<BucketKey>();
    // LIST_KEYS lists parents before children, so links are checked against rows staged just before.
    for (const t of LIST_KEYS) {
      const rows = plan.tables?.[t];
      if (!rows?.length) continue;
      const list = [...tables[t]];
      const added: Row[] = [];
      for (const input of rows) {
        const r = this.prepare(t, input);
        this.checkCross(t, r, list, null, tables);
        list.push(r);
        added.push(r);
      }
      tables[t] = list;
      this.touch(t, added, mark).forEach((k) => keys.add(k));
      Object.assign(tables, this.applyCap(t, tables, keys, mark));
    }
    const singles = { ...baseSingles };
    for (const k of SINGLE_KEYS) {
      const s = plan.singles?.[k];
      if (!s) continue;
      const row = normalize(k, { ...(singles[k] ?? SINGLE_DEFAULTS[k]), ...stripMeta(s), id: k, user_id: this.uid } as Row);
      validateSingle(k, row);
      singles[k] = row;
      keys.add(`s~${k}`);
    }
    return { tables, singles, keys };
  }

  /** Delete every record (and photo) this person has stored. */
  async reset(): Promise<void> {
    await this.wipe();
    this.commit({
      tables: emptyTables(),
      singles: this.keptSingles(),
      profile: { ...this.state.profile, ...CLEARED_PROFILE },
    });
    await this.persist("profile");
  }

  /** Sharing and reminder choices survive a reset or a restore. */
  private keptSingles(): Record<SingleKey, Row | null> {
    return { ...emptySingles(), shareSettings: this.state.singles.shareSettings, reminderSettings: this.state.singles.reminderSettings };
  }

  /** Removes everything from storage; the in-memory state is left for the caller to replace in one step. */
  private async wipe(): Promise<void> {
    await this.settled();
    const all = await this.store.list(this.base);
    const photos = await this.store.list(this.mediaCollection).catch(() => [] as StoredDoc[]);
    for (const d of photos) await this.store.remove(`${this.mediaCollection}/${d.id}`);
    for (const d of all) if (d.id.startsWith("t~")) await this.store.remove(`${this.base}/${d.id}`);
    for (const k of SINGLE_KEYS) if (k !== "shareSettings" && k !== "reminderSettings") await this.store.remove(`${this.base}/s~${k}`);
    this.stored.clear();
    this.dirty.clear();
    this.acks.clear();
    // Other open devices see the new epoch on the profile and reload from storage.
    this.epoch = newEpoch();
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
    const tables: Partial<Record<ListKey, Record<string, unknown>[]>> = {};
    for (const t of LIST_KEYS) tables[t] = (Array.isArray(file.tables[t]) ? file.tables[t] : []) as Record<string, unknown>[];
    const singles: Partial<Record<SingleKey, Record<string, unknown>>> = {};
    for (const k of SINGLE_KEYS) if (file.singles?.[k]) singles[k] = file.singles[k] as Record<string, unknown>;
    const { id: _ignore, ...profile } = file.profile ?? ({} as Profile);
    void _ignore;
    // Check everything (row rules, links, uniqueness, payments) before reset()
    // wipes the current records, so a bad file leaves what's already here untouched.
    const nextProfile = {
      ...this.state.profile, ...CLEARED_PROFILE, ...profile, id: this.uid,
      timezone: validTimeZone(profile.timezone) ? profile.timezone : this.state.profile.timezone,
    } as Profile;
    if (typeof nextProfile.display_name === "string") nextProfile.display_name = nextProfile.display_name.slice(0, 60);
    try {
      this.stage(emptyTables(), this.keptSingles(), { tables, singles }, false);
      validateProfile(nextProfile as unknown as Record<string, unknown>);
      for (const data of Object.values(file.images ?? {})) {
        if (typeof data !== "string" || data.length > 240_000) throw new ValidationError("It contains a photo that's too large.");
      }
    } catch (e) {
      throw new ValidationError(`That backup can't be loaded, so nothing was changed. ${e instanceof Error ? e.message : ""}`.trim());
    }
    // The app sees one change, from the old records straight to the backup's: never an empty,
    // not-set-up state in between where reminders or milestones could be added and then collide.
    await this.wipe();
    for (const [id, data] of Object.entries(file.images ?? {})) await this.putImage(id, data);
    const next = this.stage(emptyTables(), this.keptSingles(), { tables, singles }, true);
    this.commit({ tables: next.tables, singles: next.singles, profile: nextProfile });
    await this.persistAll(next.keys);
    // Last, so other open devices reload only once the records are in place.
    await this.persist("profile");
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
    normalize(table, row);
    validateRow(table, row);
    return row;
  }

  /** Uniqueness, parent links and the money rules that span rows. `tables` is the state the row joins. */
  private checkCross(table: ListKey, r: Row, list: Row[], selfId: string | null, tables = this.state.tables) {
    if (!selfId && list.some((o) => o.id === r.id)) {
      throw new ValidationError(UNIQUE_MESSAGE[table] ?? "That entry already exists — edit the existing one instead.");
    }
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
      if (!tables[p.table].some((x) => x.id === v)) throw new ValidationError("The linked record no longer exists.");
    }
    if (table === "payments") {
      const t = tables.transactions.find((x) => x.id === r.transaction_id);
      if (!t || t.kind !== "sale") throw new ValidationError("Payments can only be recorded against sales.");
      // `list` includes earlier rows of the same batch, so a multi-row insert can't overshoot either.
      const paid = list.filter((p) => p.transaction_id === t.id && p.id !== r.id && p.id !== selfId)
        .reduce((s, p) => s + Number(p.amount), 0);
      if (paid + Number(r.amount) > Number(t.amount) + 0.004) {
        throw new ValidationError(`Cash collected ($${(paid + Number(r.amount)).toFixed(2)}) would exceed the sale amount ($${Number(t.amount).toFixed(2)}).`);
      }
    }
    if (table === "transactions" && selfId) {
      const paid = tables.payments.filter((p) => p.transaction_id === selfId).reduce((s, p) => s + Number(p.amount), 0);
      if (paid > 0 && r.kind !== "sale") throw new ValidationError("Remove the recorded payments before changing this sale's type.");
      if (paid > Number(r.amount) + 0.004) throw new ValidationError(`Sale amount can't be less than cash already collected ($${paid.toFixed(2)}).`);
    }
  }

  /** The chunks these rows live in; with `mark`, also note the rows as changed here until stored. */
  private touch(table: ListKey, rows: Row[], mark = true): Set<BucketKey> {
    const keys = new Set<BucketKey>();
    for (const r of rows) {
      const k = `t~${table}~${bucketOf(table, r)}`;
      keys.add(k);
      if (!mark) continue;
      let m = this.dirty.get(k);
      if (!m) this.dirty.set(k, (m = new Map()));
      m.set(r.id, ++this.seq);
    }
    return keys;
  }

  private applyCap(table: ListKey, tables: Record<ListKey, Row[]>, keys: Set<BucketKey>, mark = true) {
    const { cap, capKeep } = TABLES[table];
    const list = tables[table];
    if (!cap || list.length <= cap) return tables;
    const kept = (r: Row) => (capKeep?.(r) ? 1 : 0);
    const sorted = [...list].sort((a, b) => kept(a) - kept(b) || (String(a.created_at) < String(b.created_at) ? -1 : 1));
    const drop = new Set(sorted.slice(0, list.length - cap).map((r) => r.id));
    this.touch(table, list.filter((r) => drop.has(r.id)), mark).forEach((k) => keys.add(k));
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
      // Counted as busy while it waits for a slot, too.
      this.inflight.add(key);
      await this.slot();
      try {
        await this.writeKey(key);
        this.failed.delete(key);
        this.retryDelays.delete(key);
        this.setStatus({ error: this.failed.size ? this.status.error : null, retrying: this.willRetry(), lastSavedAt: Date.now() });
      } catch (e) {
        const code = e instanceof StorageError ? e.code : "unavailable";
        const msg = e instanceof StorageError ? e.message : "Couldn't save. Will keep trying.";
        const permanent = PERMANENT.has(code);
        this.failed.set(key, permanent);
        if (!permanent) this.scheduleRetry(key);
        this.setStatus({ error: msg, retrying: this.willRetry() });
        throw e instanceof StorageError ? e : new StorageError("unavailable", msg);
      } finally {
        this.inflight.delete(key);
        this.release();
        this.setStatus({ pending: this.queued.size + this.inflight.size });
      }
    });
    this.queued.set(key, p);
    this.chains.set(key, p);
    this.setStatus({ pending: this.queued.size + this.inflight.size });
    return p;
  }

  private willRetry() {
    return [...this.failed.values()].some((permanent) => !permanent);
  }

  /** Try a failed chunk again later, backing off per chunk (3 s, 6 s, … 60 s). */
  private scheduleRetry(key: BucketKey) {
    if (this.retryTimers.has(key) || this.closed) return;
    const delay = this.retryDelays.get(key) ?? 3000;
    this.retryTimers.set(key, setTimeout(() => {
      this.retryTimers.delete(key);
      this.retryDelays.set(key, Math.min(delay * 2, 60_000));
      this.persist(key).catch(() => undefined);
    }, delay));
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
      const ver = newId().slice(0, 8);
      this.seen.add(ver);
      await this.store.set(`${this.base}/profile`, { row: this.state.profile, ver, epoch: this.epoch });
      return;
    }
    if (key.startsWith("s~")) {
      const ver = newId().slice(0, 8);
      this.seen.add(ver);
      const single = key.slice(2) as SingleKey;
      const row = this.state.singles[single];
      if (row) await this.store.set(`${this.base}/${key}`, { row, ver });
      else await this.store.remove(`${this.base}/${key}`);
      return;
    }
    // If another device rewrote this chunk since we last heard, fold its rows in first.
    await this.pullChunk(key);
    const [, table, bucket] = key.split("~") as [string, ListKey, string];
    const ver = newId().slice(0, 8);
    this.seen.add(ver);
    const mark = this.seq;
    const rows = this.state.tables[table].filter((r) => bucketOf(table, r) === bucket);
    const pages = paginate(rows);
    const ids = pages.map((_, i) => pageId(key, i, ver));
    let st = this.stored.get(key);
    if (!st) this.stored.set(key, (st = { ver: "", after: [], extra: new Set() }));
    // The versions this one includes, so other devices can tell it was built on theirs.
    const after = [st.ver, ...st.after].filter(Boolean).slice(0, 8);
    // Extra pages first, under ids of their own, then page 0 — which names the
    // version — last. Whether a reader looks mid-write or the tab closes
    // part-way, page 0 always names a complete set of pages.
    for (let i = pages.length - 1; i >= 1; i--) {
      st.extra.add(ids[i]);
      await this.store.set(`${this.base}/${ids[i]}`, { table, bucket, page: i, pages: pages.length, ver, rows: pages[i] });
    }
    await this.store.set(`${this.base}/${ids[0]}`, { table, bucket, page: 0, pages: pages.length, ver, after, rows: pages[0] });
    st.ver = ver;
    st.after = after;
    // These rows stay "ours" until another device writes a version built on this one.
    this.acks.set(key, [...(this.acks.get(key) ?? []), { ver, mark }].slice(-8));
    // The previous version's pages go only now that nothing points at them.
    const stale = [...st.extra].filter((id) => !ids.includes(id));
    st.extra = new Set(ids.slice(1));
    for (const id of stale) await this.store.remove(`${this.base}/${id}`).catch(() => undefined);
  }

  /** Read a chunk straight from storage and take it if it's a version we haven't seen. */
  private async pullChunk(key: BucketKey) {
    const head = await this.store.get(`${this.base}/${key}~0`);
    const ver = head?.ver;
    if (!head || typeof ver !== "string" || this.seen.has(ver)) return;
    const docs: StoredDoc[] = [{ id: `${key}~0`, data: head }];
    for (let i = 1; i < (Number(head.pages) || 1); i++) {
      // Pages written before page ids carried their version sit at "<key>~<i>".
      let id = pageId(key, i, ver);
      let page = await this.store.get(`${this.base}/${id}`);
      if (!page) page = await this.store.get(`${this.base}/${(id = `${key}~${i}`)}`);
      if (page) docs.push({ id, data: page });
    }
    this.takeChunks([...readChunks(docs).values()], key);
  }

  /** Build state from stored documents. */
  private hydrate(docs: StoredDoc[]) {
    const tables = emptyTables();
    const singles = emptySingles();
    let profile = this.state.profile;
    for (const d of docs) {
      if (typeof d.data.ver === "string" && !d.id.startsWith("t~")) this.seen.add(d.data.ver);
      if (d.id === "profile" && d.data.row) {
        profile = { ...profile, ...(d.data.row as Profile), id: this.uid };
        this.epoch = typeof d.data.epoch === "string" ? d.data.epoch : "";
      } else if (d.id.startsWith("s~")) {
        const k = d.id.slice(2) as SingleKey;
        if ((SINGLE_KEYS as readonly string[]).includes(k) && d.data.row) singles[k] = d.data.row as Row;
      }
    }
    for (const c of readChunks(docs).values()) {
      if (!(LIST_KEYS as readonly string[]).includes(c.table)) continue;
      // An incomplete set (pages lost to an older, interrupted save) still gives back what it can.
      if (c.complete) this.seen.add(c.ver);
      this.stored.set(c.key, { ver: c.ver, after: c.after, extra: new Set(c.others) });
      tables[c.table].push(...c.rows);
    }
    for (const t of LIST_KEYS) tables[t] = dedupe(tables[t]);
    this.state = { rev: this.state.rev + 1, profile, tables, singles };
  }

  /** Another device (or tab) changed something. */
  private applyRemote(docs: StoredDoc[]) {
    if (this.closed) return;
    const head = docs.find((d) => d.id === "profile");
    const epoch = typeof head?.data.epoch === "string" ? head.data.epoch : "";
    if (epoch > this.epoch) {
      // Records were reset (or a backup loaded) elsewhere: start over from what's stored.
      this.epoch = epoch;
      this.dirty.clear();
      this.acks.clear();
      this.stored.clear();
      this.hydrate(docs);
      this.listeners.forEach((l) => l());
      // A save that started before this would put old rows back; follow it with the current state.
      for (const k of this.inflight) if (k.startsWith("t~")) this.persist(k).catch(() => undefined);
      return;
    }
    // Settings and the profile are whole records: the latest write wins, unless ours is still on its way.
    const busy = (k: BucketKey) => this.queued.has(k) || this.inflight.has(k) || this.failed.has(k);
    const old = (d: StoredDoc) => typeof d.data.ver === "string" && this.seen.has(d.data.ver);
    const take = (d: StoredDoc) => typeof d.data.ver === "string" && this.seen.add(d.data.ver);
    let changed = false;
    const singles = { ...this.state.singles };
    let profile = this.state.profile;
    for (const d of docs) {
      if (d.id === "profile" && !busy("profile") && d.data.row && !old(d)) {
        const next = { ...profile, ...(d.data.row as Profile), id: this.uid };
        take(d);
        if (JSON.stringify(next) !== JSON.stringify(profile)) {
          profile = next;
          changed = true;
        }
      } else if (d.id.startsWith("s~") && !busy(d.id) && d.data.row && !old(d)) {
        const k = d.id.slice(2) as SingleKey;
        take(d);
        if ((SINGLE_KEYS as readonly string[]).includes(k) && JSON.stringify(singles[k]) !== JSON.stringify(d.data.row)) {
          singles[k] = d.data.row as Row;
          changed = true;
        }
      }
    }
    if (changed) this.commit({ singles, profile });
    this.takeChunks([...readChunks(docs).values()]);
  }

  /**
   * Take chunk versions we haven't seen. Rows changed here and not yet stored
   * keep their local state; every other row comes from the stored version.
   * When that merge kept local rows, the chunk is saved again so storage holds both.
   */
  private takeChunks(chunks: ChunkRead[], writing?: BucketKey) {
    const tables = { ...this.state.tables };
    const rewrite: BucketKey[] = [];
    let changed = false;
    for (const c of chunks) {
      // A page 0 whose pages aren't all there yet is mid-write; a later snapshot completes it.
      if (!c.complete || this.seen.has(c.ver) || !(LIST_KEYS as readonly string[]).includes(c.table)) continue;
      this.seen.add(c.ver);
      const st = this.stored.get(c.key);
      if (!st) this.stored.set(c.key, { ver: c.ver, after: c.after, extra: new Set(c.extra) });
      else {
        st.ver = c.ver;
        st.after = c.after;
        // While our own write of this chunk is out, we can't tell whose page 0 is current: keep its pages.
        if (c.key === writing || !this.inflight.has(c.key)) c.extra.forEach((id) => st.extra.add(id));
      }
      // Built on one of our versions: it already holds those changes (and any deletes since are deliberate).
      const acks = this.acks.get(c.key) ?? [];
      let known = acks.length - 1;
      while (known >= 0 && !c.after.includes(acks[known].ver)) known--;
      if (known >= 0) {
        const { mark } = acks[known];
        this.acks.set(c.key, acks.slice(known + 1));
        const mine = this.dirty.get(c.key);
        if (mine) for (const [id, n] of mine) if (n <= mark) mine.delete(id);
      }
      const local = this.dirty.get(c.key);
      let rows = c.rows;
      if (local?.size) {
        const mine = this.state.tables[c.table].filter((r) => local.has(r.id) && bucketOf(c.table, r) === c.bucket);
        rows = [...rows.filter((r) => !local.has(r.id)), ...mine];
        if (c.key !== writing) rewrite.push(c.key);
      }
      tables[c.table] = dedupe([...tables[c.table].filter((r) => bucketOf(c.table, r) !== c.bucket), ...rows]);
      changed = true;
    }
    if (changed) this.commit({ tables });
    for (const k of rewrite) this.persist(k).catch(() => undefined);
  }
}

type BulkPlan = {
  tables?: Partial<Record<ListKey, Record<string, unknown>[]>>;
  singles?: Partial<Record<SingleKey, Record<string, unknown>>>;
};

interface ChunkRead {
  key: BucketKey;
  table: ListKey;
  bucket: string;
  ver: string;
  /** Versions this one was built on, newest first. */
  after: string[];
  rows: Row[];
  /** Every page from 1 to pages-1 of page 0's version is present. */
  complete: boolean;
  /** Ids of this version's other pages (and old-style page ids), removed once a newer version is stored. */
  extra: string[];
  /** Ids of every page but page 0, whatever its version. */
  others: string[];
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

const utf8 = new TextEncoder();

/** Split rows into pages that stay well inside a stored document's 256 KiB, measured in bytes. */
function paginate(rows: Row[]): Row[][] {
  const pages: Row[][] = [[]];
  let size = 0;
  for (const r of rows) {
    const n = utf8.encode(JSON.stringify(r)).length + 1;
    if (size + n > PAGE_BYTES && pages[pages.length - 1].length) {
      pages.push([]);
      size = 0;
    }
    pages[pages.length - 1].push(r);
    size += n;
  }
  return pages;
}

/** Group stored pages into chunks, keeping only the pages of the version page 0 names. */
function readChunks(docs: StoredDoc[]): Map<BucketKey, ChunkRead> {
  const byKey = new Map<BucketKey, StoredDoc[]>();
  for (const d of docs) {
    if (!d.id.startsWith("t~")) continue;
    const [, t, b] = d.id.split("~");
    const key = `t~${typeof d.data.table === "string" ? d.data.table : t}~${typeof d.data.bucket === "string" ? d.data.bucket : b}`;
    byKey.set(key, [...(byKey.get(key) ?? []), d]);
  }
  const out = new Map<BucketKey, ChunkRead>();
  for (const [key, pages] of byKey) {
    const head = pages.find((p) => p.id === `${key}~0`);
    if (!head) continue;
    const ver = String(head.data.ver ?? "");
    const rowsOf = (p: StoredDoc) => (Array.isArray(p.data.rows) ? (p.data.rows as Row[]) : []);
    const rows = [...rowsOf(head)];
    let complete = true;
    for (let i = 1; i < (Number(head.data.pages) || 1); i++) {
      const page = pages.find((p) => p.data.page === i && p.data.ver === ver);
      if (page) rows.push(...rowsOf(page));
      else complete = false;
    }
    const [, table, bucket] = key.split("~") as [string, ListKey, string];
    const others = pages.filter((p) => p !== head);
    out.set(key, {
      key, table, bucket, ver, rows, complete,
      after: Array.isArray(head.data.after) ? (head.data.after as unknown[]).filter((v): v is string => typeof v === "string") : [],
      extra: others.filter((p) => p.data.ver === ver || p.id === `${key}~${p.data.page}`).map((p) => p.id),
      others: others.map((p) => p.id),
    });
  }
  return out;
}

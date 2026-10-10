/// <reference lib="dom" />
// A stand-in for the claude.ai page runtime, for end-to-end tests of the
// published ("shared-page") mode. It follows the capability contracts the
// real page is served with — `claude.use(name)` resolving frozen namespaces
// for "db", "user" and "downloads", the same method names, snapshot shapes,
// path grammar, query limits and `{code, message}` rejections — so the app
// can't lean on anything the real runtime wouldn't give it.
//
// One FakePageServer holds ONE database in Node. Each person's browser
// context is attached to it with their own identity, and every call reaches
// Node through a binding bound to that context, so the browser can't claim to
// be someone else. Access is enforced here with the rules the page is
// published with:
//   data/users/<uid>/…  read and write: <uid> only (and not when view-only)
//   shared/<uid>        read: every signed-in viewer; write: <uid> only
//   anything else       nobody
// A denied read looks exactly like a missing document; a denied write
// rejects `invalid_argument` — there is no permission-denied code.
import type { BrowserContext, Frame, Page } from "@playwright/test";

export interface FakeUser {
  /** Opaque id, what `user.id()` resolves (u_…). */
  id: string;
  /** Display name, what `user.me().name` resolves. */
  name: string;
  /** The artifact's own owner. */
  owner?: boolean;
  /** Sharing level: "admin" (Editor/Owner), "interact" (Contributor), "view" (Viewer, can't write anything). */
  level?: "admin" | "interact" | "view";
}

export interface DownloadRecord {
  user: string;
  filename: string;
  size: number;
  /** Decoded contents for text formats (json, csv, txt, md, svg, html); null otherwise. */
  text: string | null;
}

export type DbErrorCode = "invalid_argument" | "resource_exhausted" | "quota_exceeded" | "unavailable" | "revoked";

interface Entry {
  data: Record<string, unknown>;
  /** Bumped on every write; lets listeners tell what changed. */
  v: number;
}

interface QuerySpec {
  collection: string;
  filters: [string, string, unknown][];
  orders: [string, "asc" | "desc"][];
  limit: number | null;
}

type Reply = { ok: unknown } | { err: { code: string; message: string } };

const MAX_DOC_BYTES = 256 * 1024;
const MAX_DEPTH = 32;
const OPS = new Set(["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains"]);

class DbFault extends Error {
  constructor(public code: DbErrorCode, message: string) {
    super(message);
  }
}

const segs = (path: string) => path.split("/");
const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

function depth(v: unknown): number {
  if (Array.isArray(v)) return 1 + Math.max(0, ...v.map(depth));
  if (isPlainObject(v)) return 1 + Math.max(0, ...Object.values(v).map(depth));
  return 0;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  }
  return out;
}

/** Order like the store: numbers, then strings, then booleans; same-type values compare naturally. */
function cmp(a: unknown, b: unknown): number {
  const rank = (v: unknown) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : typeof v === "boolean" ? 2 : 3);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 3) return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
}
const sameType = (a: unknown, b: unknown) => typeof a === typeof b && (a === null) === (b === null) && Array.isArray(a) === Array.isArray(b);
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function matches(doc: Record<string, unknown>, [field, op, value]: [string, string, unknown]): boolean {
  if (!(field in doc)) return false;
  const v = doc[field];
  switch (op) {
    case "==": return eq(v, value);
    case "!=": return !eq(v, value);
    case "<": return sameType(v, value) && cmp(v, value) < 0;
    case "<=": return sameType(v, value) && cmp(v, value) <= 0;
    case ">": return sameType(v, value) && cmp(v, value) > 0;
    case ">=": return sameType(v, value) && cmp(v, value) >= 0;
    case "in": return (value as unknown[]).some((x) => eq(v, x));
    case "not-in": return !(value as unknown[]).some((x) => eq(v, x));
    case "array-contains": return Array.isArray(v) && v.some((x) => eq(x, value));
    default: return false;
  }
}

export class FakePageServer {
  /** The page's whole database: document path → body. Tests may read it directly. */
  readonly docs = new Map<string, Entry>();
  readonly users = new Map<string, FakeUser>();
  readonly downloads: DownloadRecord[] = [];
  /** Frame-rule breaches seen in any app frame: window.confirm/alert/prompt/print, navigator.share, <a download> clicks. */
  readonly violations: { user: string; what: string }[] = [];
  /** Answers for the next save prompts, per user id; "saved" when empty. */
  readonly downloadAnswers = new Map<string, ("saved" | "declined")[]>();
  private clock = 0;
  private leases = new Map<string, { holder: string; expires: number }>();
  private prompting = new Set<string>();

  /** A document's body as stored, or undefined. */
  read(path: string): Record<string, unknown> | undefined {
    return this.docs.get(path)?.data;
  }

  /** Every stored path under a prefix. */
  paths(prefix: string): string[] {
    return [...this.docs.keys()].filter((p) => p === prefix || p.startsWith(prefix + "/")).sort();
  }

  // ───────────────────────────────────────────────────── access rules ──
  private canRead(u: FakeUser, path: string): boolean {
    const s = segs(path);
    if (s[0] === "data" && s[1] === "users") return s.length >= 3 && s[2] === u.id;
    if (s[0] === "shared") return s.length >= 2;
    return false;
  }
  private canWrite(u: FakeUser, path: string): boolean {
    if (u.level === "view") return false;
    const s = segs(path);
    if (s[0] === "data" && s[1] === "users") return s.length >= 3 && s[2] === u.id;
    if (s[0] === "shared") return s.length >= 2 && s[1] === u.id;
    return false;
  }

  private checkDocPath(path: string) {
    if (typeof path !== "string" || !path || segs(path).length % 2 !== 0) throw new DbFault("invalid_argument", `Not a document path: ${path}`);
  }
  private checkBody(body: unknown): Record<string, unknown> {
    if (!isPlainObject(body)) throw new DbFault("invalid_argument", "A document body must be a plain JSON object.");
    const bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
    if (bytes > MAX_DOC_BYTES) throw new DbFault("invalid_argument", `Document is ${bytes} bytes; the limit is 256 KiB.`);
    if (depth(body) > MAX_DEPTH) throw new DbFault("invalid_argument", "Document is nested more than 32 levels deep.");
    return body;
  }
  private denyWrite(path: string): never {
    throw new DbFault("invalid_argument", `This viewer may not write ${path}.`);
  }

  // ─────────────────────────────────────────────────────────── verbs ──
  private get(u: FakeUser, path: string) {
    this.checkDocPath(path);
    const e = this.canRead(u, path) ? this.docs.get(path) : undefined;
    return e ? { exists: true, data: e.data, v: e.v } : { exists: false, data: null, v: 0 };
  }

  private set(u: FakeUser, path: string, body: unknown) {
    this.checkDocPath(path);
    const data = this.checkBody(body);
    if (!this.canWrite(u, path)) this.denyWrite(path);
    this.docs.set(path, { data, v: ++this.clock });
    return null;
  }

  private update(u: FakeUser, path: string, body: unknown) {
    this.checkDocPath(path);
    const patch = this.checkBody(body);
    if (!this.canWrite(u, path)) this.denyWrite(path);
    const cur = this.docs.get(path);
    if (!cur) throw new DbFault("invalid_argument", `update() needs an existing document: ${path}`);
    this.docs.set(path, { data: this.checkBody(deepMerge(cur.data, patch)), v: ++this.clock });
    return null;
  }

  private remove(u: FakeUser, path: string) {
    this.checkDocPath(path);
    if (!this.canWrite(u, path)) this.denyWrite(path);
    this.docs.delete(path);
    return null;
  }

  private acquire(u: FakeUser, path: string, opts: { holder?: unknown; ttlMs?: unknown; data?: unknown }) {
    this.checkDocPath(path);
    if (typeof opts?.holder !== "string" || !opts.holder) throw new DbFault("invalid_argument", "acquire() needs a holder.");
    if (opts.data !== undefined) this.checkBody(opts.data);
    if (!this.canWrite(u, path)) this.denyWrite(path);
    const ttl = Math.min(600_000, Math.max(1000, Number(opts.ttlMs) || 30_000));
    const now = Date.now();
    const lease = this.leases.get(path);
    if (lease && lease.expires > now && lease.holder !== opts.holder) {
      return { acquired: false, expiresAt: new Date(lease.expires).toISOString() };
    }
    this.leases.set(path, { holder: opts.holder, expires: now + ttl });
    const cur = this.docs.get(path)?.data ?? {};
    const data = opts.data ? deepMerge(cur, opts.data as Record<string, unknown>) : cur;
    const v = ++this.clock;
    this.docs.set(path, { data, v });
    return { acquired: true, version: v, expiresAt: new Date(now + ttl).toISOString(), holder: opts.holder };
  }

  private query(u: FakeUser, q: QuerySpec) {
    if (typeof q?.collection !== "string" || segs(q.collection).length % 2 !== 1) throw new DbFault("invalid_argument", "Not a collection path.");
    if (q.filters.length > 10) throw new DbFault("invalid_argument", "At most 10 filters.");
    for (const [field, op, value] of q.filters) {
      if (typeof field !== "string" || !field) throw new DbFault("invalid_argument", "A filter needs a field.");
      if (!OPS.has(op)) throw new DbFault("invalid_argument", `Unknown operator ${op}.`);
      if ((op === "in" || op === "not-in") && (!Array.isArray(value) || value.length > 30)) {
        throw new DbFault("invalid_argument", `${op} takes an array of at most 30 values.`);
      }
    }
    if (q.orders.length > 1) throw new DbFault("invalid_argument", "At most one orderBy.");
    if (q.limit !== null && (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > 1000)) {
      throw new DbFault("invalid_argument", "limit() takes 1 to 1000.");
    }
    let rows = [...this.docs.entries()]
      .filter(([p]) => parentOf(p) === q.collection && this.canRead(u, p))
      .map(([p, e]) => ({ id: p.slice(p.lastIndexOf("/") + 1), data: e.data, v: e.v }))
      .filter((r) => q.filters.every((f) => matches(r.data, f)));
    const [order] = q.orders;
    rows.sort((a, b) => {
      if (order) {
        const [f, dir] = order;
        const ha = f in a.data;
        const hb = f in b.data;
        // Documents missing the field sort last, whichever the direction.
        if (ha !== hb) return ha ? -1 : 1;
        const c = ha ? cmp(a.data[f], b.data[f]) * (dir === "desc" ? -1 : 1) : 0;
        if (c) return c;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    if (q.limit !== null) rows = rows.slice(0, q.limit);
    return rows;
  }

  private profiles(viewer: FakeUser, ids: string[]) {
    const out: Record<string, { id: string; name: string; isMe: boolean }> = {};
    for (const id of ids) out[id] = { id, name: this.users.get(id)?.name ?? "", isMe: id === viewer.id };
    return out;
  }

  private save(u: FakeUser, req: { filename: string; size: number; text: string | null }) {
    if (this.prompting.has(u.id)) return { status: "rate_limited" };
    this.prompting.add(u.id);
    try {
      const answer = this.downloadAnswers.get(u.id)?.shift() ?? "saved";
      if (answer === "saved") this.downloads.push({ user: u.id, filename: req.filename, size: req.size, text: req.text });
      return { status: answer };
    } finally {
      this.prompting.delete(u.id);
    }
  }

  private handle(u: FakeUser, op: string, a: Record<string, unknown>): unknown {
    switch (op) {
      case "db.get": return this.get(u, a.path as string);
      case "db.set": return this.set(u, a.path as string, a.data);
      case "db.update": return this.update(u, a.path as string, a.data);
      case "db.delete": return this.remove(u, a.path as string);
      case "db.acquire": return this.acquire(u, a.path as string, a.opts as never);
      case "db.query": return this.query(u, a.query as QuerySpec);
      case "user.profiles": return this.profiles(u, a.ids as string[]);
      case "downloads.save": return this.save(u, a as never);
      case "violation":
        this.violations.push({ user: u.id, what: String(a.what) });
        return null;
      default: throw new DbFault("invalid_argument", `Unknown call ${op}.`);
    }
  }

  /**
   * Serve the runtime to every app frame in this context, as `user`.
   * `capabilities` limits what `claude.use()` serves (default: db, user, downloads).
   */
  async attach(context: BrowserContext, user: FakeUser, capabilities: string[] = ["db", "user", "downloads"]) {
    const u: FakeUser = { level: "admin", ...user };
    this.users.set(u.id, u);
    await context.exposeBinding("__fakeClaudeCall", (_source, op: string, json: string): string => {
      let reply: Reply;
      try {
        // Bodies cross as JSON text, as they would over the wire; size checks measure exactly that.
        reply = { ok: this.handle(u, op, JSON.parse(json) as Record<string, unknown>) };
      } catch (e) {
        reply = e instanceof DbFault
          ? { err: { code: e.code, message: e.message } }
          : { err: { code: "invalid_argument", message: e instanceof Error ? e.message : String(e) } };
      }
      return JSON.stringify(reply);
    });
    await context.addInitScript(installRuntime, {
      me: { id: u.id, name: u.name, isOwner: !!u.owner, canEdit: u.level === "admin" },
      can: {
        // Shared data is owner-only under the page's rules; people only write their own spaces.
        "data.write": !!u.owner,
        "files.write": u.level === "admin",
        "assets.write": u.level === "admin",
        "people.add": !!u.owner,
      },
      capabilities,
    });
  }
}

/** The app's frame inside the harness page. */
export function appFrame(page: Page): Frame {
  const f = page.frames().find((x) => x !== page.mainFrame());
  if (!f) throw new Error("The app frame isn't there.");
  return f;
}

// ─────────────────────────────────────────────────────── browser side ──
// Runs in every frame of the context before the page's own scripts; only an
// app frame (one inside another page, like the claude.ai viewer) gets a runtime.
// Self-contained: Playwright sends this function's source to the browser.
function installRuntime(cfg: {
  me: { id: string; name: string; isOwner: boolean; canEdit: boolean };
  can: Record<string, boolean>;
  capabilities: string[];
}) {
  if (window.top === window) return;
  const w = window as unknown as Record<string, unknown>;
  const raw = w.__fakeClaudeCall as (op: string, json: string) => Promise<string>;

  type Err = { code: string; message: string };
  const fail = (code: string, message: string): Err => Object.freeze({ code, message });
  const call = async (op: string, args: unknown): Promise<unknown> => {
    let text: string;
    try {
      text = await raw(op, JSON.stringify(args));
    } catch {
      throw fail("unavailable", "The page runtime didn't answer.");
    }
    const r = JSON.parse(text) as { ok?: unknown; err?: Err };
    if (r.err) throw fail(r.err.code, r.err.message);
    return r.ok;
  };

  // Frame rules: these do nothing useful inside the viewer, so record any use.
  const breach = (what: string) => {
    call("violation", { what }).catch(() => undefined);
  };
  for (const name of ["alert", "confirm", "prompt", "print"]) {
    w[name] = () => {
      breach(`window.${name}`);
      return name === "confirm" ? false : name === "prompt" ? null : undefined;
    };
  }
  try {
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: () => {
        breach("navigator.share");
        return Promise.reject(new DOMException("Not allowed in this frame.", "NotAllowedError"));
      },
    });
  } catch {
    // leave as is
  }
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.hasAttribute("download")) {
      breach(`<a download="${this.getAttribute("download")}">`);
      return; // inert in the viewer
    }
    return click.call(this);
  };

  // ── db ────────────────────────────────────────────────────────────────
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const checkPath = (path: unknown, want: "doc" | "collection"): string => {
    if (typeof path !== "string") throw new TypeError("A path must be a string.");
    const parts = path.split("/");
    if (bytes(path) > 1000) throw new TypeError("A path may be at most 1000 bytes.");
    if (parts.length > 16) throw new TypeError("A path may have at most 16 segments.");
    for (const p of parts) {
      if (!p) throw new TypeError(`Empty segment in path "${path}".`);
      if (p === "." || p === "..") throw new TypeError(`"${p}" can't be a path segment.`);
      if (!SEG.test(p)) throw new TypeError(`Segment "${p}" has characters outside letters, digits and _ - . ~ : @ +.`);
      if (bytes(p) > 200) throw new TypeError("A path segment may be at most 200 bytes.");
    }
    const even = parts.length % 2 === 0;
    if (want === "doc" && !even) throw new TypeError(`A document path needs an even number of segments; "${path}" has ${parts.length}.`);
    if (want === "collection" && even) throw new TypeError(`A collection path needs an odd number of segments; "${path}" has ${parts.length}.`);
    return path;
  };
  const freezeDeep = <T,>(v: T): T => {
    if (v && typeof v === "object") {
      for (const x of Object.values(v as object)) freezeDeep(x);
      Object.freeze(v);
    }
    return v;
  };
  const META = Object.freeze({ fromCache: false, hasPendingWrites: false });
  type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined; metadata: typeof META };
  const snap = (id: string, exists: boolean, data: Record<string, unknown> | null): Snap => {
    const body = exists ? freezeDeep(data as Record<string, unknown>) : undefined;
    return Object.freeze({ id, exists, data: () => body, metadata: META });
  };
  const newId = () => {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const r = crypto.getRandomValues(new Uint8Array(20));
    return [...r].map((b) => abc[b % abc.length]).join("");
  };
  const leaf = (p: string) => p.slice(p.lastIndexOf("/") + 1);

  // Listeners are refreshed by polling (the real runtime falls back to periodic
  // refresh too) and straight after this frame's own writes.
  const pokes = new Set<() => void>();
  const poke = () => pokes.forEach((p) => p());
  let active = 0;
  const report = (e: Err) => {
    try {
      reportError(Object.assign(new Error(e.message), { code: e.code }));
    } catch {
      console.error(e);
    }
  };
  function listen<T>(fetch: () => Promise<T>, sig: (v: T) => string, deliver: (v: T) => void, error?: (e: Err) => void): () => void {
    let alive = true;
    if (active >= 64) {
      setTimeout(() => (error ? error(fail("resource_exhausted", "At most 64 subscriptions per view.")) : report(fail("resource_exhausted", "At most 64 subscriptions per view."))), 0);
      return () => undefined;
    }
    active++;
    let last: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let again = false;
    const stop = () => {
      if (!alive) return;
      alive = false;
      active--;
      clearTimeout(timer);
      pokes.delete(tick);
    };
    async function tick() {
      if (!alive) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      clearTimeout(timer);
      try {
        const v = await fetch();
        const s = sig(v);
        if (alive && s !== last) {
          last = s;
          deliver(v);
        }
      } catch (e) {
        const err = e as Err;
        // Passing faults are handled inside the subscription; only terminal ones end it.
        if (err.code !== "unavailable" && err.code !== "resource_exhausted") {
          stop();
          if (error) error(err);
          else report(err);
          return;
        }
      } finally {
        running = false;
      }
      if (!alive) return;
      if (again) {
        again = false;
        void tick();
      } else timer = setTimeout(tick, 300);
    }
    pokes.add(tick);
    timer = setTimeout(tick, 0);
    return stop;
  }

  type Q = { collection: string; filters: [string, string, unknown][]; orders: [string, "asc" | "desc"][]; limit: number | null };
  type Row = { id: string; data: Record<string, unknown>; v: number };

  function docRef(path: string): unknown {
    checkPath(path, "doc");
    const id = leaf(path);
    const write = async (op: string, args: Record<string, unknown>) => {
      if (args.data !== undefined && (typeof args.data !== "object" || args.data === null || Array.isArray(args.data))) {
        throw fail("invalid_argument", "A document body must be a plain JSON object.");
      }
      const r = await call(op, { path, ...args });
      poke();
      return r;
    };
    return Object.freeze({
      id,
      path,
      get: async () => {
        const r = (await call("db.get", { path })) as { exists: boolean; data: Record<string, unknown> | null };
        return snap(id, r.exists, r.data);
      },
      set: async (data: Record<string, unknown>) => void (await write("db.set", { data })),
      update: async (data: Record<string, unknown>) => void (await write("db.update", { data })),
      delete: async () => void (await write("db.delete", {})),
      acquire: async (opts: Record<string, unknown>) => write("db.acquire", { opts }),
      onSnapshot: (next: (s: Snap) => void, error?: (e: Err) => void) => {
        let prev: { v: number; s: Snap } | null = null;
        return listen(
          () => call("db.get", { path }) as Promise<{ exists: boolean; data: Record<string, unknown> | null; v: number }>,
          (r) => `${r.exists}:${r.v}`,
          (r) => {
            if (!prev || prev.v !== r.v) prev = { v: r.v, s: snap(id, r.exists, r.data) };
            next(prev.s);
          },
          error,
        );
      },
      collection: (sub: string) => collectionRef(`${path}/${sub}`),
    });
  }

  function query(q: Q): Record<string, unknown> {
    const run = () => call("db.query", { query: q }) as Promise<Row[]>;
    const querySnap = (docs: Snap[], changes: unknown[]) =>
      Object.freeze({ docs: Object.freeze(docs), size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: META });
    return {
      where: (field: string, op: string, value: unknown) => query({ ...q, filters: [...q.filters, [field, op, value]] }),
      orderBy: (field: string, dir: "asc" | "desc" = "asc") => query({ ...q, orders: [...q.orders, [field, dir]] }),
      limit: (n: number) => query({ ...q, limit: n }),
      get: async () => {
        const rows = await run();
        const docs = rows.map((r) => snap(r.id, true, r.data));
        return querySnap(docs, docs.map((d, i) => ({ type: "added", doc: d, oldIndex: -1, newIndex: i })));
      },
      onSnapshot: (next: (s: unknown) => void, error?: (e: Err) => void) => {
        // A document that didn't change is the same snapshot object across deliveries.
        let seen = new Map<string, { v: number; s: Snap }>();
        let order: string[] = [];
        return listen(run, (rows) => rows.map((r) => `${r.id}:${r.v}`).join(","), (rows) => {
          const fresh = new Map<string, { v: number; s: Snap }>();
          const changes: unknown[] = [];
          const ids = rows.map((r) => r.id);
          order.forEach((oldId, oldIndex) => {
            if (!ids.includes(oldId)) changes.push({ type: "removed", doc: seen.get(oldId)!.s, oldIndex, newIndex: -1 });
          });
          rows.forEach((r, newIndex) => {
            const before = seen.get(r.id);
            const s = before && before.v === r.v ? before.s : snap(r.id, true, r.data);
            fresh.set(r.id, { v: r.v, s });
            if (!before) changes.push({ type: "added", doc: s, oldIndex: -1, newIndex });
            else if (before.v !== r.v || order.indexOf(r.id) !== newIndex) changes.push({ type: "modified", doc: s, oldIndex: order.indexOf(r.id), newIndex });
          });
          seen = fresh;
          order = ids;
          next(querySnap(rows.map((r) => fresh.get(r.id)!.s), changes));
        }, error);
      },
    };
  }

  function collectionRef(path: string): unknown {
    checkPath(path, "collection");
    const base = query({ collection: path, filters: [], orders: [], limit: null });
    const doc = (id?: string) => docRef(`${path}/${id === undefined ? newId() : id}`) as { set(d: unknown): Promise<void> };
    return Object.freeze({
      ...base,
      path,
      doc,
      add: async (data: Record<string, unknown>) => {
        const ref = doc();
        await ref.set(data);
        return ref;
      },
    });
  }

  const db = Object.freeze({ doc: (p: string) => docRef(p), collection: (p: string) => collectionRef(p) });

  // ── user ──────────────────────────────────────────────────────────────
  const color = "#8a8f98";
  const avatar = (name: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/><text x="32" y="40" font-size="24" text-anchor="middle" fill="#fff">${(name[0] ?? "?").replace(/[<&>"]/g, "")}</text></svg>`)}`;
  const me = cfg.me;
  const user = Object.freeze({
    id: async () => me.id,
    me: async () => Object.freeze({ id: me.id, name: me.name, avatarUrl: avatar(me.name), color, email: null, isOwner: me.isOwner, canEdit: me.canEdit }),
    isOwner: async () => me.isOwner,
    canEdit: async () => me.canEdit,
    can: async (name: string) => cfg.can[name] ?? false,
    name: async () => me.name,
    avatarUrl: async () => avatar(me.name),
    email: async () => null,
    search: async () => [],
    profiles: async (ids: readonly string[] | string) => {
      const list = [...new Set(typeof ids === "string" ? [ids] : ids)];
      const r = (await call("user.profiles", { ids: list }).catch(() => ({}))) as Record<string, { id: string; name: string; isMe: boolean }>;
      const out: Record<string, unknown> = {};
      for (const id of list) {
        const p = r[id] ?? { id, name: "", isMe: id === me.id };
        out[id] = Object.freeze({ id, name: p.name, avatarUrl: avatar(p.name), color, email: null, isMe: p.isMe, guest: false });
      }
      return Object.freeze(out);
    },
  });

  // ── downloads ─────────────────────────────────────────────────────────
  const ALLOWED = new Set("gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip".split(" "));
  const TEXT = new Set(["txt", "json", "md", "csv", "svg", "html"]);
  const downloads = Object.freeze({
    save: async (req: { filename?: unknown; data?: unknown; request?: unknown }) => {
      const name = req?.filename;
      if (typeof name !== "string" || !name || name.length > 512) throw fail("bad_request", "Bad filename.");
      const dot = name.lastIndexOf(".");
      const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
      if (!ALLOWED.has(ext)) throw fail("rejected_extension", `Files ending .${ext || "(none)"} can't be saved.`);
      if (req.request !== undefined) throw fail("request_unknown", "No open export request.");
      const d = req.data;
      let buf: Uint8Array;
      if (typeof d === "string") buf = new TextEncoder().encode(d);
      else if (d instanceof Blob) buf = new Uint8Array(await d.arrayBuffer());
      else if (d instanceof ArrayBuffer) buf = new Uint8Array(d.slice(0));
      else if (ArrayBuffer.isView(d)) buf = new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      else throw fail("bad_request", "Bad data.");
      if (!buf.length) throw fail("bad_request", "Empty file.");
      const r = (await call("downloads.save", {
        filename: name, size: buf.length, text: TEXT.has(ext) ? new TextDecoder().decode(buf) : null,
      })) as { status: string };
      if (r.status === "saved") return Object.freeze({ status: "saved" });
      throw fail(r.status, r.status === "declined" ? "The viewer declined the save." : "A save prompt is already open.");
    },
  });

  // ── claude.use ────────────────────────────────────────────────────────
  const served: Record<string, unknown> = { db, user, downloads };
  const memo = new Map<string, Promise<unknown>>();
  const claude = Object.freeze({
    use: (name: string): Promise<unknown> => {
      if (!cfg.capabilities.includes(name) || !(name in served)) return Promise.resolve(null);
      if (!memo.has(name)) memo.set(name, new Promise((r) => setTimeout(() => r(served[name]), 15)));
      return memo.get(name)!;
    },
  });
  Object.defineProperty(window, "claude", { value: claude, writable: false, configurable: false, enumerable: true });
}

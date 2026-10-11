// The app's data layer: opens the storage engine for this person, recomputes
// every metric and milestone whenever a record changes, keeps stored
// achievements and in-app reminders in step, and (on the shared page)
// publishes the partner summary and listens for the partner's.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { evaluate, type Evaluation, type Milestone } from "@/lib/calc/milestones";
import { hourIn, todayIn } from "@/lib/dates";
import { errorMessage } from "@/lib/format";
import { computeReminders } from "@/lib/reminders";
import type { AppNotification, ISODate, Profile, ReminderSettings, ShareSettings, UserData } from "@/lib/types";
import { Engine, type SaveStatus } from "./engine";
import type { Host } from "./host";
import { buildSummary, summaryFingerprint, type SharedSummary } from "./partner";
import { LIST_KEYS, type ListKey, type Row, type SingleKey } from "./schema";

export type { ListKey, SingleKey } from "./schema";

export interface Store {
  uid: string;
  host: Host;
  engine: Engine;
  data: UserData;
  ev: Evaluation;
  today: ISODate;
  shareSettings: ShareSettings | null;
  reminderSettings: ReminderSettings | null;
  notifications: AppNotification[];
  /** Everyone else on the shared page who has published a summary. */
  partners: SharedSummary[];
  saveStatus: SaveStatus;
  insert: <T = Row>(key: ListKey, row: Record<string, unknown> | Record<string, unknown>[]) => Promise<T[]>;
  update: (key: ListKey, id: string, patch: Record<string, unknown>) => Promise<void>;
  remove: (key: ListKey, id: string | string[]) => Promise<void>;
  /** Insert or merge. `onConflict` lists the matching fields, e.g. "entry_date" or "metric_id,log_date". */
  upsert: (key: ListKey, row: Record<string, unknown>, onConflict?: string) => Promise<void>;
  saveSingle: (key: SingleKey, patch: Record<string, unknown>) => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  toggleHabit: (habitId: string, date: ISODate) => Promise<void>;
  milestoneByKey: (key: string) => Milestone | undefined;
}

const Ctx = createContext<Store | null>(null);

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Writes one document at a time, newest content wins: a write never starts
 * while the previous one is out (the page database wants one write at a time
 * per document, and an older write landing last would leave stale content),
 * and content already stored isn't sent again.
 */
export function serialPublisher(write: (data: Record<string, unknown>) => Promise<void>, onError: (e: unknown) => void) {
  let stored = "";
  let want: { fp: string; data: Record<string, unknown> } | null = null;
  let running: Promise<void> | null = null;
  const drain = async () => {
    while (want && want.fp !== stored) {
      const job = want;
      try {
        await write(job.data);
        stored = job.fp;
      } catch (e) {
        onError(e);
        // Stop unless something newer is waiting; the next change tries again.
        if (want === job) break;
      }
    }
    running = null;
  };
  return (fp: string, data: Record<string, unknown>): Promise<void> => {
    want = { fp, data };
    running ??= drain();
    return running;
  };
}

function toUserData(s: ReturnType<Engine["getState"]>): UserData {
  const d: Record<string, unknown> = { profile: s.profile, goals: s.singles.goals, athletic: s.singles.athletic, businessSettings: s.singles.businessSettings,
    powerSettings: s.singles.powerSettings ?? null };
  for (const k of LIST_KEYS) if (k !== "notifications") d[k] = s.tables[k];
  return d as unknown as UserData;
}

export function DataProvider({ host, children, fallback, error: renderError }: {
  host: Host; children: ReactNode; fallback: ReactNode; error: (msg: string, retry: () => void) => ReactNode;
}) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let opened: Engine | null = null;
    setOpenError(null);
    Engine.open(host.store, host.uid, { displayName: host.displayName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .then((e) => {
        opened = e;
        if (alive) setEngine(e);
        else e.close();
      })
      .catch((e) => alive && setOpenError(errorMessage(e)));
    return () => {
      alive = false;
      opened?.close();
    };
  }, [host, attempt]);

  if (openError) return <>{renderError(openError, () => setAttempt((a) => a + 1))}</>;
  if (!engine) return <>{fallback}</>;
  return <Loaded host={host} engine={engine}>{children}</Loaded>;
}

function Loaded({ host, engine, children }: { host: Host; engine: Engine; children: ReactNode }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const saveStatus = useSyncExternalStore(engine.subscribeStatus, engine.getStatus);
  const now = useNow();
  const uid = engine.uid;

  const data = useMemo(() => toUserData(state), [state]);
  const realToday = todayIn(data.profile.timezone, now);
  const today = data.profile.demo_mode && data.profile.demo_today ? data.profile.demo_today : realToday;
  const ev = useMemo(() => evaluate(data, today), [data, today]);
  const shareSettings = (state.singles.shareSettings ?? null) as unknown as ShareSettings | null;
  const reminderSettings = (state.singles.reminderSettings ?? null) as unknown as ReminderSettings | null;
  const notifications = useMemo(
    () => (state.tables.notifications.filter((n) => !n.cleared_at) as unknown as AppNotification[]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [state.tables.notifications],
  );

  const insert = useCallback(async <T,>(key: ListKey, row: Record<string, unknown> | Record<string, unknown>[]) =>
    (await engine.insert(key, row)) as unknown as T[], [engine]);
  const update = useCallback(async (key: ListKey, id: string, patch: Record<string, unknown>) => {
    await engine.update(key, id, patch);
  }, [engine]);
  const remove = useCallback((key: ListKey, id: string | string[]) => engine.remove(key, id), [engine]);
  const upsert = useCallback(async (key: ListKey, row: Record<string, unknown>, onConflict?: string) => {
    const fields = onConflict?.split(",").map((f) => f.trim()).filter((f) => f && f !== "user_id");
    await engine.upsert(key, row, fields?.length ? fields : undefined);
  }, [engine]);
  const saveSingle = useCallback(async (key: SingleKey, patch: Record<string, unknown>) => {
    await engine.saveSingle(key, patch);
  }, [engine]);
  const saveProfile = useCallback((patch: Partial<Profile>) => engine.saveProfile(patch), [engine]);
  const toggleHabit = useCallback(async (habitId: string, date: ISODate) => {
    const existing = engine.getState().tables.completions.find((c) => c.habit_id === habitId && c.completed_on === date);
    if (existing) await engine.remove("completions", existing.id);
    else await engine.insert("completions", { habit_id: habitId, completed_on: date });
  }, [engine]);
  const milestoneByKey = useCallback((k: string) => ev.milestones.find((m) => m.key === k), [ev]);

  // ── keep stored achievements in step with the rules
  const syncing = useRef(false);
  useEffect(() => {
    if (syncing.current) return;
    const t = setTimeout(async () => {
      if (syncing.current) return;
      const stored = engine.getState().tables.achievements;
      const byKey = new Map(stored.map((r) => [r.key as string, r]));
      const keys = new Set(ev.unlocked.map((m) => m.key));
      const toInsert = ev.unlocked.filter((m) => !byKey.has(m.key));
      const toUpdate = ev.unlocked.filter((m) => {
        const r = byKey.get(m.key);
        return r && (r.achieved_on !== m.achievedOn || r.title !== m.title || r.tier !== m.tier);
      });
      const toRemove = stored.filter((r) => !keys.has(r.key as string));
      if (!toInsert.length && !toUpdate.length && !toRemove.length) return;
      syncing.current = true;
      const row = (m: Milestone) => ({
        key: m.key, category: m.category, tier: m.tier, title: m.title, detail: m.detail ?? m.requirement,
        value: m.value ?? null, achieved_on: m.achievedOn,
      });
      try {
        if (toRemove.length) await engine.remove("achievements", toRemove.map((r) => r.id));
        for (const m of toUpdate) await engine.update("achievements", byKey.get(m.key)!.id, row(m));
        if (toInsert.length) {
          await engine.insert("achievements", toInsert.map(row));
          const existing = new Set(engine.getState().tables.notifications.map((n) => n.dedupe_key));
          const notes = toInsert.filter((m) => !existing.has(`ach:${m.key}`)).map((m) => ({
            kind: "achievement", title: `Unlocked: ${m.title}`, body: m.requirement, link: "/achievements", dedupe_key: `ach:${m.key}`,
          }));
          if (notes.length) await engine.insert("notifications", notes);
        }
      } catch (e) {
        console.error("Milestone sync failed", e);
      } finally {
        syncing.current = false;
      }
    }, 250);
    return () => clearTimeout(t);
  }, [ev, engine]);

  // ── in-app reminders (computed on open; one per period via dedupe keys)
  const hour = hourIn(data.profile.timezone, now);
  const reminded = useRef("");
  useEffect(() => {
    if (!reminderSettings) return;
    const drafts = computeReminders(data, ev, today, data.profile.demo_mode ? 20 : hour, reminderSettings);
    const existing = new Set(engine.getState().tables.notifications.map((n) => n.dedupe_key));
    const fresh = drafts.filter((d) => !existing.has(d.dedupe_key));
    const sig = fresh.map((d) => d.dedupe_key).join(",");
    if (!fresh.length || reminded.current === sig) return;
    reminded.current = sig;
    engine.insert("notifications", fresh as unknown as Record<string, unknown>[]).catch(() => undefined);
  }, [data, ev, today, hour, reminderSettings, engine]);

  // ── partner summaries (shared page only)
  const [partners, setPartners] = useState<SharedSummary[]>([]);
  useEffect(() => {
    if (host.mode !== "shared-page") return;
    let alive = true;
    const take = (docs: { id: string; data: Record<string, unknown> }[]) => {
      if (alive) setPartners(docs.filter((d) => d.id !== uid && d.data.partner_id).map((d) => ({ ...d.data, partner_id: d.id }) as unknown as SharedSummary));
    };
    let stop = () => {};
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    // If the listener dies on a passing fault, listen again (backing off); otherwise it stays stopped.
    const listen = () => {
      stop = host.store.watch("shared", (docs) => {
        delay = 1000;
        take(docs);
      }, (err) => {
        if (!alive) return;
        if (err.code !== "unavailable" && err.code !== "resource_exhausted") return console.error("Partner updates stopped", err);
        retry = setTimeout(listen, delay);
        delay = Math.min(delay * 2, 60_000);
      });
    };
    host.store.list("shared").then(take).catch(() => undefined);
    listen();
    return () => {
      alive = false;
      clearTimeout(retry);
      stop();
    };
  }, [host, uid]);

  const publish = useMemo(() => serialPublisher(
    (summary) => host.store.set(`shared/${uid}`, summary),
    (e) => console.error("Couldn't publish the partner summary", e),
  ), [host, uid]);
  useEffect(() => {
    if (host.mode !== "shared-page") return;
    const t = setTimeout(() => {
      const summary = buildSummary(data, ev, today, shareSettings, uid);
      publish(summaryFingerprint(summary), summary as unknown as Record<string, unknown>);
    }, 1200);
    return () => clearTimeout(t);
  }, [host, data, ev, today, shareSettings, uid, publish]);

  const store: Store = {
    uid, host, engine, data, ev, today, shareSettings, reminderSettings, notifications, partners, saveStatus,
    insert, update, remove, upsert, saveSingle, saveProfile, toggleHabit, milestoneByKey,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside DataProvider");
  return s;
}

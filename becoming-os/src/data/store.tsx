// The data layer: loads every table the signed-in user owns, recomputes all
// metrics and milestones client-side whenever any of it changes, and keeps
// the stored achievements and in-app reminders in step with the records.
import { useIsFetching, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { evaluate, type Evaluation, type Milestone } from "@/lib/calc/milestones";
import { hourIn, todayIn } from "@/lib/dates";
import { errorMessage } from "@/lib/format";
import { computeReminders } from "@/lib/reminders";
import type {
  AppNotification, ISODate, Partnership, Profile, ReminderSettings, ShareSettings, UserData,
} from "@/lib/types";
import { useAuth } from "./auth";
import { supabase } from "./supabase";

export const LIST_TABLES = {
  weights: { table: "weight_entries", order: "entry_date" },
  checkins: { table: "daily_checkins", order: "checkin_date" },
  symptoms: { table: "symptom_logs", order: "log_date" },
  nutrition: { table: "nutrition_logs", order: "log_date" },
  photos: { table: "progress_photos", order: "taken_on" },
  workouts: { table: "workouts", order: "workout_date" },
  sets: { table: "strength_sets", order: "created_at" },
  habits: { table: "habits", order: "sort_order" },
  completions: { table: "habit_completions", order: "completed_on" },
  restDays: { table: "rest_days", order: "rest_date" },
  tasks: { table: "tasks", order: "due_date" },
  journal: { table: "journal_entries", order: "entry_date" },
  reviews: { table: "reviews", order: "period_start" },
  roadmapNotes: { table: "roadmap_notes", order: "chapter_key" },
  businesses: { table: "businesses", order: "sort_order" },
  offers: { table: "offers", order: "created_at" },
  customers: { table: "customers", order: "created_at" },
  transactions: { table: "transactions", order: "txn_date" },
  payments: { table: "payments", order: "paid_on" },
  deals: { table: "deals", order: "created_on" },
  metrics: { table: "activity_metrics", order: "sort_order" },
  activityLogs: { table: "activity_logs", order: "log_date" },
  achievements: { table: "achievements", order: "achieved_on" },
} as const;

export const SINGLE_TABLES = {
  goals: "body_goals",
  athletic: "athletic_profiles",
  businessSettings: "business_settings",
  shareSettings: "share_settings",
  reminderSettings: "reminder_settings",
} as const;

export type ListKey = keyof typeof LIST_TABLES;
export type SingleKey = keyof typeof SINGLE_TABLES;
export type AnyKey = ListKey | SingleKey | "profile" | "notifications" | "partnerships";

/** Child tables that change when a parent row is deleted (FK cascades). */
const CASCADES: Partial<Record<AnyKey, AnyKey[]>> = {
  workouts: ["sets"],
  habits: ["completions"],
  transactions: ["payments"],
  businesses: ["offers", "customers", "transactions", "payments", "deals", "metrics", "activityLogs"],
  metrics: ["activityLogs"],
  photos: ["achievements"],
  customers: ["transactions"],
  offers: ["transactions", "deals"],
};

export const tableOf = (k: ListKey | SingleKey): string =>
  k in LIST_TABLES ? LIST_TABLES[k as ListKey].table : SINGLE_TABLES[k as SingleKey];

const PAGE = 1000;

export async function fetchAll<T>(table: string, column: string, value: string, order: string): Promise<T[]> {
  const out: T[] = [];
  // A unique tiebreaker keeps pages stable across requests.
  const tiebreak = table === "roadmap_notes" ? "chapter_key" : "id";
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").eq(column, value)
      .order(order, { ascending: true }).order(tiebreak, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function fetchSingle<T>(table: string, uid: string): Promise<T | null> {
  const { data, error } = await supabase.from(table).select("*").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data as T | null;
}

export interface Store {
  uid: string;
  data: UserData;
  ev: Evaluation;
  today: ISODate;
  shareSettings: ShareSettings | null;
  reminderSettings: ReminderSettings | null;
  notifications: AppNotification[];
  partnership: Partnership | null;
  invalidate: (...keys: AnyKey[]) => Promise<void>;
  invalidateAll: () => Promise<void>;
  insert: <T = Record<string, unknown>>(key: ListKey, row: Record<string, unknown> | Record<string, unknown>[]) => Promise<T[]>;
  update: (key: ListKey, id: string, patch: Record<string, unknown>) => Promise<void>;
  remove: (key: ListKey, id: string | string[]) => Promise<void>;
  upsert: (key: ListKey, row: Record<string, unknown>, onConflict: string) => Promise<void>;
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

export function DataProvider({ children, fallback, error: renderError }: {
  children: ReactNode; fallback: ReactNode; error: (msg: string, retry: () => void) => ReactNode;
}) {
  const { user } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const now = useNow();

  const profileQ = useQuery({
    queryKey: ["t", uid, "profile"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (error) throw error;
      return data as Profile;
    },
  });
  const listKeys = Object.keys(LIST_TABLES) as ListKey[];
  const lists = useQueries({
    queries: listKeys.map((k) => ({
      queryKey: ["t", uid, k],
      queryFn: () => fetchAll(LIST_TABLES[k].table, "user_id", uid, LIST_TABLES[k].order),
    })),
  });
  const singleKeys = Object.keys(SINGLE_TABLES) as SingleKey[];
  const singles = useQueries({
    queries: singleKeys.map((k) => ({
      queryKey: ["t", uid, k],
      queryFn: () => fetchSingle(SINGLE_TABLES[k], uid),
    })),
  });
  const notificationsQ = useQuery({
    queryKey: ["t", uid, "notifications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", uid)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as AppNotification[];
    },
  });
  const partnershipQ = useQuery({
    queryKey: ["t", uid, "partnerships"],
    queryFn: async () => {
      const { data, error } = await supabase.from("partnerships").select("*")
        .or(`user_a.eq.${uid},user_b.eq.${uid}`).in("status", ["pending", "active"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data as Partnership[];
      return rows.find((p) => p.status === "active") ?? rows.find((p) => p.user_a === uid) ?? null;
    },
  });

  const all = [profileQ, ...lists, ...singles];
  const firstError = all.find((q) => q.error)?.error;
  const loaded = all.every((q) => q.data !== undefined);
  const stamp = all.map((q) => q.dataUpdatedAt).join(",");

  const data: UserData | null = useMemo(() => {
    if (!loaded) return null;
    const d: Record<string, unknown> = { profile: profileQ.data };
    listKeys.forEach((k, i) => (d[k] = lists[i].data));
    singleKeys.forEach((k, i) => (d[k] = singles[i].data));
    return d as unknown as UserData;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, stamp]);

  const shareSettings = (singles[singleKeys.indexOf("shareSettings")].data ?? null) as ShareSettings | null;
  const reminderSettings = (singles[singleKeys.indexOf("reminderSettings")].data ?? null) as ReminderSettings | null;

  const realToday = data ? todayIn(data.profile.timezone, now) : todayIn("America/New_York", now);
  const today = data?.profile.demo_mode && data.profile.demo_today ? data.profile.demo_today : realToday;
  const ev = useMemo(() => (data ? evaluate(data, today) : null), [data, today]);

  const invalidate = useCallback(async (...keys: AnyKey[]) => {
    const set = new Set<AnyKey>();
    for (const k of keys) {
      set.add(k);
      CASCADES[k]?.forEach((c) => set.add(c));
    }
    await Promise.all([...set].map((k) => qc.invalidateQueries({ queryKey: ["t", uid, k] })));
  }, [qc, uid]);

  const insert = useCallback(async <T,>(key: ListKey, row: Record<string, unknown> | Record<string, unknown>[]) => {
    const rows = (Array.isArray(row) ? row : [row]).map((r) => ({ user_id: uid, ...r }));
    const { data: out, error } = await supabase.from(LIST_TABLES[key].table).insert(rows, { defaultToNull: false }).select();
    if (error) throw new Error(errorMessage(error));
    await invalidate(key);
    return out as T[];
  }, [uid, invalidate]);

  const update = useCallback(async (key: ListKey, id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from(LIST_TABLES[key].table).update(patch).eq("id", id).eq("user_id", uid);
    if (error) throw new Error(errorMessage(error));
    await invalidate(key);
  }, [uid, invalidate]);

  const remove = useCallback(async (key: ListKey, id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    const { error } = await supabase.from(LIST_TABLES[key].table).delete().in("id", ids).eq("user_id", uid);
    if (error) throw new Error(errorMessage(error));
    await invalidate(key);
  }, [uid, invalidate]);

  const upsert = useCallback(async (key: ListKey, row: Record<string, unknown>, onConflict: string) => {
    const { error } = await supabase.from(LIST_TABLES[key].table).upsert({ user_id: uid, ...row }, { onConflict });
    if (error) throw new Error(errorMessage(error));
    await invalidate(key);
  }, [uid, invalidate]);

  const saveSingle = useCallback(async (key: SingleKey, patch: Record<string, unknown>) => {
    const { error } = await supabase.from(SINGLE_TABLES[key]).upsert({ user_id: uid, ...patch }, { onConflict: "user_id" });
    if (error) throw new Error(errorMessage(error));
    await invalidate(key);
  }, [uid, invalidate]);

  const saveProfile = useCallback(async (patch: Partial<Profile>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("id", uid);
    if (error) throw new Error(errorMessage(error));
    await invalidate("profile");
  }, [uid, invalidate]);

  const toggleHabit = useCallback(async (habitId: string, date: ISODate) => {
    const key = ["t", uid, "completions"];
    const prev = qc.getQueryData<UserData["completions"]>(key) ?? [];
    const existing = prev.find((c) => c.habit_id === habitId && c.completed_on === date);
    qc.setQueryData(key, existing
      ? prev.filter((c) => c !== existing)
      : [...prev, { id: `tmp-${habitId}-${date}`, user_id: uid, habit_id: habitId, completed_on: date, note: null }]);
    const res = existing && !existing.id.startsWith("tmp-")
      ? await supabase.from("habit_completions").delete().eq("id", existing.id)
      : existing
        ? await supabase.from("habit_completions").delete().eq("habit_id", habitId).eq("completed_on", date)
        : await supabase.from("habit_completions").upsert({ user_id: uid, habit_id: habitId, completed_on: date }, { onConflict: "habit_id,completed_on", ignoreDuplicates: true });
    if (res.error) {
      qc.setQueryData(key, prev);
      throw new Error(errorMessage(res.error));
    }
    await invalidate("completions");
  }, [qc, uid, invalidate]);

  // ── keep stored achievements in step with the rules
  // Only reconcile once every table has settled, so a half-refreshed snapshot
  // (e.g. right after a bulk load) can never add or remove milestones.
  const fetching = useIsFetching({ queryKey: ["t", uid] });
  const syncing = useRef(false);
  useEffect(() => {
    if (!data || !ev || syncing.current || fetching > 0) return;
    const stored = data.achievements;
    const byKey = new Map(stored.map((r) => [r.key, r]));
    const keys = new Set(ev.unlocked.map((m) => m.key));
    const toInsert = ev.unlocked.filter((m) => !byKey.has(m.key));
    const toUpdate = ev.unlocked.filter((m) => {
      const r = byKey.get(m.key);
      return r && (r.achieved_on !== m.achievedOn || r.title !== m.title || r.tier !== m.tier);
    });
    const toRemove = stored.filter((r) => !keys.has(r.key));
    if (!toInsert.length && !toUpdate.length && !toRemove.length) return;
    syncing.current = true;
    const row = (m: Milestone) => ({
      user_id: uid, key: m.key, category: m.category, tier: m.tier, title: m.title,
      detail: m.detail ?? m.requirement, value: m.value ?? null, achieved_on: m.achievedOn,
    });
    (async () => {
      try {
        if (toInsert.length) {
          const { error } = await supabase.from("achievements").upsert(toInsert.map(row), { onConflict: "user_id,key" });
          if (error) throw error;
          await supabase.from("notifications").upsert(toInsert.map((m) => ({
            user_id: uid, kind: "achievement", title: `Unlocked: ${m.title}`,
            body: m.requirement, link: "/achievements", dedupe_key: `ach:${m.key}`,
          })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
        }
        for (const m of toUpdate) {
          const { error } = await supabase.from("achievements").update(row(m)).eq("id", byKey.get(m.key)!.id);
          if (error) throw error;
        }
        if (toRemove.length) {
          const { error } = await supabase.from("achievements").delete().in("id", toRemove.map((r) => r.id));
          if (error) throw error;
        }
        await invalidate("achievements", "notifications");
      } catch (e) {
        console.error("Achievement sync failed", e);
      } finally {
        syncing.current = false;
      }
    })();
  }, [data, ev, uid, invalidate, fetching]);

  // ── in-app reminders (computed on open; deduplicated per period)
  const reminded = useRef("");
  const hour = data ? hourIn(data.profile.timezone, now) : 0;
  useEffect(() => {
    if (!data || !ev || !reminderSettings) return;
    const drafts = computeReminders(data, ev, today, data.profile.demo_mode ? 20 : hour, reminderSettings);
    const sig = `${today}|${hour}|${drafts.map((d) => d.dedupe_key).join(",")}`;
    if (!drafts.length || reminded.current === sig) return;
    reminded.current = sig;
    supabase.from("notifications")
      .upsert(drafts.map((d) => ({ ...d, user_id: uid })), { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) invalidate("notifications");
      });
  }, [data, ev, today, hour, reminderSettings, uid, invalidate]);

  const invalidateAll = useCallback(() => qc.invalidateQueries({ queryKey: ["t", uid] }), [qc, uid]);
  const milestoneByKey = useCallback((k: string) => ev?.milestones.find((m) => m.key === k), [ev]);

  if (firstError) {
    return <>{renderError(errorMessage(firstError), () => all.forEach((q) => q.error && q.refetch()))}</>;
  }
  if (!data || !ev) return <>{fallback}</>;

  const store: Store = {
    uid, data, ev, today, shareSettings, reminderSettings,
    notifications: notificationsQ.data ?? [],
    partnership: partnershipQ.data ?? null,
    invalidate, invalidateAll, insert, update, remove, upsert, saveSingle, saveProfile, toggleHabit, milestoneByKey,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside DataProvider");
  return s;
}

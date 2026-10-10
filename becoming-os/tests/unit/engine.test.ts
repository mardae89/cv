import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDemo } from "../../src/lib/demo";
import { DeviceStore, MemoryStore, SharedPageStore, StorageError, type ClaudeDb, type StoredDoc } from "../../src/data/docstore";
import { Engine, type ExportFile } from "../../src/data/engine";
import { detectHost } from "../../src/data/host";
import { LIST_KEYS, SINGLE_DEFAULTS, ValidationError, type ListKey, type Row, type SingleKey } from "../../src/data/schema";
import { serialPublisher } from "../../src/data/store";

const UID = "u1";
const BASE = `data/users/${UID}`;
const INIT = { displayName: "Dean", timezone: "America/Chicago" };

const open = (store: MemoryStore, uid = UID, init = INIT) => Engine.open(store, uid, init);
/** Let MemoryStore's watch notifications (promise callbacks) run. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const chunkIds = (store: MemoryStore, prefix: string) =>
  [...store.docs.keys()].filter((k) => k.startsWith(`${BASE}/${prefix}`)).map((k) => k.slice(BASE.length + 1)).sort();
const byId = (rows: Row[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

/** A MemoryStore that also hands out its watch callbacks, so a test can deliver an old snapshot. */
class TapStore extends MemoryStore {
  taps: ((docs: StoredDoc[]) => void)[] = [];
  watch(collection: string, onChange: (docs: StoredDoc[]) => void) {
    this.taps.push(onChange);
    return super.watch(collection, onChange);
  }
}

/** A business with one of everything hanging off it. */
async function seedBusiness(e: Engine, name = "Coaching") {
  const [b] = await e.insert("businesses", { name });
  const [offer] = await e.insert("offers", { business_id: b.id, name: "Package", price: 500 });
  const [customer] = await e.insert("customers", { business_id: b.id, name: "Ada" });
  const [sale] = await e.insert("transactions", {
    business_id: b.id, kind: "sale", txn_date: "2026-10-03", amount: 500, customer_id: customer.id, offer_id: offer.id,
  });
  const [payment] = await e.insert("payments", { transaction_id: sale.id, paid_on: "2026-10-04", amount: 200 });
  const [deal] = await e.insert("deals", { business_id: b.id, name: "Big one", created_on: "2026-10-01", offer_id: offer.id });
  const [metric] = await e.insert("metrics", { business_id: b.id, label: "DMs sent" });
  const [log] = await e.insert("activityLogs", { metric_id: metric.id, log_date: "2026-10-05", count: 12 });
  return { b, offer, customer, sale, payment, deal, metric, log };
}

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────── open ──
describe("Engine.open", () => {
  it("creates a profile and the default share and reminder settings on first run", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const s = e.getState();
    expect(s.profile).toMatchObject({
      id: UID, display_name: "Dean", timezone: "America/Chicago", onboarding_done: false, business_enabled: false, demo_mode: false,
    });
    expect(s.singles.shareSettings).toMatchObject({ id: "shareSettings", user_id: UID, ...SINGLE_DEFAULTS.shareSettings });
    expect(s.singles.reminderSettings).toMatchObject(SINGLE_DEFAULTS.reminderSettings);
    expect(s.singles.goals).toBeNull();
    for (const k of LIST_KEYS) expect(s.tables[k]).toEqual([]);
    expect(chunkIds(store, "")).toEqual(["profile", "s~reminderSettings", "s~shareSettings"]);
    expect(e.getStatus()).toMatchObject({ pending: 0, error: null });
    e.close();
  });

  it("falls back to a known time zone and trims a long name", async () => {
    const e = await open(new MemoryStore(), UID, { displayName: "x".repeat(80), timezone: "Mars/Olympus" });
    expect(e.getState().profile.timezone).toBe("America/New_York");
    expect(e.getState().profile.display_name).toHaveLength(60);
    e.close();
  });

  it("re-opening hydrates exactly the same state, across tables and months", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("weights", [
      { entry_date: "2026-08-15", weight: 270 }, { entry_date: "2026-09-01", weight: 266 },
      { entry_date: "2026-09-30", weight: 264, note: "after trip" }, { entry_date: "2026-10-09", waist_in: 44 },
    ]);
    await e.insert("checkins", { checkin_date: "2026-10-09", sleep_hours: 7.5, energy: 4 });
    await e.insert("symptoms", { log_date: "2026-09-20", pain_level: 3, side: "left" });
    await e.insert("nutrition", { log_date: "2026-10-01", meal: "lunch", calories: 650 });
    const [h] = await e.insert("habits", { name: "Walk", start_date: "2026-08-01" });
    await e.insert("completions", [{ habit_id: h.id, completed_on: "2026-08-02" }, { habit_id: h.id, completed_on: "2026-10-02" }]);
    const [wo] = await e.insert("workouts", { workout_date: "2026-09-12", activity: "strength", duration_min: 40 });
    await e.insert("sets", [{ workout_id: wo.id, exercise: "Squat", reps: 8, weight_lb: 135 }, { workout_id: wo.id, exercise: "Row", set_no: 2 }]);
    await e.insert("restDays", { rest_date: "2026-09-13" });
    await e.insert("tasks", { title: "Book physio", due_date: "2026-11-02" });
    await e.insert("journal", { entry_date: "2026-07-04", body: "Day one." });
    await e.insert("reviews", { period: "week", period_start: "2026-10-05", went_well: "Slept" });
    await e.upsert("roadmapNotes", { chapter_key: "ch1", objective: "Start" });
    await seedBusiness(e);
    await e.insert("transactions", { kind: "personal_income", txn_date: "2026-08-30", amount: 120 });
    await e.saveSingle("goals", { start_weight: 270, target_loss: 50, stretch_loss: 60, start_date: "2026-08-15" });
    await e.saveSingle("athletic", { weekly_session_target: 4 });
    await e.saveProfile({ onboarding_done: true, business_enabled: true, plan_preset: "primary" });

    // Rows live in month chunks; tables without a date field share one "all" chunk.
    expect(chunkIds(store, "t~weights")).toEqual(["t~weights~2026-08~0", "t~weights~2026-09~0", "t~weights~2026-10~0"]);
    expect(chunkIds(store, "t~habits")).toEqual(["t~habits~all~0"]);
    expect(chunkIds(store, "t~completions")).toEqual(["t~completions~2026-08~0", "t~completions~2026-10~0"]);

    const before = e.getState();
    e.close();
    const writes = store.writes;
    const again = await open(store);
    const after = again.getState();
    expect(store.writes).toBe(writes); // nothing is rewritten on a normal open
    expect(after.profile).toEqual(before.profile);
    expect(after.singles).toEqual(before.singles);
    for (const k of LIST_KEYS) expect(byId(after.tables[k]), k).toEqual(byId(before.tables[k]));
    expect(after.tables.weights).toHaveLength(4);
    again.close();
  });

  it("keeps a person's settings when their profile document is missing", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.saveSingle("shareSettings", { weight: "full" });
    e.close();
    store.docs.delete(`${BASE}/profile`);
    const again = await open(store);
    expect(again.getState().singles.shareSettings?.weight).toBe("full");
    expect(again.getState().profile.display_name).toBe("Dean");
    again.close();
  });

  it("stops retrying when the first save fails, so a later open isn't overwritten", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new MemoryStore();
    store.failNext = 3;
    await expect(open(store)).rejects.toBeInstanceOf(StorageError);
    const e = await open(store);
    await e.saveProfile({ onboarding_done: true });
    await vi.advanceTimersByTimeAsync(120_000);
    const stored = (await store.get(`${BASE}/profile`))!.row as Record<string, unknown>;
    expect(stored.onboarding_done).toBe(true);
    expect(e.getState().profile.onboarding_done).toBe(true);
    e.close();
  });
});

// ──────────────────────────────────────────────────────────── row rules ──
describe("row rules", () => {
  it("rejects a second weigh-in on the same date with a plain message, and writes nothing", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    const writes = store.writes;
    const rev = e.getState().rev;
    const err = await e.insert("weights", { entry_date: "2026-10-01", weight: 249 }).catch((x) => x);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe("There's already a weigh-in for that date — edit it instead.");
    expect(e.getState().tables.weights).toHaveLength(1);
    expect(e.getState().rev).toBe(rev);
    expect(store.writes).toBe(writes);
    // Duplicates inside one batch are caught too.
    await expect(e.insert("weights", [{ entry_date: "2026-10-02", weight: 249 }, { entry_date: "2026-10-02", weight: 248 }]))
      .rejects.toThrow("already a weigh-in");
    expect(e.getState().tables.weights).toHaveLength(1);
    e.close();
  });

  it("rejects moving a row onto another row's unique date", async () => {
    const e = await open(new MemoryStore());
    await e.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    const [b] = await e.insert("weights", { entry_date: "2026-10-02", weight: 249 });
    await expect(e.update("weights", b.id, { entry_date: "2026-10-01" })).rejects.toThrow("already a weigh-in");
    await e.update("weights", b.id, { weight: 248 }); // its own date is fine
    expect(e.getState().tables.weights.find((r) => r.id === b.id)?.weight).toBe(248);
    await expect(e.update("weights", "nope", { weight: 200 })).rejects.toThrow("no longer exists");
    e.close();
  });

  it("upsert merges into the existing row instead of failing", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const first = await e.upsert("weights", { entry_date: "2026-10-01", weight: 250, note: "am" });
    const second = await e.upsert("weights", { entry_date: "2026-10-01", weight: 249.4 });
    expect(second.id).toBe(first.id);
    expect(e.getState().tables.weights).toEqual([expect.objectContaining({ id: first.id, weight: 249.4, note: "am" })]);

    const [b] = await e.insert("businesses", { name: "Shop" });
    const [m] = await e.insert("metrics", { business_id: b.id, label: "Calls" });
    await e.upsert("activityLogs", { metric_id: m.id, log_date: "2026-10-01", count: 3 }, ["metric_id", "log_date"]);
    await e.upsert("activityLogs", { metric_id: m.id, log_date: "2026-10-01", count: 5 }, ["metric_id", "log_date"]);
    await e.upsert("activityLogs", { metric_id: m.id, log_date: "2026-10-02", count: 1 }, ["metric_id", "log_date"]);
    expect(e.getState().tables.activityLogs.map((r) => r.count).sort()).toEqual([1, 5]);

    await e.upsert("roadmapNotes", { chapter_key: "ch2", objective: "A" });
    await e.upsert("roadmapNotes", { chapter_key: "ch2", reflection: "B" });
    expect(e.getState().tables.roadmapNotes).toEqual([expect.objectContaining({ id: "ch2", objective: "A", reflection: "B" })]);
    e.close();
    const again = await open(store);
    expect(again.getState().tables.weights).toHaveLength(1);
    expect(again.getState().tables.roadmapNotes).toHaveLength(1);
    again.close();
  });

  it("rejects inserting a row whose id already exists", async () => {
    const e = await open(new MemoryStore());
    await e.insert("journal", { id: "j1", entry_date: "2026-10-01", body: "a" });
    await expect(e.insert("journal", { id: "j1", entry_date: "2026-10-02", body: "b" })).rejects.toBeInstanceOf(ValidationError);
    // Roadmap notes use the chapter as their id, so a plain insert can't duplicate one either.
    await e.insert("roadmapNotes", { chapter_key: "ch1" });
    await expect(e.insert("roadmapNotes", { chapter_key: "ch1" })).rejects.toBeInstanceOf(ValidationError);
    expect(e.getState().tables.journal).toHaveLength(1);
    expect(e.getState().tables.roadmapNotes).toHaveLength(1);
    e.close();
  });

  it("generates ids, fills defaults and stamps the owner", async () => {
    const e = await open(new MemoryStore());
    const [r] = await e.insert("workouts", { workout_date: "2026-10-01", activity: "run", user_id: "someone-else" });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r).toMatchObject({ user_id: UID, is_race: false, title: null, rpe: null });
    expect(typeof r.created_at).toBe("string");
    const upd = await e.update("workouts", r.id, { title: "Easy", user_id: "x" });
    expect(upd).toMatchObject({ id: r.id, user_id: UID, title: "Easy" });
    expect(typeof upd.updated_at).toBe("string");
    e.close();
  });

  it.each<[ListKey, Record<string, unknown>, string | RegExp]>([
    ["weights", { entry_date: "2026-10-01", weight: -5 }, "Weight must be between 70 and 700."],
    ["weights", { entry_date: "2026-10-01", weight: 900 }, "Weight must be between"],
    ["weights", { entry_date: "2026-10-01" }, "Enter a weight or a waist measurement."],
    ["weights", { entry_date: "2026-02-30", weight: 200 }, "valid date"],
    ["weights", { weight: 200 }, "Missing entry date."],
    ["weights", { entry_date: "2026-10-01", weight: "200" }, "Weight must be between"],
    ["checkins", { checkin_date: "2026-10-01", sleep_hours: 25 }, "Sleep"],
    ["checkins", { checkin_date: "2026-10-01", energy: 6 }, "energy"],
    ["symptoms", { log_date: "2026-10-01", pain_level: 11 }, "Pain level"],
    ["symptoms", { log_date: "2026-10-01", pain_level: 2, side: "up" }, "Side isn't a valid choice."],
    ["nutrition", { log_date: "2026-10-01", meal: "brunch" }, "Meal"],
    ["workouts", { workout_date: "2026-10-01", activity: "skydiving" }, "Activity"],
    ["workouts", { workout_date: "2026-10-01", activity: "run", duration_min: 0 }, "Duration"],
    ["habits", { name: "Walk", start_date: "2026-10-01", schedule_days: [] }, "Choose at least one scheduled day."],
    ["habits", { name: "Walk", start_date: "2026-10-01", schedule_days: [7] }, "Choose at least one scheduled day."],
    ["habits", { name: "Walk", start_date: "2026-10-05", archived_on: "2026-10-01" }, "archived before it starts"],
    ["habits", { name: "x".repeat(81), start_date: "2026-10-01" }, "too long"],
    ["journal", { entry_date: "2026-10-01", body: "x".repeat(10_001) }, "too long"],
    ["reviews", { period: "year", period_start: "2026-10-01" }, "Review period"],
    ["transactions", { kind: "personal_income", txn_date: "2026-10-01", amount: 0 }, "greater than zero"],
    ["transactions", { kind: "sale", txn_date: "2026-10-01", amount: 10 }, "belong to a business"],
    ["transactions", { kind: "personal_income", txn_date: "2026-10-01", amount: 10, business_id: "b" }, "can't belong to a business"],
    ["transactions", { kind: "gig_income", txn_date: "2026-10-01", amount: 10, recurring: true }, "Only sales can be recurring."],
    ["transactions", { kind: "personal_income", txn_date: "2026-10-01", amount: 10, expense_category: "rent" }, "Only expenses"],
    ["notifications", { kind: "x", title: "Hi" }, "Missing dedupe key."],
  ])("rejects a bad %s row: %o", async (table, row, msg) => {
    const e = await open(new MemoryStore());
    await expect(e.insert(table, row)).rejects.toThrow(msg);
    expect(e.getState().tables[table]).toHaveLength(0);
    e.close();
  });

  it("applies the same rules on update, and to settings and the profile", async () => {
    const e = await open(new MemoryStore());
    const [r] = await e.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    await expect(e.update("weights", r.id, { weight: 50 })).rejects.toBeInstanceOf(ValidationError);
    expect(e.getState().tables.weights[0].weight).toBe(250);
    await expect(e.saveSingle("goals", { start_weight: 250, target_loss: 50, stretch_loss: 40 })).rejects.toThrow("stretch goal");
    await expect(e.saveSingle("goals", { start_weight: 100, target_loss: 50 })).rejects.toThrow("realistic");
    await expect(e.saveSingle("businessSettings", { goal_amount: 0 })).rejects.toThrow("more than $0");
    await expect(e.saveSingle("athletic", { weekly_session_target: 20 })).rejects.toThrow("Sessions per week");
    expect(e.getState().singles.goals).toBeNull();
    await expect(e.saveProfile({ timezone: "Nowhere/Land" })).rejects.toThrow("Unknown time zone");
    expect(e.getState().profile.timezone).toBe("America/Chicago");
    e.close();
  });

  it("bulk loads rows with the row rules", async () => {
    const e = await open(new MemoryStore());
    await expect(e.bulk({ tables: { weights: [{ entry_date: "2026-10-01", weight: 10 }] } })).rejects.toBeInstanceOf(ValidationError);
    expect(e.getState().tables.weights).toHaveLength(0);
    await e.bulk({ tables: { weights: [{ entry_date: "2026-10-01", weight: 200 }] }, singles: { athletic: { phase: "aerobic_base" } } });
    expect(e.getState().tables.weights).toHaveLength(1);
    expect(e.getState().singles.athletic).toMatchObject({ phase: "aerobic_base", weekly_session_target: 3 });
    e.close();
  });

  it("moves a row between month chunks when its date changes", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const [r] = await e.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    await e.update("weights", r.id, { entry_date: "2026-09-28" });
    e.close();
    const again = await open(store);
    expect(again.getState().tables.weights).toEqual([expect.objectContaining({ id: r.id, entry_date: "2026-09-28" })]);
    again.close();
  });
});

// ─────────────────────────────────────────────────────── parent links ──
describe("parent links", () => {
  it("requires the parent to exist", async () => {
    const e = await open(new MemoryStore());
    await expect(e.insert("sets", { exercise: "Squat" })).rejects.toThrow("Missing workout id.");
    await expect(e.insert("sets", { workout_id: "ghost", exercise: "Squat" })).rejects.toThrow("The linked record no longer exists.");
    await expect(e.insert("completions", { habit_id: "ghost", completed_on: "2026-10-01" })).rejects.toThrow("no longer exists");
    await expect(e.insert("transactions", { kind: "expense", business_id: "ghost", txn_date: "2026-10-01", amount: 5 }))
      .rejects.toThrow("no longer exists");
    const { b } = await seedBusiness(e);
    await expect(e.insert("transactions", { kind: "sale", business_id: b.id, customer_id: "ghost", txn_date: "2026-10-01", amount: 5 }))
      .rejects.toThrow("no longer exists");
    await expect(e.insert("achievements", { key: "k", category: "weight", title: "t", achieved_on: "2026-10-01", photo_id: "ghost" }))
      .rejects.toThrow("no longer exists");
    e.close();
  });

  it("deleting a workout deletes its sets and nothing else", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const [w1, w2] = await e.insert("workouts", [
      { workout_date: "2026-09-30", activity: "strength" }, { workout_date: "2026-10-01", activity: "strength" },
    ]);
    await e.insert("sets", [
      { workout_id: w1.id, exercise: "A" }, { workout_id: w1.id, exercise: "B" }, { workout_id: w2.id, exercise: "C" },
    ]);
    await e.remove("workouts", w1.id);
    expect(e.getState().tables.workouts.map((r) => r.id)).toEqual([w2.id]);
    expect(e.getState().tables.sets.map((r) => r.exercise)).toEqual(["C"]);
    e.close();
    const again = await open(store);
    expect(again.getState().tables.sets.map((r) => r.exercise)).toEqual(["C"]);
    expect(again.getState().tables.workouts).toHaveLength(1);
    again.close();
  });

  it("deleting a habit deletes its completions", async () => {
    const e = await open(new MemoryStore());
    const [h1, h2] = await e.insert("habits", [{ name: "A", start_date: "2026-10-01" }, { name: "B", start_date: "2026-10-01" }]);
    await e.insert("completions", [{ habit_id: h1.id, completed_on: "2026-10-01" }, { habit_id: h2.id, completed_on: "2026-10-01" }]);
    await e.remove("habits", h1.id);
    expect(e.getState().tables.completions.map((c) => c.habit_id)).toEqual([h2.id]);
    e.close();
  });

  it("deleting a business deletes everything under it, and only that", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const one = await seedBusiness(e, "One");
    const two = await seedBusiness(e, "Two");
    const [personal] = await e.insert("transactions", { kind: "personal_income", txn_date: "2026-10-02", amount: 50 });
    await e.remove("businesses", one.b.id);

    const check = (eng: Engine) => {
      const t = eng.getState().tables;
      expect(t.businesses.map((r) => r.id)).toEqual([two.b.id]);
      for (const k of ["offers", "customers", "deals", "metrics"] as const) {
        expect(t[k].map((r) => r.business_id), k).toEqual([two.b.id]);
      }
      expect(t.transactions.map((r) => r.id).sort()).toEqual([two.sale.id, personal.id].sort());
      expect(t.payments.map((r) => r.id)).toEqual([two.payment.id]);
      expect(t.activityLogs.map((r) => r.id)).toEqual([two.log.id]);
    };
    check(e);
    e.close();
    const again = await open(store);
    check(again);
    again.close();
  });

  it("deleting a customer or offer unlinks the rows that pointed at it", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const { customer, offer, sale, deal } = await seedBusiness(e);
    await e.remove("customers", customer.id);
    expect(e.getState().tables.transactions.find((r) => r.id === sale.id)).toMatchObject({ customer_id: null, offer_id: offer.id });
    await e.remove("offers", offer.id);
    expect(e.getState().tables.transactions.find((r) => r.id === sale.id)?.offer_id).toBeNull();
    expect(e.getState().tables.deals.find((r) => r.id === deal.id)?.offer_id).toBeNull();
    expect(e.getState().tables.payments).toHaveLength(1);
    e.close();
    const again = await open(store);
    expect(again.getState().tables.transactions[0]).toMatchObject({ customer_id: null, offer_id: null });
    expect(again.getState().tables.deals[0].offer_id).toBeNull();
    again.close();
  });

  it("deleting a photo unlinks its achievement and removes the stored image", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const [p] = await e.insert("photos", { taken_on: "2026-10-01", storage_path: "x" });
    await e.putImage(p.id, "data:image/jpeg;base64,AAAA");
    const [a] = await e.insert("achievements", { key: "weight.5", category: "weight", title: "5 lb", achieved_on: "2026-10-01", photo_id: p.id });
    expect(await e.getImage(p.id)).toBe("data:image/jpeg;base64,AAAA");
    await e.remove("photos", p.id);
    expect(e.getState().tables.achievements).toEqual([expect.objectContaining({ id: a.id, photo_id: null })]);
    expect(await e.getImage(p.id)).toBeNull();
    expect(store.docs.has(`${e.mediaCollection}/${p.id}`)).toBe(false);
    e.close();
  });

  it("refuses an oversized image", async () => {
    const e = await open(new MemoryStore());
    await expect(e.putImage("p", "x".repeat(240_001))).rejects.toThrow("too large");
    e.close();
  });

  it("removing ids that don't exist does nothing", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const writes = store.writes;
    await e.remove("weights", ["a", "b"]);
    expect(store.writes).toBe(writes);
    e.close();
  });
});

// ──────────────────────────────────────────────────────────── payments ──
describe("payments", () => {
  async function setup() {
    const e = await open(new MemoryStore());
    const [b] = await e.insert("businesses", { name: "Shop" });
    const [sale] = await e.insert("transactions", { business_id: b.id, kind: "sale", txn_date: "2026-10-01", amount: 100 });
    const [expense] = await e.insert("transactions", { business_id: b.id, kind: "expense", txn_date: "2026-10-01", amount: 30 });
    return { e, b, sale, expense };
  }

  it("only records payments against sales", async () => {
    const { e, expense } = await setup();
    await expect(e.insert("payments", { transaction_id: expense.id, paid_on: "2026-10-02", amount: 10 }))
      .rejects.toThrow("Payments can only be recorded against sales.");
    await expect(e.insert("payments", { transaction_id: "ghost", paid_on: "2026-10-02", amount: 10 })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.insert("payments", { transaction_id: expense.id, paid_on: "2026-10-02", amount: -1 })).rejects.toThrow("more than zero");
    e.close();
  });

  it("keeps cash collected at or below the sale amount", async () => {
    const { e, sale } = await setup();
    await e.insert("payments", { transaction_id: sale.id, paid_on: "2026-10-02", amount: 60 });
    const [p2] = await e.insert("payments", { transaction_id: sale.id, paid_on: "2026-10-03", amount: 40 });
    await expect(e.insert("payments", { transaction_id: sale.id, paid_on: "2026-10-04", amount: 0.01 }))
      .rejects.toThrow("Cash collected ($100.01) would exceed the sale amount ($100.00).");
    await expect(e.update("payments", p2.id, { amount: 41 })).rejects.toThrow("would exceed");
    await e.update("payments", p2.id, { amount: 39 });
    expect(e.getState().tables.payments).toHaveLength(2);
    e.close();
  });

  it("checks the total across a multi-row insert too", async () => {
    const { e, sale } = await setup();
    await expect(e.insert("payments", [
      { transaction_id: sale.id, paid_on: "2026-10-02", amount: 70 },
      { transaction_id: sale.id, paid_on: "2026-10-03", amount: 70 },
    ])).rejects.toThrow("would exceed");
    expect(e.getState().tables.payments).toHaveLength(0);
    await e.insert("payments", [
      { transaction_id: sale.id, paid_on: "2026-10-02", amount: 50 },
      { transaction_id: sale.id, paid_on: "2026-10-03", amount: 50 },
    ]);
    expect(e.getState().tables.payments).toHaveLength(2);
    e.close();
  });

  it("protects a sale that has payments", async () => {
    const { e, b, sale } = await setup();
    await e.insert("payments", { transaction_id: sale.id, paid_on: "2026-10-02", amount: 80 });
    await expect(e.update("transactions", sale.id, { kind: "refund" }))
      .rejects.toThrow("Remove the recorded payments before changing this sale's type.");
    await expect(e.update("transactions", sale.id, { amount: 79 }))
      .rejects.toThrow("Sale amount can't be less than cash already collected ($80.00).");
    await e.update("transactions", sale.id, { amount: 80 });
    await e.update("transactions", sale.id, { amount: 150, description: "Upsell" });
    expect(e.getState().tables.transactions.find((r) => r.id === sale.id)).toMatchObject({ amount: 150, kind: "sale" });
    // An unpaid sale can change type freely.
    const [other] = await e.insert("transactions", { business_id: b.id, kind: "sale", txn_date: "2026-10-05", amount: 10 });
    await e.update("transactions", other.id, { kind: "refund" });
    // Deleting the sale takes its payments with it.
    await e.remove("transactions", sale.id);
    expect(e.getState().tables.payments).toHaveLength(0);
    e.close();
  });
});

// ─────────────────────────────────────────────────────── notifications ──
describe("notifications", () => {
  it("keeps only the newest 300", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const at = (i: number) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
    const rows = Array.from({ length: 305 }, (_, i) => ({ kind: "reminder", title: `n${i}`, dedupe_key: `k${i}`, created_at: at(i) }));
    await e.insert("notifications", rows.slice(0, 200));
    await e.insert("notifications", rows.slice(200));
    const titles = e.getState().tables.notifications.map((n) => n.title);
    expect(titles).toHaveLength(300);
    for (let i = 0; i < 5; i++) expect(titles).not.toContain(`n${i}`);
    expect(titles).toContain("n5");
    expect(titles).toContain("n304");
    await expect(e.insert("notifications", { kind: "reminder", title: "dup", dedupe_key: "k304" })).rejects.toBeInstanceOf(ValidationError);
    e.close();
    const again = await open(store);
    expect(again.getState().tables.notifications).toHaveLength(300);
    again.close();
  });
});

// ──────────────────────────────────────────────────────── chunk paging ──
describe("chunk pages", () => {
  const big = (i: number) => ({ id: `j${i}`, entry_date: "2026-10-01", body: `${i}:`.padEnd(9000, "x") });

  it("splits a large month over several pages and reads every row back", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("journal", Array.from({ length: 40 }, (_, i) => big(i)));
    const pages = chunkIds(store, "t~journal~2026-10");
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const p of pages) expect(JSON.stringify(store.docs.get(`${BASE}/${p}`)).length).toBeLessThan(160_000);
    e.close();

    const again = await open(store);
    const rows = again.getState().tables.journal;
    expect(rows).toHaveLength(40);
    expect(byId(rows)).toEqual(byId(e.getState().tables.journal));
    again.close();
  });

  it("removes pages left over after a chunk shrinks", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("journal", Array.from({ length: 40 }, (_, i) => big(i)));
    await e.remove("journal", Array.from({ length: 30 }, (_, i) => `j${i}`));
    const mid = chunkIds(store, "t~journal~2026-10");
    expect(mid.length).toBeGreaterThanOrEqual(1);
    expect(mid.length).toBeLessThan(3);
    e.close();

    // A fresh engine learns the page count from storage and cleans up too.
    const again = await open(store);
    expect(again.getState().tables.journal).toHaveLength(10);
    await again.remove("journal", Array.from({ length: 9 }, (_, i) => `j${30 + i}`));
    expect(chunkIds(store, "t~journal~2026-10")).toEqual(["t~journal~2026-10~0"]);
    again.close();

    const last = await open(store);
    expect(last.getState().tables.journal.map((r) => r.id)).toEqual(["j39"]);
    last.close();
  });

  it("ignores pages from an older write that weren't cleaned up", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("journal", { id: "keep", entry_date: "2026-10-01", body: "kept" });
    e.close();
    store.docs.set(`${BASE}/t~journal~2026-10~1`, {
      table: "journal", bucket: "2026-10", page: 1, pages: 2, ver: "old", rows: [{ id: "ghost", entry_date: "2026-10-01", body: "x" }],
    });
    const again = await open(store);
    expect(again.getState().tables.journal.map((r) => r.id)).toEqual(["keep"]);
    again.close();
  });
});

// ─────────────────────────────────────────────────── storage failures ──
describe("storage failures", () => {
  it("shows the row at once, reports the failure, retries, then clears the error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new MemoryStore();
    const e = await open(store);
    const statuses: number[] = [];
    e.subscribeStatus(() => statuses.push(e.getStatus().pending));

    store.failNext = 1;
    const p = e.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    expect(e.getState().tables.weights).toHaveLength(1); // on screen before storage answers
    await expect(p).rejects.toBeInstanceOf(StorageError);
    expect(e.getStatus().error).toBe("Simulated storage failure.");
    expect(statuses.some((n) => n > 0)).toBe(true);
    expect(chunkIds(store, "t~weights")).toEqual([]);

    await vi.advanceTimersByTimeAsync(3000);
    expect(e.getStatus()).toMatchObject({ error: null, pending: 0 });
    expect(e.getStatus().lastSavedAt).not.toBeNull();
    expect(chunkIds(store, "t~weights")).toEqual(["t~weights~2026-10~0"]);
    e.close();
    const again = await open(store);
    expect(again.getState().tables.weights).toHaveLength(1);
    again.close();
  });

  it("backs off and keeps trying until storage comes back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new MemoryStore();
    const e = await open(store);
    store.failNext = 2;
    await expect(e.saveSingle("goals", { start_weight: 260, target_loss: 40 })).rejects.toBeInstanceOf(StorageError);
    await vi.advanceTimersByTimeAsync(3000); // first retry fails
    expect(e.getStatus().error).not.toBeNull();
    expect(await store.get(`${BASE}/s~goals`)).toBeNull();
    await vi.advanceTimersByTimeAsync(5999);
    expect(await store.get(`${BASE}/s~goals`)).toBeNull();
    await vi.advanceTimersByTimeAsync(1); // second retry, 6 s later, succeeds
    expect(e.getStatus().error).toBeNull();
    expect((await store.get(`${BASE}/s~goals`))?.row).toMatchObject({ start_weight: 260 });
    e.close();
  });

  it("a later edit to the same chunk saves the newest state", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new MemoryStore();
    const e = await open(store);
    store.failNext = 1;
    await e.insert("weights", { entry_date: "2026-10-01", weight: 250 }).catch(() => undefined);
    await e.insert("weights", { entry_date: "2026-10-02", weight: 249 });
    await e.settled();
    expect(e.getStatus().error).toBeNull();
    const stored = (await store.get(`${BASE}/t~weights~2026-10~0`))!.rows as Row[];
    expect(stored).toHaveLength(2);
    e.close();
  });
});

// ────────────────────────────────────────────────────── other devices ──
describe("changes from another device", () => {
  it("picks up rows, settings and profile written elsewhere", async () => {
    const store = new MemoryStore();
    const phone = await open(store);
    const laptop = await open(store);
    let renders = 0;
    phone.subscribe(() => renders++);

    await laptop.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    await laptop.saveSingle("goals", { start_weight: 260, target_loss: 40 });
    await laptop.saveProfile({ display_name: "Dean B" });
    await flush();
    expect(phone.getState().tables.weights).toEqual([expect.objectContaining({ entry_date: "2026-10-01", weight: 250 })]);
    expect(phone.getState().singles.goals).toMatchObject({ start_weight: 260 });
    expect(phone.getState().profile.display_name).toBe("Dean B");
    expect(renders).toBeGreaterThan(0);

    const [row] = laptop.getState().tables.weights;
    await laptop.update("weights", row.id, { weight: 248 });
    await flush();
    expect(phone.getState().tables.weights[0].weight).toBe(248);
    await laptop.remove("weights", row.id);
    await flush();
    expect(phone.getState().tables.weights).toEqual([]);
    phone.close();
    laptop.close();
  });

  it("doesn't let a remote write replace a local edit that hasn't saved yet", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new MemoryStore();
    const phone = await open(store);
    const laptop = await open(store);
    store.failNext = 1;
    await phone.insert("weights", { entry_date: "2026-10-01", weight: 250 }).catch(() => undefined);
    expect(phone.getStatus().error).not.toBeNull();
    await laptop.insert("weights", { entry_date: "2026-10-05", weight: 249 });
    await flush();
    // The phone's unsaved weigh-in is still there, next to the laptop's.
    expect(phone.getState().tables.weights.map((r) => r.entry_date).sort()).toEqual(["2026-10-01", "2026-10-05"]);
    // Other chunks sync as usual.
    await laptop.insert("weights", { entry_date: "2026-09-05", weight: 252 });
    await flush();
    expect(phone.getState().tables.weights.map((r) => r.entry_date).sort()).toEqual(["2026-09-05", "2026-10-01", "2026-10-05"]);
    await vi.advanceTimersByTimeAsync(3000);
    await phone.settled();
    expect(phone.getStatus().error).toBeNull();
    await flush();
    expect(laptop.getState().tables.weights.map((r) => r.entry_date).sort()).toEqual(["2026-09-05", "2026-10-01", "2026-10-05"]);
    phone.close();
    laptop.close();
  });

  it("ignores its own echoes, including a late one from an earlier save", async () => {
    const store = new TapStore();
    const e = await open(store);
    await e.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    await flush();
    const old = await store.list(BASE); // snapshot holding only the first weigh-in
    await e.insert("weights", { entry_date: "2026-10-02", weight: 249 });
    await flush();
    const rev = e.getState().rev;
    for (const tap of store.taps) tap(old); // the old snapshot arrives late
    expect(e.getState().tables.weights.map((r) => r.entry_date).sort()).toEqual(["2026-10-01", "2026-10-02"]);
    expect(e.getState().rev).toBe(rev);
    for (const tap of store.taps) tap(await store.list(BASE));
    expect(e.getState().rev).toBe(rev);
    e.close();
  });

  it("ignores a late echo of its own settings and profile", async () => {
    const store = new TapStore();
    const e = await open(store);
    const old = await store.list(BASE);
    await e.saveSingle("shareSettings", { weight: "pounds" });
    await e.saveProfile({ onboarding_done: true });
    await flush();
    for (const tap of store.taps) tap(old);
    expect(e.getState().singles.shareSettings?.weight).toBe("pounds");
    expect(e.getState().profile.onboarding_done).toBe(true);
    e.close();
  });

  it("doesn't bring back records from a snapshot taken before a reset", async () => {
    const store = new TapStore();
    const first = await open(store);
    await first.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    await first.saveSingle("goals", { start_weight: 260, target_loss: 40 });
    first.close();
    const e = await open(store); // these versions were loaded, not written, by this engine
    const old = await store.list(BASE);
    await e.reset();
    await flush();
    for (const tap of store.taps) tap(old);
    expect(e.getState().tables.weights).toEqual([]);
    expect(e.getState().singles.goals).toBeNull();
    e.close();
  });

  it("keeps edits made while its own save is in flight", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    const a = e.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    const b = e.insert("weights", { entry_date: "2026-10-02", weight: 249 });
    const c = e.insert("weights", { entry_date: "2026-10-03", weight: 248 });
    await Promise.all([a, b, c]);
    await flush();
    expect(e.getState().tables.weights).toHaveLength(3);
    expect(((await store.get(`${BASE}/t~weights~2026-10~0`))!.rows as Row[])).toHaveLength(3);
    e.close();
  });

  it("stops listening once closed", async () => {
    const store = new MemoryStore();
    const phone = await open(store);
    const laptop = await open(store);
    phone.close();
    await laptop.insert("weights", { entry_date: "2026-10-01", weight: 250 });
    await flush();
    expect(phone.getState().tables.weights).toEqual([]);
    laptop.close();
  });
});

// ─────────────────────────────────────────────────── export and import ──
describe("export and import", () => {
  async function populated(store = new MemoryStore()) {
    const e = await open(store);
    await e.insert("weights", [{ entry_date: "2026-08-01", weight: 270 }, { entry_date: "2026-10-01", weight: 262 }]);
    const [wo] = await e.insert("workouts", { workout_date: "2026-10-02", activity: "strength" });
    await e.insert("sets", { workout_id: wo.id, exercise: "Squat", reps: 5 });
    const [p] = await e.insert("photos", { taken_on: "2026-10-01", storage_path: "p" });
    await e.putImage(p.id, "data:image/jpeg;base64,QUJD");
    await e.insert("achievements", { key: "weight.5", category: "weight", title: "5 lb", achieved_on: "2026-10-01", photo_id: p.id });
    await seedBusiness(e);
    await e.insert("journal", { entry_date: "2026-10-03", body: "Note", shared: true });
    await e.saveSingle("goals", { start_weight: 270, target_loss: 50 });
    await e.saveSingle("shareSettings", { weight: "pounds" });
    await e.saveProfile({ onboarding_done: true, business_enabled: true, display_name: "Dean" });
    return { e, store, photoId: p.id };
  }

  it("round-trips every record and photo into a fresh space", async () => {
    const { e, photoId } = await populated();
    const file = JSON.parse(JSON.stringify(await e.exportAll(true))) as ExportFile;
    expect(file).toMatchObject({ app: "becoming-os", version: 1 });
    expect(file.images).toEqual({ [photoId]: "data:image/jpeg;base64,QUJD" });

    const store2 = new MemoryStore();
    const other = await open(store2, "u2", { displayName: "New", timezone: "Europe/London" });
    await other.importAll(file);
    const src = e.getState();
    const dst = other.getState();
    for (const k of LIST_KEYS) {
      const strip = (rows: Row[]) => byId(rows).map(({ user_id: _u, ...r }) => r);
      expect(strip(dst.tables[k]), k).toEqual(strip(src.tables[k]));
      for (const r of dst.tables[k]) expect(r.user_id).toBe("u2");
    }
    expect(dst.singles.goals).toMatchObject({ start_weight: 270, target_loss: 50, user_id: "u2" });
    expect(dst.singles.shareSettings).toMatchObject({ weight: "pounds" });
    expect(dst.profile).toMatchObject({ id: "u2", onboarding_done: true, business_enabled: true, display_name: "Dean", timezone: "America/Chicago" });
    expect(await other.getImage(photoId)).toBe("data:image/jpeg;base64,QUJD");
    other.close();

    const reopened = await Engine.open(store2, "u2", { displayName: "x", timezone: "UTC" });
    expect(reopened.getState().tables.sets).toHaveLength(1);
    expect(reopened.getState().profile.onboarding_done).toBe(true);
    reopened.close();
    e.close();
  });

  it("can leave photos out of the file", async () => {
    const { e } = await populated();
    const file = await e.exportAll(false);
    expect(file.images).toEqual({});
    expect(file.tables.photos).toHaveLength(1);
    e.close();
  });

  it("replaces what was there before", async () => {
    const { e } = await populated();
    const file = await e.exportAll();
    await e.insert("weights", { entry_date: "2026-10-09", weight: 260 });
    await e.importAll(file);
    expect(e.getState().tables.weights.map((r) => r.entry_date).sort()).toEqual(["2026-08-01", "2026-10-01"]);
    e.close();
  });

  it("refuses a file that isn't a backup", async () => {
    const e = await open(new MemoryStore());
    await expect(e.importAll({ hello: 1 } as unknown as ExportFile)).rejects.toThrow("isn't a BECOMING OS backup");
    e.close();
  });

  it("leaves current records untouched when a backup holds a bad row", async () => {
    const { e, store } = await populated();
    const file = await e.exportAll();
    const bad = { ...file, tables: { ...file.tables, weights: [...file.tables.weights!, { id: "bad", entry_date: "2026-10-04", weight: 5 }] } };
    const before = e.getState();
    await expect(e.importAll(bad)).rejects.toThrow("nothing was changed");
    expect(e.getState()).toBe(before);
    e.close();
    const again = await open(store);
    expect(again.getState().tables.weights).toHaveLength(2);
    expect(again.getState().profile.onboarding_done).toBe(true);
    again.close();
  });
});

// ───────────────────────────────────────────────────────────── reset ──
describe("reset", () => {
  it("clears records and photos but keeps sharing and reminder choices", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("weights", [{ entry_date: "2026-09-01", weight: 270 }, { entry_date: "2026-10-01", weight: 262 }]);
    await seedBusiness(e);
    const [p] = await e.insert("photos", { taken_on: "2026-10-01", storage_path: "p" });
    await e.putImage(p.id, "data:image/png;base64,AA");
    await e.saveSingle("goals", { start_weight: 270, target_loss: 50 });
    await e.saveSingle("businessSettings", { goal_amount: 5000 });
    await e.saveSingle("shareSettings", { weight: "full", business: "summary" });
    await e.saveSingle("reminderSettings", { daily_logging_hour: 7 });
    await e.saveProfile({ onboarding_done: true, business_enabled: true, demo_mode: true, demo_today: "2026-10-01", plan_preset: "primary" });

    await e.reset();
    const check = (eng: Engine, weights = 0) => {
      const s = eng.getState();
      for (const k of LIST_KEYS) expect(s.tables[k], k).toHaveLength(k === "weights" ? weights : 0);
      expect(s.singles.goals).toBeNull();
      expect(s.singles.athletic).toBeNull();
      expect(s.singles.businessSettings).toBeNull();
      expect(s.singles.shareSettings).toMatchObject({ weight: "full", business: "summary" });
      expect(s.singles.reminderSettings).toMatchObject({ daily_logging_hour: 7 });
      expect(s.profile).toMatchObject({
        onboarding_done: false, business_enabled: false, demo_mode: false, demo_today: null, plan_preset: null, display_name: "Dean",
      });
    };
    check(e);
    expect(chunkIds(store, "t~")).toEqual([]);
    expect(await e.getImage(p.id)).toBeNull();
    expect(chunkIds(store, "")).toEqual(["profile", "s~reminderSettings", "s~shareSettings"]);
    // Works normally afterwards.
    await e.insert("weights", { entry_date: "2026-10-01", weight: 261 });
    e.close();
    const again = await open(store);
    check(again, 1);
    again.close();
  });
});

// ──────────────────────────────────────────────── review regressions ──
/** Let both engines finish saving and hear each other, until nothing changes. */
async function quiet(...engines: Engine[]) {
  for (let i = 0; i < 6; i++) {
    for (const e of engines) await e.settled();
    await flush();
  }
}

/** A MemoryStore that shares another's documents but never hears about changes (an offline device). */
function deafTwin(store: MemoryStore) {
  const twin = new MemoryStore();
  twin.docs = store.docs;
  twin.watch = () => () => true;
  return twin;
}

const dates = (e: Engine, t: ListKey = "weights", f = "entry_date") => e.getState().tables[t].map((r) => r[f] as string).sort();
const storedRows = async (store: MemoryStore, key: string) => {
  const again = await open(store);
  const rows = again.getState().tables[key as ListKey];
  again.close();
  return rows;
};

describe("two devices writing the same month", () => {
  it("a failed save, retried after another device wrote that month, keeps both devices' rows", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new MemoryStore();
    const phone = await open(store);
    const laptop = await open(store);
    store.failNext = 1;
    await phone.insert("weights", { entry_date: "2026-10-01", weight: 200 }).catch(() => undefined);
    await laptop.insert("weights", [
      { entry_date: "2026-10-02", weight: 199 }, { entry_date: "2026-10-03", weight: 198 }, { entry_date: "2026-10-04", weight: 197 },
    ]);
    await flush();
    await vi.advanceTimersByTimeAsync(3000);
    await quiet(phone, laptop);
    const all = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
    expect(dates(phone)).toEqual(all);
    expect(dates(laptop)).toEqual(all);
    expect((await storedRows(store, "weights")).map((r) => r.entry_date).sort()).toEqual(all);
    phone.close();
    laptop.close();
  });

  it("two devices saving one month at the same moment both keep their rows", async () => {
    const store = new MemoryStore();
    const phone = await open(store);
    const laptop = await open(store);
    await Promise.all([
      phone.insert("weights", { entry_date: "2026-10-01", weight: 200 }),
      laptop.insert("weights", { entry_date: "2026-10-02", weight: 199 }),
    ]);
    await quiet(phone, laptop);
    expect(dates(phone)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(dates(laptop)).toEqual(["2026-10-01", "2026-10-02"]);
    expect((await storedRows(store, "weights"))).toHaveLength(2);
    // Deletes still win once both have seen each other's rows.
    await laptop.remove("weights", laptop.getState().tables.weights.find((r) => r.entry_date === "2026-10-01")!.id);
    await quiet(phone, laptop);
    expect(dates(phone)).toEqual(["2026-10-02"]);
    expect((await storedRows(store, "weights")).map((r) => r.entry_date)).toEqual(["2026-10-02"]);
    phone.close();
    laptop.close();
  });

  it("a device that missed another's write reads that month again before saving over it", async () => {
    const store = new MemoryStore();
    const phone = await open(deafTwin(store));
    await phone.insert("weights", { entry_date: "2026-10-01", weight: 200 });
    const laptop = await open(store);
    await laptop.insert("weights", { entry_date: "2026-10-02", weight: 199 });
    await phone.insert("weights", { entry_date: "2026-10-03", weight: 198 });
    expect(dates(phone)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect((await storedRows(store, "weights")).map((r) => r.entry_date).sort()).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    phone.close();
    laptop.close();
  });

  it("a chunk waiting for a write slot keeps its local edit when another device's version arrives", async () => {
    const store = new TapStore();
    const phone = await open(store);
    const months = Array.from({ length: 8 }, (_, i) => ({ entry_date: `2026-0${i + 1}-15`, weight: 200 - i }));
    const p = phone.insert("weights", months);
    expect(phone.getStatus().pending).toBe(8); // counted at once
    const remote: StoredDoc = {
      id: "t~weights~2026-08~0",
      data: { table: "weights", bucket: "2026-08", page: 0, pages: 1, ver: "laptop01", after: [], rows: [{ id: "lap", entry_date: "2026-08-20", weight: 190 }] },
    };
    for (const tap of store.taps) tap([...(await store.list(BASE)), remote]);
    expect(dates(phone).filter((d) => d.startsWith("2026-08"))).toEqual(["2026-08-15", "2026-08-20"]);
    await p;
    await quiet(phone);
    expect((await storedRows(store, "weights")).filter((r) => String(r.entry_date).startsWith("2026-08"))).toHaveLength(2);
    phone.close();
  });
});

describe("multi-page chunks are replaced safely", () => {
  const big = (i: number) => ({ id: `j${i}`, entry_date: "2026-10-01", body: `${i}:`.padEnd(9000, "x") });

  it("a write that stops part-way leaves the previous version whole", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("journal", Array.from({ length: 30 }, (_, i) => big(i)));
    const set = store.set.bind(store);
    let n = 0;
    store.set = async (path, data) => {
      if (++n >= 2) throw new StorageError("unavailable", "closed mid-write");
      return set(path, data);
    };
    await e.insert("journal", { entry_date: "2026-10-05", body: "new" }).catch(() => undefined);
    e.close();
    store.set = set;
    expect(await storedRows(store, "journal")).toHaveLength(30);
  });

  it("ignores a page 0 whose other pages aren't all there yet", async () => {
    const store = new TapStore();
    const e = await open(store);
    await e.insert("journal", { id: "keep", entry_date: "2026-10-01", body: "kept" });
    const partial: StoredDoc = {
      id: "t~journal~2026-10~0",
      data: { table: "journal", bucket: "2026-10", page: 0, pages: 2, ver: "half0001", after: [], rows: [{ id: "x", entry_date: "2026-10-01", body: "x" }] },
    };
    for (const tap of store.taps) tap([...(await store.list(BASE)).filter((d) => d.id !== partial.id), partial]);
    expect(e.getState().tables.journal.map((r) => r.id)).toEqual(["keep"]);
    e.close();
  });

  it("removes the previous version's pages only after the new page 0 is stored", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("journal", Array.from({ length: 40 }, (_, i) => big(i)));
    const before = chunkIds(store, "t~journal~2026-10");
    const order: string[] = [];
    const set = store.set.bind(store);
    const remove = store.remove.bind(store);
    store.set = async (path, data) => { order.push(`set ${path.slice(BASE.length + 1)}`); return set(path, data); };
    store.remove = async (path) => { order.push(`remove ${path.slice(BASE.length + 1)}`); return remove(path); };
    await e.update("journal", "j0", { body: "short now" });
    const head = order.indexOf("set t~journal~2026-10~0");
    expect(head).toBeGreaterThan(0);
    for (const id of before.filter((x) => !x.endsWith("~0"))) expect(order.indexOf(`remove ${id}`)).toBeGreaterThan(head);
    e.close();
    expect(await storedRows(store, "journal")).toHaveLength(40);
  });

  it("measures pages in bytes, not characters", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("journal", Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, entry_date: "2026-10-01", body: "€".repeat(4000) })));
    const enc = new TextEncoder();
    for (const id of chunkIds(store, "t~journal~2026-10")) {
      expect(enc.encode(JSON.stringify(store.docs.get(`${BASE}/${id}`))).length).toBeLessThan(160_000);
    }
    e.close();
    expect(await storedRows(store, "journal")).toHaveLength(40);
  });
});

describe("a reset or import on another device", () => {
  it("clears the records on devices that are already open, and they stay cleared", async () => {
    const store = new MemoryStore();
    const a = await open(store);
    const b = await open(store);
    await a.insert("weights", [{ entry_date: "2026-10-01", weight: 200 }, { entry_date: "2026-10-02", weight: 199 }]);
    await a.saveSingle("goals", { start_weight: 260, target_loss: 40 });
    await quiet(a, b);
    expect(b.getState().tables.weights).toHaveLength(2);
    await a.reset();
    await quiet(a, b);
    expect(b.getState().tables.weights).toEqual([]);
    expect(b.getState().singles.goals).toBeNull();
    expect(b.getState().profile.onboarding_done).toBe(false);
    await b.insert("weights", { entry_date: "2026-10-03", weight: 198 });
    await quiet(a, b);
    expect((await storedRows(store, "weights")).map((r) => r.entry_date)).toEqual(["2026-10-03"]);
    expect(dates(a)).toEqual(["2026-10-03"]);
    a.close();
    b.close();
  });

  it("an import elsewhere replaces what an open device shows", async () => {
    const store = new MemoryStore();
    const a = await open(store);
    const b = await open(store);
    await a.insert("weights", { entry_date: "2026-10-01", weight: 200 });
    const file = await a.exportAll();
    await b.insert("weights", { entry_date: "2026-09-09", weight: 190 }); // a month the backup doesn't have
    await quiet(a, b);
    await a.importAll(file);
    await quiet(a, b);
    expect(dates(b)).toEqual(["2026-10-01"]);
    a.close();
    b.close();
  });
});

describe("bulk loads check rows against each other", () => {
  it("refuses duplicates, missing parents, overpayments and repeated ids, changing nothing", async () => {
    const e = await open(new MemoryStore());
    await e.insert("weights", { entry_date: "2026-10-01", weight: 200 });
    const before = e.getState();
    const bad = [
      { weights: [{ entry_date: "2026-10-01", weight: 199 }] },
      { weights: [{ entry_date: "2026-10-05", weight: 199 }, { entry_date: "2026-10-05", weight: 198 }] },
      { completions: [{ habit_id: "nope", completed_on: "2026-10-01" }] },
      {
        businesses: [{ id: "b", name: "B" }],
        transactions: [{ id: "t", business_id: "b", kind: "sale", txn_date: "2026-10-01", amount: 10 }],
        payments: [{ transaction_id: "t", paid_on: "2026-10-01", amount: 500 }],
      },
      { checkins: [{ id: "same", checkin_date: "2026-10-01" }, { id: "same", checkin_date: "2026-10-02" }] },
    ];
    for (const tables of bad) {
      await expect(e.bulk({ tables: tables as unknown as Partial<Record<ListKey, Record<string, unknown>[]>> })).rejects.toBeInstanceOf(ValidationError);
      expect(e.getState()).toBe(before);
    }
    // Parents staged in the same plan count.
    await e.bulk({ tables: { habits: [{ id: "h", name: "Walk", start_date: "2026-10-01" }], completions: [{ habit_id: "h", completed_on: "2026-10-02" }] } });
    expect(e.getState().tables.completions).toHaveLength(1);
    e.close();
  });

  it("refuses a backup with rows that clash, before touching anything", async () => {
    const store = new MemoryStore();
    const e = await open(store);
    await e.insert("weights", { entry_date: "2026-09-01", weight: 210 });
    const file = await e.exportAll();
    const bad = { ...file, tables: { ...file.tables, weights: [{ entry_date: "2026-10-01", weight: 200 }, { entry_date: "2026-10-01", weight: 199 }] } } as unknown as ExportFile;
    await expect(e.importAll(bad)).rejects.toThrow("nothing was changed");
    expect(dates(e)).toEqual(["2026-09-01"]);
    const badProfile = { ...file, profile: { ...file.profile, plan_preset: "everything" } } as unknown as ExportFile;
    await expect(e.importAll(badProfile)).rejects.toThrow("nothing was changed");
    expect(dates(e)).toEqual(["2026-09-01"]);
    e.close();
  });

  it("loads the sample data under every rule", async () => {
    const singlesFor: Record<string, SingleKey> = { body_goals: "goals", athletic_profiles: "athletic", business_settings: "businessSettings" };
    const lists: Record<string, ListKey> = {
      weight_entries: "weights", daily_checkins: "checkins", symptom_logs: "symptoms", nutrition_logs: "nutrition",
      strength_sets: "sets", habit_completions: "completions", rest_days: "restDays", journal_entries: "journal",
      activity_metrics: "metrics", activity_logs: "activityLogs",
    };
    const tables: Partial<Record<ListKey, Record<string, unknown>[]>> = {};
    const singles: Partial<Record<SingleKey, Record<string, unknown>>> = {};
    for (const { table, rows } of buildDemo(UID)) {
      if (singlesFor[table]) singles[singlesFor[table]] = rows[0];
      else {
        const k = lists[table] ?? (table as ListKey);
        tables[k] = [...(tables[k] ?? []), ...rows];
      }
    }
    const e = await open(new MemoryStore());
    await e.bulk({ tables, singles });
    expect(e.getState().tables.weights.length).toBeGreaterThan(20);
    expect(e.getState().tables.payments.length).toBeGreaterThan(0);
    e.close();
  });
});

describe("saves that can't succeed by retrying", () => {
  class RefusingStore extends MemoryStore {
    refuse = 0;
    code = "invalid_argument";
    async set(path: string, data: Record<string, unknown>) {
      if (this.refuse > 0) {
        this.refuse--;
        throw new StorageError(this.code, "Storage refused this change.");
      }
      return super.set(path, data);
    }
  }

  it("are not retried in a loop, and say so; the next edit tries again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new RefusingStore();
    const e = await open(store);
    store.refuse = 1;
    await expect(e.insert("weights", { entry_date: "2026-10-01", weight: 200 })).rejects.toBeInstanceOf(StorageError);
    expect(e.getStatus()).toMatchObject({ error: "Storage refused this change.", retrying: false });
    const writes = store.writes;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.writes).toBe(writes);
    await e.insert("weights", { entry_date: "2026-10-02", weight: 199 });
    expect(e.getStatus()).toMatchObject({ error: null, retrying: false });
    expect(await storedRows(store, "weights")).toHaveLength(2);
    e.close();
  });

  it("back off per chunk: another chunk saving doesn't reset a failing chunk's delay", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new MemoryStore();
    const e = await open(store);
    store.failNext = 2;
    await e.insert("weights", { entry_date: "2026-10-01", weight: 200 }).catch(() => undefined);
    expect(e.getStatus().retrying).toBe(true);
    await vi.advanceTimersByTimeAsync(3000); // first retry fails; next in 6 s
    await e.insert("weights", { entry_date: "2026-09-01", weight: 201 }); // another chunk saves fine
    await vi.advanceTimersByTimeAsync(3000);
    expect(chunkIds(store, "t~weights~2026-10")).toEqual([]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(chunkIds(store, "t~weights~2026-10")).toEqual(["t~weights~2026-10~0"]);
    expect(e.getStatus()).toMatchObject({ error: null, retrying: false });
    e.close();
  });
});

describe("live updates that stop", () => {
  class FlakyWatchStore extends MemoryStore {
    errors: ((e: StorageError) => void)[] = [];
    watches = 0;
    watch(collection: string, onChange: (docs: StoredDoc[]) => void, onError?: (e: StorageError) => void) {
      this.watches++;
      if (onError) this.errors.push(onError);
      return super.watch(collection, onChange);
    }
  }

  it("reconnect after a dropped connection and report the pause meanwhile", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new FlakyWatchStore();
    const phone = await open(store);
    const laptop = await open(store);
    const phoneWatch = store.errors[0];
    expect(store.watches).toBe(2);
    phoneWatch(new StorageError("unavailable", "bridge gone"));
    expect(phone.getStatus().sync).toMatch(/paused/);
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.watches).toBe(3);
    await laptop.insert("weights", { entry_date: "2026-10-01", weight: 200 });
    await flush();
    expect(phone.getState().tables.weights).toHaveLength(1);
    expect(phone.getStatus().sync).toBeNull();
    phone.close();
    laptop.close();
  });

  it("say when they've stopped for good", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const store = new FlakyWatchStore();
    const e = await open(store);
    store.errors[0](new StorageError("revoked", "gone"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.watches).toBe(1);
    expect(e.getStatus().sync).toMatch(/Reload/);
    e.close();
  });

  it("the page database doesn't swallow errors when no handler is given", () => {
    let handler: unknown = "unset";
    const db = { collection: () => ({ onSnapshot: (_n: unknown, err?: unknown) => { handler = err; return () => undefined; } }) } as unknown as ClaudeDb;
    new SharedPageStore(db).watch("shared", () => undefined);
    expect(handler).toBeUndefined();
  });
});

describe("partner summary publishing", () => {
  it("never overlaps writes, ends on the newest content, and skips unchanged content", async () => {
    const calls: { data: Record<string, unknown>; done: () => void }[] = [];
    let active = 0;
    let overlap = false;
    const publish = serialPublisher((data) => new Promise<void>((resolve) => {
      active++;
      if (active > 1) overlap = true;
      calls.push({ data, done: () => { active--; resolve(); } });
    }), () => undefined);
    void publish("a", { v: "a" });
    void publish("b", { v: "b" });
    const last = publish("c", { v: "c" });
    expect(calls).toHaveLength(1);
    calls[0].done();
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1].data).toEqual({ v: "c" }); // "b" was superseded before it was sent
    calls[1].done();
    await last;
    expect(overlap).toBe(false);
    await publish("c", { v: "c" });
    expect(calls).toHaveLength(2);
  });

  it("tries again on the next change after a failed write", async () => {
    let fail = true;
    const sent: string[] = [];
    const errors: unknown[] = [];
    const publish = serialPublisher(async (d) => {
      if (fail) throw new Error("offline");
      sent.push(d.v as string);
    }, (e) => errors.push(e));
    await publish("a", { v: "a" });
    expect(errors).toHaveLength(1);
    fail = false;
    await publish("a", { v: "a" });
    expect(sent).toEqual(["a"]);
  });
});

describe("value rules from the old database", () => {
  it("refuses values the old tables refused", async () => {
    const e = await open(new MemoryStore());
    const [w] = await e.insert("workouts", { workout_date: "2026-10-01", activity: "run" });
    const bad: [ListKey, Record<string, unknown>][] = [
      ["symptoms", { log_date: "2026-10-01", pain_level: 3, during: "sleeping" }],
      ["symptoms", { log_date: "2026-10-01", pain_level: 3, body_area: "" }],
      ["workouts", { workout_date: "2026-10-01", activity: "run", intensity: "brutal" }],
      ["workouts", { workout_date: "2026-10-01", activity: "run", title: "x".repeat(121) }],
      ["sets", { workout_id: w.id, exercise: "Squat", set_no: 51 }],
      ["habits", { name: "Walk", start_date: "2026-10-01", category: "chores" }],
      ["photos", { taken_on: "2026-10-01", storage_path: "p", pose: "upside-down" }],
      ["journal", { entry_date: "2026-10-01", body: "x", minutes: 2000 }],
      ["roadmapNotes", { chapter_key: "c1", status_override: "abandoned" }],
      ["achievements", { key: "k", category: "secret", title: "t", achieved_on: "2026-10-01" }],
      ["notifications", { kind: "x", title: "t", dedupe_key: "k".repeat(121) }],
      ["businesses", { name: "B", kind: "empire" }],
    ];
    for (const [t, row] of bad) await expect(e.insert(t, row), `${t} ${JSON.stringify(row).slice(0, 60)}`).rejects.toBeInstanceOf(ValidationError);
    const [b] = await e.insert("businesses", { name: "B" });
    const [m] = await e.insert("metrics", { business_id: b.id, label: "DMs" });
    await expect(e.insert("activityLogs", { metric_id: m.id, log_date: "2026-10-01" })).rejects.toThrow("Missing count");
    await expect(e.insert("deals", { business_id: b.id, name: "D", created_on: "2026-10-01", value: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.insert("transactions", { business_id: b.id, kind: "expense", txn_date: "2026-10-01", amount: 5, expense_category: "snacks" }))
      .rejects.toBeInstanceOf(ValidationError);
    e.close();
  });

  it("keeps photo storage paths unique", async () => {
    const e = await open(new MemoryStore());
    await e.insert("photos", { taken_on: "2026-10-01", storage_path: "same" });
    await expect(e.insert("photos", { taken_on: "2026-10-02", storage_path: "same" })).rejects.toBeInstanceOf(ValidationError);
    e.close();
  });

  it("checks every setting and the profile", async () => {
    const e = await open(new MemoryStore());
    await expect(e.saveSingle("shareSettings", { weight: "everything" })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("shareSettings", { health: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("reminderSettings", { daily_logging_hour: 24 })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("goals", { pace: "sprint" })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("goals", { weekly_training_minutes: 5000 })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("athletic", { goal_text: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("athletic", { readiness: "fine" })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("businessSettings", { goal_amount: null })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("businessSettings", { baseline_revenue: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveSingle("businessSettings", { goal_deadline: "soon" })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveProfile({ plan_preset: "everything" as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(e.saveProfile({ demo_today: "2026-13-01" })).rejects.toBeInstanceOf(ValidationError);
    expect(e.getState().singles.shareSettings).toMatchObject(SINGLE_DEFAULTS.shareSettings);
    e.close();
  });

  it("rounds whole-number fields, as the old database did", async () => {
    const e = await open(new MemoryStore());
    const [w] = await e.insert("workouts", { workout_date: "2026-10-01", activity: "run", rpe: 6.6, duration_min: 30.5 });
    expect(w).toMatchObject({ rpe: 7, duration_min: 30.5 });
    const after = await e.update("workouts", w.id, { avg_hr: 140.4 });
    expect(after.avg_hr).toBe(140);
    expect((await e.saveSingle("reminderSettings", { daily_logging_hour: 7.2 })).daily_logging_hour).toBe(7);
    e.close();
  });
});

describe("notification cap", () => {
  it("drops dated reminders before one-off ones, so one-off reminders don't come back", async () => {
    const e = await open(new MemoryStore());
    const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
    await e.insert("notifications", [
      { kind: "roadmap", title: "Chapter", dedupe_key: "chapter:c1", created_at: at(0) },
      { kind: "milestones", title: "Near", dedupe_key: "near:w10", created_at: at(1) },
    ]);
    await e.insert("notifications", Array.from({ length: 300 }, (_, i) => ({ kind: "daily_logging", title: `d${i}`, dedupe_key: `daily:${i}`, created_at: at(10 + i) })));
    const keys = e.getState().tables.notifications.map((n) => n.dedupe_key);
    expect(keys).toHaveLength(300);
    expect(keys).toContain("chapter:c1");
    expect(keys).toContain("near:w10");
    expect(keys).not.toContain("daily:0");
    expect(keys).not.toContain("daily:1");
    e.close();
  });
});

describe("browser storage", () => {
  /** Just enough of IndexedDB for DeviceStore: one store, requests that complete on the next tick. */
  function fakeIdb(data: Map<string, { path: string; collection: string; data: Record<string, unknown> }>, broken: { now: boolean }) {
    return {
      transaction() {
        if (broken.now) throw Object.assign(new Error("The database connection is closing."), { name: "InvalidStateError" });
        const t: Record<string, unknown> & { oncomplete?: () => void } = {};
        const req = (result: unknown) => {
          setTimeout(() => t.oncomplete?.());
          return { result };
        };
        t.objectStore = () => ({
          put: (v: { path: string; collection: string; data: Record<string, unknown> }) => req(void data.set(v.path, v)),
          get: (path: string) => req(data.get(path)),
          delete: (path: string) => req(void data.delete(path)),
          index: () => ({ getAll: (c: string) => req([...data.values()].filter((v) => v.collection === c)) }),
        });
        return t;
      },
    } as unknown as IDBDatabase;
  }

  it("reopens the database once when the browser drops the connection", async () => {
    const data = new Map();
    const first = { now: false };
    let opens = 0;
    const store = await DeviceStore.open(async () => (opens++ === 0 ? fakeIdb(data, first) : fakeIdb(data, { now: false })));
    await store.set("data/users/local/a", { x: 1 });
    first.now = true; // e.g. iOS Safari closed it in the background
    await store.set("data/users/local/b", { x: 2 });
    expect(opens).toBe(2);
    expect((await store.list("data/users/local")).map((d) => d.id)).toEqual(["a", "b"]);
    store.close();
  });

  it("lists past 500 documents, including ones written without the paging field", async () => {
    const docs = Array.from({ length: 600 }, (_, i) => ({ id: `d${String(i).padStart(3, "0")}`, data: { _k: `d${String(i).padStart(3, "0")}` } as Record<string, unknown> }));
    docs.push({ id: "manual", data: { note: "added by hand" } });
    const query = (after: string | null, n: number) => ({
      orderBy: () => query(after, n),
      limit: (m: number) => query(after, m),
      where: (_f: string, _op: string, v: string) => query(v, n),
      get: async () => {
        const hasK = docs.filter((d) => typeof d.data._k === "string" && (after === null || (d.data._k as string) > after))
          .sort((a, b) => ((a.data._k as string) < (b.data._k as string) ? -1 : 1));
        const all = after === null ? [...hasK, ...docs.filter((d) => d.data._k === undefined)] : hasK;
        return { docs: all.slice(0, n).map((d) => ({ id: d.id, exists: true, data: () => d.data })) };
      },
    });
    const db = { collection: () => query(null, 1000) } as unknown as ClaudeDb;
    const listed = await new SharedPageStore(db).list("data/users/u1");
    expect(listed).toHaveLength(601);
    expect(listed.map((d) => d.id)).toContain("manual");
  });
});

describe("opening on the shared page", () => {
  const w = globalThis as unknown as { window?: unknown };
  afterEach(() => {
    delete w.window;
  });
  function page(setError: { code: string } | null) {
    const db = {
      doc: () => ({ set: async () => { if (setError) throw setError; } }),
      collection: () => ({}),
    };
    const user = { id: async () => "u1", me: async () => ({ id: "u1", name: "Dean" }), profiles: async () => ({}) };
    const claude = { use: async (name: string) => (name === "db" ? db : name === "user" ? user : null) };
    const self = {};
    w.window = { claude, self, top: self };
  }

  it("uses the page's storage when it can write there", async () => {
    page(null);
    expect((await detectHost()).mode).toBe("shared-page");
  });

  it("falls back to this browser only when the page refuses writes", async () => {
    page({ code: "invalid_argument" });
    const host = await detectHost();
    expect(host.mode).toBe("device");
    expect(host.notice).toMatch(/view-only/);
  });

  it("shows an error to retry, rather than switching storage, when the page is briefly unreachable", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    page({ code: "unavailable" });
    const p = detectHost();
    const check = expect(p).rejects.toThrow("Couldn't reach this page's storage");
    await vi.advanceTimersByTimeAsync(2000); // the store's one quick retry
    await check;
  });
});

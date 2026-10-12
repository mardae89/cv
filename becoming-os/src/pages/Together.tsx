import { HardDrive, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "@/components/AppLink";
import { PartnerFitnessCard } from "@/components/cards";
import { Chart, ChartCard, GOLD, NEUTRAL } from "@/components/charts";
import { useSubmit } from "@/components/forms/body";
import { Button, Card, Eyebrow, Meter, Notice, PageHeader, Pill, Segmented, Stat } from "@/components/ui";
import { DEFAULT_SHARE, type SharedSummary } from "@/data/partner";
import { useStore } from "@/data/store";
import { ACTIVITY_LABEL, isSession, PHASES } from "@/lib/calc/athletic";
import { METRIC_LABEL } from "@/lib/calc/business";
import { indexHabits, periodScore } from "@/lib/calc/habits";
import { fmtDate, fmtShort, weekStart } from "@/lib/dates";
import { money, num, pct, plural } from "@/lib/format";
import type { ShareSettings } from "@/lib/types";

export default function Together() {
  const { host, partners } = useStore();
  const shared = host.mode === "shared-page";
  const first = partners[0]?.display_name || "your partner";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Together"
        title={partners.length === 1 ? `You & ${partners[0].display_name || "your partner"}` : "Shared accountability"}
        sub={partners.length
          ? "Individual progress side by side. No rankings — every pound, workout and milestone is its own win."
          : "See each other's progress — only what each of you chooses to share."} />

      {!shared ? <DeviceOnly /> : !partners.length ? <HowToConnect /> : null}

      {partners.map((p) => <PartnerView key={p.partner_id} p={p} />)}

      {shared && partners.length > 0 && (
        <p className="text-[12.5px] text-faint">
          Who can open this page is managed in its Share menu, so there's nothing to connect or disconnect here.
          To stop {partners.length === 1 ? first : "them"} seeing something, set it to hidden below.
        </p>
      )}

      <SharingSettings />
    </div>
  );
}

function HowToConnect() {
  return (
    <Card>
      <Users className="mb-3 h-6 w-6 text-gold" />
      <h2 className="text-[26px] leading-none">Invite your partner</h2>
      <div className="mt-3 space-y-2 text-[13.5px] text-mute">
        <p>Open this page's Share menu and invite your partner by email as an Editor. Don't send a public link — it only gives view access, so nothing they log would be saved here.</p>
        <p>Once they open the page and finish setup, their shared summary appears here automatically.</p>
      </div>
      <p className="mt-4 text-[12px] text-faint">Each of you keeps your own private records on the page — not even the page owner can open the other's. Only the summary you choose below is shared.</p>
    </Card>
  );
}

function DeviceOnly() {
  const { host } = useStore();
  return (
    <div className="space-y-3">
      <Card>
        <HardDrive className="mb-3 h-6 w-6 text-gold" />
        <h2 className="text-[26px] leading-none">Sharing needs the published page</h2>
        <div className="mt-3 space-y-2 text-[13.5px] text-mute">
          <p>Your records here aren't synced anywhere, so there's nothing for your partner to see from here.</p>
          <p>Sharing works on the published BECOMING OS page: its owner invites the other person by email as an Editor from the page's Share menu, and each of you sees the other's shared summary on this screen.</p>
          <p>To bring what you've logged here onto the page, save a backup in <Link to="/settings#data" className="link">Settings → Your data</Link> and restore it there.</p>
        </div>
      </Card>
      {host.notice && <Notice tone="gold">{host.notice}</Notice>}
    </div>
  );
}

function NotShared({ what }: { what?: string }) {
  return <p className="text-[13px] text-faint">{what ? `${what} · ` : ""}Not shared</p>;
}

/** "3 min ago" for recent updates, otherwise a short date and time. */
function fmtUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function PartnerView({ p }: { p: SharedSummary }) {
  const { data, today, ev } = useStore();
  const name = p.display_name || "Your partner";
  const ws = weekStart(today);
  const idx = indexHabits(data.completions, data.restDays);
  const myWeek = periodScore(data.habits, idx, ws, today);
  const target = data.athletic?.weekly_session_target ?? 3;
  const mySessions = data.workouts.filter((w) => isSession(w) && w.workout_date >= ws && w.workout_date <= today).length;
  const mine = ev.unlocked.filter((m) => m.achievedOn! >= ws);
  const theirs = [...p.achievements].sort((a, b) => (a.achieved_on < b.achieved_on ? 1 : -1));
  const theirWeek = theirs.filter((a) => a.achieved_on >= ws);
  // Their weekly figures are from the last time their summary was rebuilt.
  const staleWeek = p.today < ws ? weekStart(p.today) : null;
  const t = p.training;
  const b = p.business;

  return (
    <section className="space-y-4" aria-label={`${name}'s shared progress`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[28px] leading-none">{name}</h2>
        <span className="flex items-center gap-2 text-[12px] text-faint">
          {p.demo_mode && <Pill>Sample data</Pill>}
          Updated {fmtUpdated(p.updated_at)}
        </span>
      </div>

      <Card>
        <Eyebrow className="mb-3 text-gold">Shared consistency · this week</Eyebrow>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[13px] text-bone">Habits</div>
            <Meter value={myWeek.pct ?? 0} label="You" right={myWeek.pct === null ? "—" : pct(myWeek.pct)} />
            {p.habits ? <Meter className="mt-3" value={p.habits.week_pct ?? 0} label={name} right={p.habits.week_pct === null ? "—" : pct(p.habits.week_pct)} />
              : <div className="mt-3"><NotShared what={name} /></div>}
          </div>
          <div>
            <div className="mb-2 text-[13px] text-bone">Training sessions</div>
            <Meter value={mySessions} max={target} label="You" right={`${mySessions}/${target}`} />
            {t ? <Meter className="mt-3" value={t.sessions_week} max={t.session_target} label={name} right={`${t.sessions_week}/${t.session_target}`} />
              : <div className="mt-3"><NotShared what={name} /></div>}
          </div>
        </div>
        {staleWeek && (p.habits || t) && (
          <p className="mt-3 text-[12px] text-faint">{name}'s figures are from the week of {fmtShort(staleWeek)}, when their summary last updated.</p>
        )}
        {(mine.length > 0 || theirWeek.length > 0) && (
          <div className="mt-5 border-t border-hair pt-4">
            <div className="eyebrow mb-2">Milestones this week</div>
            <div className="flex flex-wrap gap-2">
              {mine.map((m) => <Pill key={m.key} tone="gold">You · {m.title}</Pill>)}
              {theirWeek.map((a) => <Pill key={a.id} tone="gold">{name} · {a.title}</Pill>)}
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {p.weight ? <PartnerFitnessCard o={p} /> : (
          <Card>
            <Eyebrow className="mb-1">{name}</Eyebrow>
            <h3 className="mb-4 text-[24px] leading-none">Weight progress</h3>
            <NotShared what="Weight" />
          </Card>
        )}
        <Card>
          <Eyebrow className="mb-1">{name}</Eyebrow>
          <h3 className="mb-4 text-[24px] leading-none">Training & business</h3>
          {t ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Phase" value={<span className="text-[15px]">{PHASES.find((x) => x.key === t.phase)?.name ?? t.phase}</span>} />
                <Stat label="Run miles" value={num(t.run_miles_week).toFixed(1)} sub="this week" />
                <Stat label="Longest run" value={`${t.longest_run} mi`} />
              </div>
              <p className="mt-3 text-[12.5px] text-mute">
                {t.goal_text}{t.race_name ? ` · ${t.race_name}` : ""}{t.race_date ? ` on ${fmtDate(t.race_date)}` : ""} · {plural(t.total_workouts, "session")} logged
              </p>
            </>
          ) : <NotShared what="Training" />}
          <div className="mt-5 border-t border-hair pt-4">
            {b ? (
              <Meter value={b.value} max={b.goal} label={`${METRIC_LABEL[b.metric]} this month`} right={`${money(b.value)} / ${money(b.goal)}`} />
            ) : p.levels.business === "none" ? <NotShared what="Business" /> : <p className="text-[13px] text-faint">Business · Not tracked</p>}
          </div>
        </Card>
      </div>

      {p.weights.length > 1 && (
        <ChartCard title={`${name}'s 7-day average`} sub="Shared at full detail">
          <Chart data={p.weights} x="date" height={220} fmt={(v) => `${Math.round(v)}`} series={[{ key: "weight", label: "Weigh-in", color: NEUTRAL, type: "dots" }, { key: "trend", label: "7-day average", color: GOLD }]} />
        </ChartCard>
      )}

      {p.workouts.length > 0 && (
        <Card>
          <h3 className="mb-3 text-[22px] leading-none">{name}'s recent workouts</h3>
          <ul className="divide-y divide-hair">
            {p.workouts.slice(0, 8).map((w) => (
              <li key={w.id} className="flex items-baseline justify-between gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 truncate text-bone">{w.title || ACTIVITY_LABEL[w.activity]}</span>
                <span className="num shrink-0 text-[12px] text-faint">
                  {[w.distance_mi ? `${num(w.distance_mi).toFixed(1)} mi` : null, w.duration_min ? `${w.duration_min} min` : null, fmtShort(w.workout_date)].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-[22px] leading-none">{name}'s milestones</h3>
          {theirs.length ? (
            <ul className="space-y-2">
              {theirs.slice(0, 12).map((a) => (
                <li key={a.id} className="flex justify-between gap-3 text-[13.5px]"><span className="text-bone">{a.title}</span><span className="num shrink-0 text-[12px] text-faint">{fmtShort(a.achieved_on)}</span></li>
              ))}
            </ul>
          ) : p.levels.milestones === "none" ? <NotShared /> : <p className="text-[13px] text-faint">None yet.</p>}
        </Card>
        <Card>
          <h3 className="mb-3 text-[22px] leading-none">Shared reflections</h3>
          {p.reviews.length || p.journal.length ? (
            <ul className="space-y-3">
              {p.reviews.slice(0, 4).map((r) => (
                <li key={r.id} className="rounded-xl border border-hair p-3 text-[13px]">
                  <div className="eyebrow mb-1">{r.period === "week" ? `Week of ${fmtShort(r.period_start)}` : r.period_start.slice(0, 7)}</div>
                  {([["Proud", r.proud], ["Went well", r.went_well], ["Difficult", r.difficult], ["Learned", r.learned], ["Changing next", r.change_next]] as const)
                    .filter(([, v]) => v).map(([k, v], i) => (
                      <p key={k} className={i ? "mt-1 whitespace-pre-line text-mute" : "whitespace-pre-line text-bone"}>{k}: {v}</p>
                    ))}
                </li>
              ))}
              {p.journal.slice(0, 4).map((j) => (
                <li key={j.id} className="rounded-xl border border-hair p-3 text-[13px]">
                  <div className="eyebrow mb-1">{fmtShort(j.entry_date)} · {j.kind}</div>
                  <p className="whitespace-pre-line text-bone">{j.title ? `${j.title} — ` : ""}{j.body}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-faint">Nothing shared. Reflections and journal entries stay private unless marked shared.</p>}
        </Card>
      </div>
    </section>
  );
}

const SHARE_KEYS = ["weight", "training", "habits", "milestones", "business"] as const;

/** Only the levels the shared summary actually honours. Health details and
 *  photos never leave your private space, so they get no control here. */
export function ShareEditor({ value, onChange, business }: { value: ShareSettings; onChange: (v: ShareSettings) => void; business: boolean }) {
  const set = <K extends keyof ShareSettings>(k: K, v: ShareSettings[K]) => onChange({ ...value, [k]: v });
  // Older settings may say "full" where the summary only has one level.
  const on = (v: string) => (v === "none" ? "none" : "summary");
  const row = (label: string, sub: string, control: ReactNode) => (
    <div className="flex flex-col gap-2 border-b border-hair py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="text-[14px] text-bone">{label}</div><div className="text-[12px] text-mute">{sub}</div></div>
      <div role="group" aria-label={label} className="flex flex-col">{control}</div>
    </div>
  );
  return (
    <Card className="py-1">
      {row("Weight progress", "% of goal hides pounds and weights. Weight milestones need pounds or more. Full adds your weigh-in chart.",
        <Segmented size="sm" value={value.weight} onChange={(v) => set("weight", v)} options={[
          { value: "none", label: "Hidden" }, { value: "percent", label: "% of goal" }, { value: "pounds", label: "Pounds lost" }, { value: "full", label: "Full detail" }]} />)}
      {row("Training", "Summary: sessions, distance, longest run. Full: also your recent workouts.",
        <Segmented size="sm" value={value.training} onChange={(v) => set("training", v)} options={[
          { value: "none", label: "Hidden" }, { value: "summary", label: "Summary" }, { value: "full", label: "Full" }]} />)}
      {row("Habits", "Completion percentages for today and this week. Individual habits aren't shared.",
        <Segmented size="sm" value={on(value.habits)} onChange={(v) => set("habits", v)} options={[
          { value: "none", label: "Hidden" }, { value: "summary", label: "Shared" }]} />)}
      {row("Milestones", "Your achievement timeline (category limits above still apply).",
        <Segmented size="sm" value={value.milestones} onChange={(v) => set("milestones", v)} options={[
          { value: "none", label: "Hidden" }, { value: "full", label: "Shared" }]} />)}
      {business && row("Business", "Progress toward the monthly goal only. Transactions and customers aren't shared.",
        <Segmented size="sm" value={on(value.business)} onChange={(v) => set("business", v)} options={[
          { value: "none", label: "Private" }, { value: "summary", label: "Goal only" }]} />)}
      <p className="pb-4 pt-1 text-[12px] text-faint">
        Health details and progress photos are never shared. Journal entries and reflections stay private unless you mark an individual entry as shared.
      </p>
    </Card>
  );
}

/** The sharing levels and their Save button. Until you change something the form follows what's stored. */
export function SharingForm() {
  const { host, shareSettings, data, saveSingle } = useStore();
  const { busy, run } = useSubmit();
  const saved = shareSettings ?? DEFAULT_SHARE;
  // Edits stay local until saved; with no edits the form follows the stored settings.
  const [draft, setDraft] = useState<ShareSettings | null>(null);
  const value = draft ?? saved;
  const dirty = !!draft && SHARE_KEYS.some((k) => draft[k] !== saved[k]);
  const shared = host.mode === "shared-page";
  return (
    <div className="space-y-3">
      <ShareEditor value={value} onChange={setDraft} business={data.profile.business_enabled} />
      <Button busy={busy} disabled={!dirty} onClick={() => run(async () => {
        await saveSingle("shareSettings", { ...value });
        setDraft(null);
        return shared ? "Sharing saved. Your summary updates in a moment." : "Sharing saved.";
      })}>Save sharing</Button>
    </div>
  );
}

function SharingSettings() {
  const shared = useStore().host.mode === "shared-page";
  return (
    <section id="sharing" className="scroll-mt-24 space-y-3">
      <div>
        <h2 className="text-[28px] leading-none">What you share</h2>
        <p className="mt-1.5 text-[13px] text-mute">
          {shared
            ? "Your partner never sees your records — only a summary built from these settings, refreshed a moment after you change something."
            : "Saved with your records. They take effect once your records are on the published page; nothing is shared from this browser."}
        </p>
      </div>
      <SharingForm />
    </section>
  );
}

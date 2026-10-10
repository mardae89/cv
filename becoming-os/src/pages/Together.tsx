import { Copy, Link2, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PartnerFitnessCard } from "@/components/cards";
import { Chart, ChartCard, GOLD, NEUTRAL } from "@/components/charts";
import { useFeedback } from "@/components/feedback";
import { Button, Card, Eyebrow, Input, Meter, Notice, PageHeader, Pill, Spinner, Stat } from "@/components/ui";
import { usePartnerOverview, usePartnerRecords } from "@/data/partner";
import { useStore } from "@/data/store";
import { supabase } from "@/data/supabase";
import { isSession, PHASES } from "@/lib/calc/athletic";
import { METRIC_LABEL } from "@/lib/calc/business";
import { indexHabits, periodScore } from "@/lib/calc/habits";
import { trendSeries, weighIns } from "@/lib/calc/weight";
import { fmtDate, fmtShort, weekStart } from "@/lib/dates";
import { errorMessage, money, pct } from "@/lib/format";

export default function Together() {
  const { partnership, uid, data, today, ev, invalidate } = useStore();
  const { toast, confirm } = useFeedback();
  const overview = usePartnerOverview();
  const o = overview.data;
  const records = usePartnerRecords(o?.partner_id, o?.levels);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (fn: () => PromiseLike<{ error: unknown; data?: unknown }>, ok: string) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      toast(ok);
      await invalidate("partnerships");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!partnership || partnership.status !== "active") {
    const mine = partnership?.status === "pending" && partnership.user_a === uid ? partnership : null;
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Together" title="Shared accountability" sub="Connect two accounts to see each other's progress — only what each of you chooses to share, enforced by the database." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <Users className="mb-3 h-6 w-6 text-gold" />
            <h2 className="text-[26px] leading-none">Invite your partner</h2>
            <p className="mt-2 text-[13px] text-mute">Create a code and give it to them. They enter it in their own account. Codes expire after 14 days.</p>
            {mine ? (
              <div className="mt-5">
                <Eyebrow className="mb-2">Your invite code</Eyebrow>
                <div className="flex items-center gap-3">
                  <span data-testid="invite-code" className="num font-display text-[44px] tracking-[0.18em] text-gold">{mine.invite_code}</span>
                  <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard?.writeText(mine.invite_code).then(() => toast("Copied."), () => toast("Couldn't copy — select the code instead.", "error"))}>Copy</Button>
                </div>
                <p className="mt-2 text-[12px] text-faint">Created {fmtDate(mine.created_at.slice(0, 10))}. Generating a new code cancels this one.</p>
              </div>
            ) : null}
            <Button className="mt-5" busy={busy} onClick={() => call(() => supabase.rpc("create_invite"), "Invite code created.")}>{mine ? "New code" : "Create invite code"}</Button>
          </Card>
          <Card>
            <Link2 className="mb-3 h-6 w-6 text-gold" />
            <h2 className="text-[26px] leading-none">Have a code?</h2>
            <p className="mt-2 text-[13px] text-mute">Enter the code from your partner's account to connect.</p>
            <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) call(() => supabase.rpc("accept_invite", { code: code.trim() }), "Connected. Welcome to the team."); }}>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="8-character code" maxLength={8} aria-label="Invite code" className="num tracking-[0.2em]" />
              <Button type="submit" busy={busy}>Connect</Button>
            </form>
          </Card>
        </div>
        <Notice title="What's shared by default">
          Weight as a percentage of goal, training and habit summaries, and milestones. Health details, photos, journal entries and all business finances stay private.
          Change any of it in <Link to="/settings#privacy" className="link">Settings → Privacy</Link>.
        </Notice>
      </div>
    );
  }

  if (overview.isLoading) return <Spinner label="Loading shared progress" />;
  if (overview.error || !o) return <Notice tone="alert">Couldn't load your partner's progress: {errorMessage(overview.error)}</Notice>;

  const name = o.display_name || "Your partner";
  const idx = indexHabits(data.completions, data.restDays);
  const myWeek = periodScore(data.habits, idx, weekStart(today), today);
  const mySessions = data.workouts.filter((w) => isSession(w) && w.workout_date >= weekStart(today) && w.workout_date <= today).length;
  const sharedAch = (records.data?.achievements ?? []).filter((a) => a.achieved_on >= weekStart(today));
  const partnerTrend = trendSeries(weighIns(records.data?.weights ?? []));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Together" title={`You & ${name}`}
        sub="Individual progress side by side, and what you're building together. No rankings — every pound, workout and milestone is its own win." />

      <Card>
        <Eyebrow className="mb-3 text-gold">Shared consistency · this week</Eyebrow>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[13px] text-bone">Habits</div>
            <Meter value={myWeek.pct ?? 0} label="You" right={myWeek.pct === null ? "—" : pct(myWeek.pct)} />
            {o.habits ? <Meter className="mt-3" value={o.habits.week_pct ?? 0} label={name} right={o.habits.week_pct === null ? "—" : pct(o.habits.week_pct)} />
              : <p className="mt-3 text-[12px] text-faint">{name} keeps habits private.</p>}
          </div>
          <div>
            <div className="mb-2 text-[13px] text-bone">Training sessions</div>
            <Meter value={mySessions} max={data.athletic?.weekly_session_target ?? 3} label="You" right={`${mySessions}/${data.athletic?.weekly_session_target ?? 3}`} />
            {o.training ? <Meter className="mt-3" value={o.training.sessions_week} max={o.training.session_target} label={name} right={`${o.training.sessions_week}/${o.training.session_target}`} />
              : <p className="mt-3 text-[12px] text-faint">{name} keeps training private.</p>}
          </div>
        </div>
        {(sharedAch.length > 0 || ev.unlocked.some((m) => m.achievedOn! >= weekStart(today))) && (
          <div className="mt-5 border-t border-hair pt-4">
            <div className="eyebrow mb-2">Milestones this week</div>
            <div className="flex flex-wrap gap-2">
              {ev.unlocked.filter((m) => m.achievedOn! >= weekStart(today)).map((m) => <Pill key={m.key} tone="gold">You · {m.title}</Pill>)}
              {sharedAch.map((a) => <Pill key={a.id} tone="gold">{name} · {a.title}</Pill>)}
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <PartnerFitnessCard o={o} />
        <Card>
          <Eyebrow className="mb-1">{name}</Eyebrow>
          <h3 className="mb-4 text-[24px] leading-none">Training & business</h3>
          {o.training ? (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Phase" value={<span className="text-[15px]">{PHASES.find((p) => p.key === o.training!.phase)?.name}</span>} />
              <Stat label="Run miles" value={Number(o.training.run_miles_week).toFixed(1)} sub="this week" />
              <Stat label="Longest run" value={`${o.training.longest_run} mi`} />
            </div>
          ) : <p className="text-[13px] text-faint">Training is private.</p>}
          {o.business && (
            <div className="mt-5 border-t border-hair pt-4">
              <Meter value={o.business.value} max={o.business.goal} label={`${METRIC_LABEL[o.business.metric]} this month`} right={`${money(o.business.value)} / ${money(o.business.goal)}`} />
            </div>
          )}
        </Card>
      </div>

      {partnerTrend.length > 1 && (
        <ChartCard title={`${name}'s 7-day average`} sub="Shared at full detail">
          <Chart data={partnerTrend} x="date" height={220} fmt={(v) => `${Math.round(v)}`} series={[{ key: "weight", label: "Weigh-in", color: NEUTRAL, type: "dots" }, { key: "trend", label: "7-day average", color: GOLD }]} />
        </ChartCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-[22px] leading-none">{name}'s milestones</h3>
          {records.data?.achievements.length ? (
            <ul className="space-y-2">
              {[...records.data.achievements].reverse().slice(0, 12).map((a) => (
                <li key={a.id} className="flex justify-between gap-3 text-[13.5px]"><span className="text-bone">{a.title}</span><span className="num text-[12px] text-faint">{fmtShort(a.achieved_on)}</span></li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-faint">{o.levels.milestones === "none" ? `${name} keeps milestones private.` : "None shared yet."}</p>}
        </Card>
        <Card>
          <h3 className="mb-3 text-[22px] leading-none">Shared reflections</h3>
          {(records.data?.reviews.length || records.data?.journal.length) ? (
            <ul className="space-y-3">
              {records.data!.reviews.slice(-4).reverse().map((r) => (
                <li key={r.id} className="rounded-xl border border-hair p-3 text-[13px]">
                  <div className="eyebrow mb-1">{r.period === "week" ? `Week of ${fmtShort(r.period_start)}` : r.period_start.slice(0, 7)}</div>
                  {r.proud && <p className="text-bone">Proud: {r.proud}</p>}
                  {r.went_well && <p className="mt-1 text-mute">Went well: {r.went_well}</p>}
                </li>
              ))}
              {records.data!.journal.slice(-4).reverse().map((j) => (
                <li key={j.id} className="rounded-xl border border-hair p-3 text-[13px]">
                  <div className="eyebrow mb-1">{fmtShort(j.entry_date)} · {j.kind}</div>
                  <p className="whitespace-pre-line text-bone">{j.title ? `${j.title} — ` : ""}{j.body}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-faint">Nothing shared. Reflections and journal entries are private unless marked shared.</p>}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-mute">You control what {name} sees in <Link to="/settings#privacy" className="link">Settings → Privacy</Link>.</p>
          <Button variant="danger" size="sm" busy={busy} onClick={async () => {
            if (await confirm({ title: "Disconnect accounts?", body: "You'll both stop seeing each other's shared progress. Your own records are untouched.", confirmLabel: "Disconnect", destructive: true })) {
              call(() => supabase.rpc("end_partnership"), "Disconnected.");
            }
          }}>Disconnect</Button>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { QuoteCard, TextInput, TiltMeter } from "@/components/os";
import { dayKey, uid, useCheckIns, usePlan, useReset, useTrades, useVision, type UrgeKind } from "@/lib/os/store";
import { tilt as tiltOf } from "@/lib/os/analytics";
import { QUOTES, URGE_SCRIPTS, randomQuote, type Quote } from "@/lib/os/content";

const URGES: { key: UrgeKind; label: string }[] = [
  { key: "fomo", label: "FOMO" },
  { key: "revenge", label: "Revenge" },
  { key: "overtrading", label: "Overtrading" },
  { key: "fear", label: "Fear" },
  { key: "boredom", label: "Boredom" },
];

export default function ResetPage() {
  const [plan] = usePlan();
  const [trades] = useTrades();
  const [checkIns] = useCheckIns();
  const [reset, saveReset, ready] = useReset();
  const [vision] = useVision();
  const [urge, setUrge] = useState<UrgeKind | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!ready || now == null) return <Skeleton className="mx-auto h-96 max-w-5xl" />;

  const tilt = tiltOf(trades, plan, checkIns[dayKey(now)] ?? null, now);
  const remaining = reset.cooldownUntil && reset.cooldownUntil > now ? reset.cooldownUntil - now : 0;
  const weekAgo = now - 7 * 86_400_000;
  const resistedWeek = reset.urges.filter((u) => u.resisted && u.at >= weekAgo).length;

  const startCooldown = (minutes: number, reason: string) =>
    saveReset((r) => ({ ...r, cooldownUntil: Date.now() + minutes * 60_000, cooldownReason: reason }));
  const restOfDay = () => {
    const end = new Date();
    end.setHours(23, 59, 0, 0);
    saveReset((r) => ({ ...r, cooldownUntil: end.getTime(), cooldownReason: "Done for the day" }));
  };

  const goals = vision.filter((v) => v.kind === "goal").slice(0, 3);
  const images = vision.filter((v) => v.image).slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading
        title="Reset Room"
        subtitle="Step away before you step in. Come here the moment you feel FOMO, the urge to win it back, or the itch for one more trade."
      />

      {/* ------------------------------- COOL-DOWN ------------------------------ */}
      <Panel className="overflow-hidden">
        <div className="gold-line" />
        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
          {remaining > 0 ? (
            <div>
              <Eyebrow className="text-bear">Cool-down active{reset.cooldownReason ? ` · ${reset.cooldownReason}` : ""}</Eyebrow>
              <div className="ticker display mt-2 text-5xl font-extrabold tracking-tight sm:text-6xl">{clock(remaining)}</div>
              <p className="mt-2 text-sm text-mute">No new trades until the timer ends. Stand up. Get water. Leave the charts.</p>
            </div>
          ) : (
            <div>
              <Eyebrow>Cool-down</Eyebrow>
              <p className="mt-2 max-w-md text-sm text-mute">
                A timer is a decision made in advance. Start one and the next trade waits until it ends — however good it looks.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {remaining > 0 ? (
              <GhostButton onClick={() => saveReset((r) => ({ ...r, cooldownUntil: null, cooldownReason: null }))}>End early</GhostButton>
            ) : (
              <>
                <GoldButton onClick={() => startCooldown(plan.cooldownMinutes, "Break")}>{plan.cooldownMinutes}-minute break</GoldButton>
                <GhostButton onClick={() => startCooldown(5, "Quick reset")}>5 min</GhostButton>
                <GhostButton onClick={() => startCooldown(60, "One hour away")}>1 hour</GhostButton>
                <GhostButton onClick={restOfDay}>Done for today</GhostButton>
              </>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ------------------------------ THE URGE ------------------------------ */}
        <Panel className="p-5">
          <Eyebrow className="mb-3">What are you feeling?</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {URGES.map((u) => (
              <button
                key={u.key}
                onClick={() => setUrge(urge === u.key ? null : u.key)}
                className={`border px-4 py-2 font-display text-xs font-bold uppercase tracking-widest transition ${
                  urge === u.key ? "border-gold bg-gold text-void" : "border-hairline text-mute hover:border-gold hover:text-gold"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
          {urge ? (
            <UrgeScript
              key={urge}
              kind={urge}
              onResolve={(resisted, note) => {
                saveReset((r) => ({ ...r, urges: [{ id: uid("urg"), at: Date.now(), kind: urge, resisted, note }, ...r.urges].slice(0, 300) }));
                if (resisted && (urge === "revenge" || urge === "fomo")) startCooldown(plan.cooldownMinutes, urge === "revenge" ? "After a revenge urge" : "After a FOMO urge");
                setUrge(null);
              }}
            />
          ) : (
            <p className="mt-4 text-sm text-faint">Pick the one that fits. You will get the questions that cut through it.</p>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel className="p-5"><TiltMeter tilt={tilt} /></Panel>
          <Panel className="p-5">
            <Eyebrow className="mb-3">Box breathing</Eyebrow>
            <Breathing />
          </Panel>
        </div>
      </div>

      {/* --------------------------------- WHY --------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <Eyebrow className="mb-2">Why I trade</Eyebrow>
          {plan.whyITrade.trim() ? (
            <p className="whitespace-pre-wrap text-base leading-relaxed">{plan.whyITrade}</p>
          ) : (
            <p className="text-sm text-mute">You have not written this yet. <Link href="/plan" className="text-gold hover:underline">Add it to your Trading Plan</Link> — it is what you will read here when it matters.</p>
          )}
          {goals.length ? (
            <div className="mt-4 space-y-2 border-t border-hairline-soft pt-4">
              {goals.map((g) => (
                <div key={g.id} className="text-sm"><span className="text-gold">◆</span> {g.title}</div>
              ))}
            </div>
          ) : null}
          {images.length ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {images.map((v) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={v.id} src={v.image!} alt={v.title} className="aspect-square w-full object-cover" />
              ))}
            </div>
          ) : null}
          <Link href="/vision" className="mt-3 inline-block text-[10px] uppercase tracking-widest text-gold hover:underline">Open vision board →</Link>
        </Panel>

        <Panel className="p-5">
          <Eyebrow className="mb-2">My rules</Eyebrow>
          <ol className="space-y-2">
            {plan.rules.map((r, i) => (
              <li key={r.id} className="flex gap-2 text-sm"><span className="font-display text-xs font-bold text-gold">{i + 1}.</span>{r.text}</li>
            ))}
          </ol>
        </Panel>
      </div>

      {/* ------------------------------- URGE LOG ------------------------------- */}
      <Panel>
        <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3">
          <Eyebrow>Urges logged</Eyebrow>
          <span className="text-[10px] uppercase tracking-widest text-bull">{resistedWeek} resisted this week</span>
        </div>
        {reset.urges.length === 0 ? (
          <p className="px-4 py-5 text-sm text-mute">Every urge you resist and log here is a rep. Resisting has to feel like a win, or you will stop doing it.</p>
        ) : (
          reset.urges.slice(0, 12).map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 border-b border-hairline-soft px-4 py-2.5 text-sm last:border-b-0">
              <div className="min-w-0">
                <span className="display text-xs font-bold uppercase tracking-widest">{URGES.find((x) => x.key === u.kind)?.label}</span>
                {u.note ? <span className="ml-2 text-mute">{u.note}</span> : null}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[10px] uppercase tracking-widest">
                <span className={u.resisted ? "text-bull" : "text-gold"}>{u.resisted ? "Resisted" : "Passed the checks"}</span>
                <span className="text-faint">{new Date(u.at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

function clock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function UrgeScript({ kind, onResolve }: { kind: UrgeKind; onResolve: (resisted: boolean, note: string) => void }) {
  const script = URGE_SCRIPTS[kind];
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [quote, setQuote] = useState<Quote>(() => QUOTES.find((q) => script.topics.includes(q.topic)) ?? QUOTES[0]);
  const [note, setNote] = useState("");
  const answered = Object.keys(answers).length;
  const allYes = answered === script.questions.length && Object.values(answers).every(Boolean);
  // For revenge, overtrading and boredom a "yes" to these questions is the bad answer.
  const goodIsYes = kind === "fomo" || kind === "fear";
  const passed = goodIsYes ? allYes : answered === script.questions.length && script.questions.every((_, i) => answerIsClean(kind, i, answers[i]));

  return (
    <div className="mt-5 space-y-5">
      <h3 className="display text-lg font-bold">{script.title}</h3>
      <QuoteCard quote={quote} compact onNext={() => setQuote(randomQuote(script.topics, quote.text))} />
      <div>
        <Eyebrow className="mb-2">Answer honestly</Eyebrow>
        <ul className="space-y-2">
          {script.questions.map((q, i) => (
            <li key={q} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline-soft pb-2 text-sm">
              <span className="min-w-0 flex-1">{q}</span>
              <span className="flex gap-1">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    onClick={() => setAnswers({ ...answers, [i]: v })}
                    className={`w-12 border py-1 text-[10px] font-bold uppercase tracking-widest ${
                      answers[i] === v ? "border-gold bg-gold/15 text-gold" : "border-hairline text-faint hover:text-bone"
                    }`}
                  >
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {answered === script.questions.length ? (
        passed ? (
          <p className="border border-bull/40 bg-bull/5 px-4 py-3 text-sm text-bull">
            {kind === "fear"
              ? "It passes your own checks. Take it at normal size and let the stop do the worrying."
              : "Every answer is clean. If this is a real setup on your plan, it can be logged and taken — at normal size."}
          </p>
        ) : (
          <p className="border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-gold">
            At least one answer says this is the feeling talking, not the setup. Let this one go.
          </p>
        )
      ) : null}

      <TextInput value={note} onChange={setNote} placeholder="Optional note — what set it off?" />
      <div className="flex flex-wrap gap-2">
        <GoldButton onClick={() => onResolve(true, note)}>I let it go{kind === "fomo" || kind === "revenge" ? " — start my break" : ""}</GoldButton>
        {passed ? (
          <Link href="/journal?new=1"><GhostButton onClick={() => onResolve(false, note)}>It passed — log the trade</GhostButton></Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * For the urges whose questions are phrased as warning signs, a clean answer
 * is "no" — except the questions that ask about the setup itself.
 */
function answerIsClean(kind: UrgeKind, index: number, answer: boolean | undefined): boolean {
  if (answer == null) return false;
  if (kind === "revenge") return index === 0 || index === 3 || index === 4 ? answer : !answer;
  if (kind === "overtrading") return index === 1 ? answer : !answer;
  if (kind === "boredom") return index === 0 ? answer : !answer;
  return answer;
}

/** Four seconds in, hold, out, hold. The square grows and shrinks with the breath. */
function Breathing() {
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const phase = Math.floor(tick / 4) % 4;
  const count = 4 - (tick % 4);
  const round = Math.floor(tick / 16) + 1;
  const label = ["Breathe in", "Hold", "Breathe out", "Hold"][phase];
  const big = phase === 0 || phase === 1;

  return (
    <div className="flex flex-col items-center">
      <div className="flex h-40 w-40 items-center justify-center">
        <div
          className="flex items-center justify-center border-2 border-gold bg-gold/10 transition-all ease-in-out motion-reduce:transition-none"
          style={{ width: running && big ? 150 : 80, height: running && big ? 150 : 80, transitionDuration: "4000ms" }}
        >
          <span className="ticker display text-2xl font-bold text-gold">{running ? count : "4"}</span>
        </div>
      </div>
      <div className="display mt-2 text-sm font-bold uppercase tracking-widest">{running ? label : "Ready"}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-faint">{running ? `Round ${round} of 4` : "Four rounds · about a minute"}</div>
      <div className="mt-3">
        {running ? (
          <GhostButton onClick={() => { setRunning(false); setTick(0); }}>{round > 4 ? "Done" : "Stop"}</GhostButton>
        ) : (
          <GoldButton onClick={() => { setTick(0); setRunning(true); }}>Start</GoldButton>
        )}
      </div>
    </div>
  );
}

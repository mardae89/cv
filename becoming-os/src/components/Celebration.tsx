import { Award, Download, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/data/store";
import { longestRun } from "@/lib/calc/athletic";
import { fmtCount, summarize } from "@/lib/calc/audience";
import { greenStreak, indexPower, periodResult, weekOf } from "@/lib/calc/power";
import { goalStatus, METRIC_LABEL } from "@/lib/calc/business";
import { weightProgress } from "@/lib/calc/weight";
import { fmtDate } from "@/lib/dates";
import { errorMessage, lb, money, pct } from "@/lib/format";
import type { AchievementRow, UserData } from "@/lib/types";
import type { Evaluation } from "@/lib/calc/milestones";
import { saveFile } from "@/data/host";
import { useFeedback } from "./feedback";
import { Button, cx } from "./ui";

/** One line of cumulative context for a milestone's category. */
export function progressLine(a: Pick<AchievementRow, "category">, data: UserData, ev: Evaluation, today: string): string {
  switch (a.category) {
    case "weight": {
      const wp = weightProgress(data.goals, data.weights);
      return wp ? `${lb(wp.lost)} lost on the 7-day average · ${pct(wp.pctPrimary)} of the ${wp.goal.targetLoss} lb goal` : "";
    }
    case "business": {
      const s = data.businessSettings;
      if (!s) return "";
      const g = goalStatus({ transactions: data.transactions, payments: data.payments }, s, today);
      return `${METRIC_LABEL[g.metric]} this month: ${money(g.value)} of ${money(g.goal)}`;
    }
    case "audience": {
      return summarize(data.audience ?? [], today).map((s) => `${s.platform.name} ${fmtCount(s.current.count)}`).join(" · ");
    }
    case "power": {
      const idx = indexPower(data);
      const w = weekOf(today);
      const p = periodResult(data.powerItems ?? [], w.from, w.to, idx, today);
      const streak = greenStreak(data.powerItems ?? [], idx, today);
      return `This week ${p.pct === null ? "—" : `${Math.round(p.pct)}%`} PCR · green streak ${streak.current} day${streak.current === 1 ? "" : "s"}`;
    }
    case "athletic": {
      const lr = longestRun(data.workouts);
      return `${data.workouts.filter((w) => w.activity !== "recovery").length} sessions logged · longest run ${lr.distance} mi`;
    }
    default:
      return `Level ${ev.level.current.level}: ${ev.level.current.name} · ${ev.xp.total.toLocaleString()} XP · ${ev.unlocked.filter((m) => m.category !== "level").length} milestones`;
  }
}

async function drawCard(a: AchievementRow, line: string): Promise<Blob> {
  await Promise.all([
    document.fonts.load('600 96px "Cormorant Garamond"'),
    document.fonts.load('600 28px "Inter Variable"'),
  ]).catch(() => undefined);
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a0a0b";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#c9a24c";
  g.lineWidth = 2;
  g.strokeRect(48, 48, W - 96, H - 96);
  g.textAlign = "center";
  g.fillStyle = "#f4f2ec";
  g.font = '600 40px "Cormorant Garamond", Georgia, serif';
  g.fillText("B E C O M I N G   O S", W / 2, 150);
  g.fillStyle = "#c9a24c";
  g.font = '600 24px "Inter Variable", Inter, sans-serif';
  g.fillText(a.tier === "major" ? "M A J O R   M I L E S T O N E" : "M I L E S T O N E   U N L O C K E D", W / 2, 420);
  g.fillStyle = "#f4f2ec";
  g.font = '600 92px "Cormorant Garamond", Georgia, serif';
  const words = a.title.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > W - 220 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  lines.push(cur);
  lines.forEach((l, i) => g.fillText(l, W / 2, 560 + i * 100));
  const y = 560 + lines.length * 100 + 30;
  g.fillStyle = "#a09fa6";
  g.font = '500 30px "Inter Variable", Inter, sans-serif';
  g.fillText(fmtDate(a.achieved_on), W / 2, y);
  if (line) {
    g.font = '500 26px "Inter Variable", Inter, sans-serif';
    g.fillText(line.length > 70 ? line.slice(0, 68) + "…" : line, W / 2, y + 60);
  }
  g.fillStyle = "#c9a24c";
  g.fillRect(W / 2 - 40, H - 260, 80, 2);
  g.fillStyle = "#a09fa6";
  g.font = '600 20px "Inter Variable", Inter, sans-serif';
  g.fillText("BUILD THE BODY. BUILD THE BUSINESS. BUILD THE MAN.", W / 2, H - 200);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't render the card"))), "image/png"));
}

export function CardActions({ a, line }: { a: AchievementRow; line: string }) {
  const { host } = useStore();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const file = async () => new File([await drawCard(a, line)], `becoming-${a.key.replace(/\W+/g, "-")}.png`, { type: "image/png" });
  // Inside a frame, files can only be saved through the page's own save dialog,
  // and there's no Web Share. Elsewhere, Share only where the browser can share files.
  const canSave = !host.framed || !!host.downloads;
  const canShare = !host.framed && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function";
  const save = async () => {
    setBusy(true);
    try {
      const f = await file();
      if ((await saveFile(host, f.name, f)) === "declined") toast("Card not saved.", "info");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    setBusy(true);
    try {
      const f = await file();
      if (!navigator.canShare({ files: [f] })) {
        toast("This browser can't share images — use Save instead.", "info");
        return;
      }
      await navigator.share({ files: [f], title: a.title });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  if (!canSave && !canShare) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {canSave && <Button variant="secondary" size="sm" busy={busy} icon={<Download className="h-4 w-4" />} onClick={save}>Save card</Button>}
      {canShare && <Button variant="secondary" size="sm" disabled={busy} icon={<Share2 className="h-4 w-4" />} onClick={share}>Share</Button>}
    </div>
  );
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: Math.random() * 100,
    w: 4 + Math.random() * 5,
    h: 8 + Math.random() * 10,
    dur: 3.2 + Math.random() * 2.6,
    delay: Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 160,
    hue: i % 3,
  })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} className="absolute top-0 animate-fall rounded-[1px]"
          style={{
            left: `${b.left}%`, width: b.w, height: b.h,
            background: b.hue === 0 ? "var(--gold)" : b.hue === 1 ? "var(--gold-hi)" : "var(--gold-dim)",
            ["--dur" as string]: `${b.dur}s`, ["--delay" as string]: `${b.delay}s`, ["--drift" as string]: `${b.drift}px`,
          }} />
      ))}
    </div>
  );
}

export function CelebrationHost() {
  const { data, ev, today, update, milestoneByKey } = useStore();
  const { toast } = useFeedback();
  const [closing, setClosing] = useState(false);
  // Escape closes the dialog (and anything queued behind it).
  const closeAll = useRef<() => void>(() => undefined);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pending = data.achievements
    .filter((a) => !a.celebrated_at)
    .sort((a, b) => (a.tier === b.tier ? (a.achieved_on < b.achieved_on ? 1 : -1) : a.tier === "major" ? -1 : 1));
  if (!pending.length) {
    closeAll.current = () => undefined;
    return null;
  }

  const batch = pending.length > 3;
  const a = pending[0];
  const m = milestoneByKey(a.key);
  const next = m?.nextKey ? milestoneByKey(m.nextKey) : undefined;
  const prev = m?.prevKey ? milestoneByKey(m.prevKey) : undefined;
  const major = a.tier === "major" || batch;
  const line = progressLine(a, data, ev, today);

  const done = async (all = false) => {
    setClosing(true);
    const ids = batch || all ? pending.map((p) => p.id) : [a.id];
    const at = new Date().toISOString();
    // Each update shows at once; this waits only for storage to confirm.
    const results = await Promise.allSettled(ids.map((id) => update("achievements", id, { celebrated_at: at })));
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) toast(errorMessage(failed.reason), "error");
    setClosing(false);
  };
  closeAll.current = () => {
    if (!closing) void done(true);
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Milestone unlocked">
      <div className={cx("fixed inset-0 animate-fade", major ? "bg-black/90" : "bg-black/70")} />
      {major && <div className="pointer-events-none fixed inset-0"><Confetti /></div>}
      {/* Scrolls on short screens so Continue is always reachable. */}
      <div className="relative flex min-h-full items-center justify-center p-4 py-[max(1rem,env(safe-area-inset-top,0px))]">
      <div className={cx("relative w-full animate-rise text-center", major ? "max-w-xl" : "max-w-md rounded-3xl border border-gold/30 bg-panel p-8")}>
        {/* Closes this and any others waiting; they all stay on the milestone timeline. */}
        <button type="button" onClick={() => done(true)} disabled={closing}
          aria-label="Close" title={pending.length > 1 ? `Close all ${pending.length}` : "Close"}
          className={cx("absolute flex h-10 w-10 items-center justify-center rounded-full text-mute transition hover:bg-raised hover:text-bone",
            major ? "-right-1 -top-2" : "right-3 top-3")}>
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-gold/50 text-gold">
          <Award className="h-7 w-7" />
        </div>
        <div className="eyebrow mb-3 text-gold">
          {batch ? `${pending.length} milestones unlocked` : a.tier === "major" ? "Major milestone" : "Milestone unlocked"}
        </div>
        <h2 className={cx("leading-[1.02] text-bone", major ? "text-[46px] sm:text-[60px]" : "text-[36px]")}>{a.title}</h2>
        <p className="num mt-3 text-[14px] text-mute">{fmtDate(a.achieved_on)}</p>
        {line && <p className="mt-2 text-[14px] text-bone/85">{line}</p>}

        {batch ? (
          <ul className="mx-auto mt-6 max-h-48 max-w-sm space-y-1.5 overflow-y-auto text-left text-[13px]">
            {pending.slice(1).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 border-b border-hair pb-1.5">
                <span className="text-bone">{p.title}</span>
                <span className="num shrink-0 text-faint">{fmtDate(p.achieved_on)}</span>
              </li>
            ))}
          </ul>
        ) : (
          (prev || next) && (
            <div className={cx("mx-auto mt-6 grid max-w-sm gap-3 text-left text-[12px]", prev && next && "grid-cols-2")}>
              {prev && (
                <div className="rounded-xl border border-hair p-3">
                  <div className="eyebrow mb-1">Previous</div>
                  <div className="text-bone">{prev.title}</div>
                </div>
              )}
              {next && (
                <div className="rounded-xl border border-gold/30 p-3">
                  <div className="eyebrow mb-1 text-gold">Next</div>
                  <div className="text-bone">{next.title}</div>
                  <div className="mt-1 text-faint">{next.requirement}</div>
                </div>
              )}
            </div>
          )
        )}

        <div className="mt-7 flex flex-col items-center gap-3">
          {!batch && <CardActions a={a} line={line} />}
          <Button size="lg" busy={closing} onClick={() => done()} className="min-w-[200px]">
            {pending.length > 1 && !batch ? "Next" : "Continue"}
          </Button>
          <p className="text-[11px] text-faint">Saved permanently to your milestone timeline.</p>
        </div>
      </div>
      </div>
    </div>
  );
}

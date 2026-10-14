// Offers the one-time tidy-up between the Power List (every day) and Daily
// execution (what's scheduled for a given day). Shown only while something
// overlaps; nothing changes until Apply.
import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { describeStep, habitFromPowerItem, planTidy, type TidyStep } from "@/lib/tidy";
import { errorMessage, plural } from "@/lib/format";
import { useFeedback } from "./feedback";
import { Button, Card, cx, Eyebrow } from "./ui";

const KEY = "becoming-os:tidy-dismissed";
/** Changes you unticked and applied around: kept as they are, not offered again on this device. */
const KEPT = "becoming-os:tidy-kept";
const stepKey = (s: TidyStep) => `${s.kind}:${"id" in s ? s.id : s.name}`;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function readKept(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEPT) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function wasDismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function TidyCard() {
  const { data, today, insert, update } = useStore();
  const { toast } = useFeedback();
  const [kept, setKept] = useState(readKept);
  const steps = useMemo(() => planTidy(data, today).filter((s) => !kept.has(stepKey(s))), [data, today, kept]);
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [hidden, setHidden] = useState(wasDismissed);
  const [busy, setBusy] = useState(false);
  if (!steps.length || hidden) return null;

  const chosen = steps.filter((s) => !off.has(stepKey(s)));
  const toggle = (k: string) => setOff((o) => {
    const n = new Set(o);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  const apply = async () => {
    setBusy(true);
    try {
      let habitOrder = data.habits.reduce((m, h) => Math.max(m, h.sort_order), 0);
      for (const s of chosen) {
        if (s.kind === "archive-habit") {
          const h = data.habits.find((x) => x.id === s.id)!;
          await update("habits", s.id, { archived_on: today < h.start_date ? h.start_date : today });
        } else if (s.kind === "rename-habit") {
          await update("habits", s.id, { name: s.to });
        } else if (s.kind === "add-power") {
          // Right after waking up; everything below moves down one place.
          const list = [...data.powerItems].sort((a, b) => a.sort_order - b.sort_order);
          const wake = list.find((i) => /\bwake\b/i.test(i.name));
          const at = wake ? wake.sort_order + 1 : 0;
          for (const i of list.filter((x) => x.sort_order >= at)) await update("powerItems", i.id, { sort_order: i.sort_order + 1 });
          await insert("powerItems", [{ name: s.name, kind: "check", days: EVERY_DAY, start_date: today, sort_order: at, target: null, unit: null, auto: null, archived_on: null }]);
        } else if (s.kind === "move-to-habits") {
          const exists = data.habits.some((h) => h.name.trim().toLowerCase() === s.name.trim().toLowerCase() && !(h.archived_on && h.archived_on <= today));
          if (!exists) await insert("habits", [habitFromPowerItem(s, today, ++habitOrder) as Record<string, unknown>]);
          await update("powerItems", s.id, { archived_on: today });
        }
      }
      const keep = new Set([...kept, ...steps.filter((s) => off.has(stepKey(s))).map(stepKey)]);
      try {
        localStorage.setItem(KEPT, JSON.stringify([...keep]));
      } catch {
        // storage blocked: offered again next visit
      }
      setKept(keep);
      toast(`Done: ${plural(chosen.length, "change")}. Edit either list any time.`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // storage blocked: hidden for this visit only
    }
    setHidden(true);
  };

  return (
    <Card className="border-gold/30">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold"><Sparkles className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-1 text-gold">Tidy up</Eyebrow>
          <h2 className="text-[22px] leading-tight">Your two lists overlap</h2>
          <p className="mt-1.5 text-[13px] text-mute">
            The Power List is what you do every day, no matter what. Daily execution is what's scheduled for a given day, plus today's tasks. Untick anything you want to keep as it is.
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-1" aria-label="Proposed changes">
        {steps.map((s) => {
          const k = stepKey(s);
          const on = !off.has(k);
          return (
            <li key={k}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(k)}
                className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left text-[13.5px] hover:bg-raised">
                <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold",
                  on ? "border-gold bg-gold text-ink" : "border-line")}>{on && "✓"}</span>
                <span className={on ? "text-bone" : "text-mute"}>{describeStep(s)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11.5px] text-faint">Removed habits are archived: their history, streaks and XP stay.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button busy={busy} disabled={!chosen.length} onClick={apply}>Apply {chosen.length ? plural(chosen.length, "change") : ""}</Button>
        <Button variant="ghost" onClick={dismiss}>Not now</Button>
      </div>
    </Card>
  );
}

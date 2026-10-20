import { singleton } from "@/lib/utils/cache";

/**
 * API REQUEST BUDGET.
 *
 * Market data vendors bill per request and rate-limit hard. Twelve Data's free
 * tier, for example, allows 8 requests per minute and 800 per day. Without a
 * guard, a single dashboard scan would exhaust a day's quota and every
 * subsequent call would 429 — which looks to the user like a broken app rather
 * than an exhausted plan.
 *
 * This tracks both windows and refuses a call BEFORE it is made, so the caller
 * falls back to demo data cleanly and the UI can say exactly why.
 */
export interface BudgetState {
  perMinute: number;
  perDay: number;
  usedThisMinute: number;
  usedToday: number;
  minuteResetsAt: number;
  dayResetsAt: number;
  exhausted: boolean;
  reason: string | null;
}

class RequestBudget {
  private minuteCount = 0;
  private dayCount = 0;
  private minuteResetsAt = Date.now() + 60_000;
  private dayResetsAt = Date.now() + 86_400_000;
  private lastRefusal: string | null = null;

  constructor(private perMinute: number, private perDay: number) {}

  private roll() {
    const now = Date.now();
    if (now >= this.minuteResetsAt) {
      this.minuteCount = 0;
      this.minuteResetsAt = now + 60_000;
    }
    if (now >= this.dayResetsAt) {
      this.dayCount = 0;
      this.dayResetsAt = now + 86_400_000;
    }
  }

  /** Reserve `n` requests. Returns false when the budget cannot cover them. */
  tryConsume(n = 1): boolean {
    this.roll();
    if (this.dayCount + n > this.perDay) {
      this.lastRefusal = `Daily request budget of ${this.perDay} reached. Live data resumes when it resets.`;
      return false;
    }
    if (this.minuteCount + n > this.perMinute) {
      this.lastRefusal = `Per-minute request limit of ${this.perMinute} reached. Showing cached or demo data for a moment.`;
      return false;
    }
    this.minuteCount += n;
    this.dayCount += n;
    return true;
  }

  state(): BudgetState {
    this.roll();
    return {
      perMinute: this.perMinute,
      perDay: this.perDay,
      usedThisMinute: this.minuteCount,
      usedToday: this.dayCount,
      minuteResetsAt: this.minuteResetsAt,
      dayResetsAt: this.dayResetsAt,
      exhausted: this.dayCount >= this.perDay,
      reason: this.lastRefusal,
    };
  }
}

export const budget = singleton(
  "apiBudget",
  () =>
    new RequestBudget(
      Number(process.env.MD_API_PER_MINUTE ?? 8),
      Number(process.env.MD_API_PER_DAY ?? 800),
    ),
);

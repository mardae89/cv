// Starting templates offered during onboarding. These are structure only —
// names, schedules and editable offer prices — never financial results or
// health records.
import type { ActivityMetric, Habit, HabitCategory, Offer } from "./types";

export interface HabitTemplate {
  name: string;
  category: HabitCategory;
  schedule_days: number[];
  skip_on_rest_days?: boolean;
  xp?: number;
  business?: boolean;
  defaultOn?: boolean;
}

const EVERY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

export const HABIT_TEMPLATES: HabitTemplate[] = [
  { name: "Wake up on time", category: "mind", schedule_days: EVERY, defaultOn: true },
  { name: "Lights out on time", category: "recovery", schedule_days: EVERY, defaultOn: true },
  { name: "Read or learn (20 min)", category: "mind", schedule_days: EVERY, defaultOn: true },
  { name: "Strength training", category: "training", schedule_days: [1, 3, 5], skip_on_rest_days: true, xp: 15, defaultOn: true },
  { name: "Cardio / conditioning", category: "training", schedule_days: [2, 4, 6], skip_on_rest_days: true, xp: 15 },
  { name: "Log nutrition", category: "nutrition", schedule_days: EVERY, defaultOn: true },
  { name: "Hit hydration goal", category: "nutrition", schedule_days: EVERY },
  { name: "Business outreach", category: "business", schedule_days: WEEKDAYS, business: true, xp: 15, defaultOn: true },
  { name: "Publish content", category: "business", schedule_days: [1, 3, 5], business: true, xp: 15 },
  { name: "Sales activity", category: "business", schedule_days: WEEKDAYS, business: true, xp: 15 },
  { name: "Plan tomorrow", category: "mind", schedule_days: EVERY, defaultOn: true },
  { name: "Reflect / journal", category: "mind", schedule_days: EVERY },
  { name: "Mobility & recovery", category: "recovery", schedule_days: [0, 3] },
  { name: "Quality time together", category: "relationship", schedule_days: EVERY, defaultOn: true },
];

export const habitFromTemplate = (t: HabitTemplate, startDate: string, order: number): Partial<Habit> => ({
  name: t.name,
  category: t.category,
  schedule_days: t.schedule_days,
  skip_on_rest_days: t.skip_on_rest_days ?? false,
  xp: t.xp ?? 10,
  start_date: startDate,
  sort_order: order,
});

export interface BusinessTemplate {
  key: string;
  name: string;
  kind: "service" | "education" | "other";
  description: string;
  offers: Pick<Offer, "name" | "price" | "billing" | "term_months">[];
  metrics: Pick<ActivityMetric, "label" | "kind">[];
}

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    key: "lrg",
    name: "Lost Revenue Group",
    kind: "service",
    description:
      "Helps HVAC companies recover missed calls and unbooked jobs: lead capture, AI receptionist and automated follow-up.",
    offers: [
      { name: "Revenue recovery setup fee", price: null, billing: "one_time", term_months: null },
      { name: "Revenue recovery system (monthly)", price: null, billing: "monthly", term_months: null },
    ],
    metrics: [
      { label: "LinkedIn connections", kind: "outreach" },
      { label: "Direct messages", kind: "outreach" },
      { label: "Cold emails", kind: "outreach" },
      { label: "Comments", kind: "outreach" },
      { label: "Follow-ups", kind: "outreach" },
      { label: "Sales calls", kind: "sales" },
      { label: "Proposals sent", kind: "sales" },
    ],
  },
  {
    key: "em",
    name: "Exchange Mastery",
    kind: "education",
    description: "Forex trading education: course, Skool community and mentorship.",
    offers: [
      { name: "Trading course", price: 197, billing: "one_time", term_months: null },
      { name: "Community membership", price: 49, billing: "monthly", term_months: null },
      { name: "1:1 mentorship (6 weeks)", price: 1500, billing: "one_time", term_months: null },
      { name: "Extended mentorship (3 months)", price: 3000, billing: "one_time", term_months: 3 },
    ],
    metrics: [
      { label: "Short-form videos", kind: "content" },
      { label: "Long-form YouTube videos", kind: "content" },
      { label: "Calls to action", kind: "content" },
      { label: "Website visits", kind: "audience" },
      { label: "Email leads", kind: "audience" },
      { label: "Community signups", kind: "audience" },
    ],
  },
];

export const EXPENSE_CATEGORIES = [
  "software", "advertising", "contractors", "delivery", "education", "fees", "equipment", "travel", "other",
] as const;

export const ACTIVITY_OPTIONS = [
  "Walking", "Strength training", "Cycling", "Swimming", "Running", "Yoga / mobility", "Classes", "Hiking", "Dancing",
];

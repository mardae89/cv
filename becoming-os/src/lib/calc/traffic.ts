// The Traffic Engine: four numbers tracked every week — people reached,
// conversations, invitations and members — overall and per channel, with the
// conversion between each step.
import { addDays, weekStart } from "../dates";
import { num } from "../format";
import type { ISODate, TrafficChannel, TrafficEntry } from "../types";

export type TrafficMetric = "reached" | "conversations" | "invitations" | "members";

export const METRICS: { key: TrafficMetric; label: string; short: string }[] = [
  { key: "reached", label: "People reached", short: "Reached" },
  { key: "conversations", label: "Conversations", short: "Conversations" },
  { key: "invitations", label: "Invitations", short: "Invitations" },
  { key: "members", label: "Members", short: "Members" },
];

export interface ChannelInfo {
  key: TrafficChannel;
  name: string;
  /** Where to find new people on this channel. */
  sources: { place: string; items: string[] }[];
}

export const CHANNELS: ChannelInfo[] = [
  { key: "existing_world", name: "Existing world", sources: [{ place: "Start with the people already around you", items: [
    "Past and existing clients (strongest)", "Friends", "Followers", "Old leads", "Colleagues", "Email contacts", "WhatsApp contacts", "LinkedIn connections"] }] },
  { key: "social_outbound", name: "Social outbound", sources: [
    { place: "Instagram", items: ["Competitor followers", "Commenters", "Story viewers", "Poll voters"] },
    { place: "LinkedIn", items: ["Job titles", "Industries", "Competitor commenters", "Old colleagues"] },
    { place: "Facebook", items: ["Groups", "Events", "Local groups", "Niche communities"] },
    { place: "Skool", items: ["Relevant communities", "Active contributors", "Complementary owners"] },
  ] },
  { key: "content", name: "Content", sources: [] },
  { key: "borrowed_audiences", name: "Borrowed audiences", sources: [] },
  { key: "referrals", name: "Referrals", sources: [] },
  { key: "webinars", name: "Webinars", sources: [] },
  { key: "external_ads", name: "External ads", sources: [] },
  { key: "skool_ads", name: "Skool ads (growth boost)", sources: [] },
];

export const channelName = (c: TrafficChannel) => CHANNELS.find((x) => x.key === c)?.name ?? c;

export type Totals = Record<TrafficMetric, number>;
const zero = (): Totals => ({ reached: 0, conversations: 0, invitations: 0, members: 0 });

export interface Conversion {
  from: TrafficMetric;
  to: TrafficMetric;
  label: string;
  /** null when there was nothing to convert from. */
  pct: number | null;
}

export interface TrafficPeriod {
  from: ISODate;
  to: ISODate;
  totals: Totals;
  byChannel: { channel: ChannelInfo; totals: Totals }[];
  conversions: Conversion[];
  days: number;
}

export function sumEntries(entries: TrafficEntry[]): Totals {
  const t = zero();
  for (const e of entries) for (const m of METRICS) t[m.key] += num(e[m.key]);
  return t;
}

export function conversions(t: Totals): Conversion[] {
  const step = (from: TrafficMetric, to: TrafficMetric, label: string): Conversion =>
    ({ from, to, label, pct: t[from] > 0 ? (t[to] / t[from]) * 100 : null });
  return [
    step("reached", "conversations", "Reached → conversation"),
    step("conversations", "invitations", "Conversation → invitation"),
    step("invitations", "members", "Invitation → member"),
  ];
}

export function trafficPeriod(entries: TrafficEntry[], from: ISODate, to: ISODate): TrafficPeriod {
  const inRange = entries.filter((e) => e.log_date >= from && e.log_date <= to);
  const totals = sumEntries(inRange);
  const byChannel = CHANNELS.map((channel) => ({ channel, totals: sumEntries(inRange.filter((e) => e.channel === channel.key)) }))
    .filter((c) => METRICS.some((m) => c.totals[m.key] > 0));
  return { from, to, totals, byChannel, conversions: conversions(totals), days: 7 };
}

export const trafficWeek = (entries: TrafficEntry[], date: ISODate) => trafficPeriod(entries, weekStart(date), addDays(weekStart(date), 6));

/** Every week from the first entry to `today`, oldest first. */
export function trafficWeeks(entries: TrafficEntry[], today: ISODate): TrafficPeriod[] {
  if (!entries.length) return [];
  const first = entries.reduce((m, e) => (e.log_date < m ? e.log_date : m), entries[0].log_date);
  const out: TrafficPeriod[] = [];
  for (let w = weekStart(first); w <= today; w = addDays(w, 7)) out.push(trafficPeriod(entries, w, addDays(w, 6)));
  return out;
}

/** People reached so far today vs the daily target. */
export function reachedOn(entries: TrafficEntry[], date: ISODate): number {
  return entries.filter((e) => e.log_date === date).reduce((s, e) => s + num(e.reached), 0);
}

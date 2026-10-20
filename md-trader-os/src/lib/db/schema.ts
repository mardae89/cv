import type { Tier } from "@/lib/config/tiers";
import type { Direction, Timeframe, TradingMode, TrendScope } from "@/lib/types";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "user" | "admin";
  tier: Tier;
  createdAt: number;
  lastSeenAt: number;
  onboarded: boolean;
  preferences: UserPreferences;
  subscription: Subscription;
}

export interface UserPreferences {
  mode: TradingMode;
  /** Which timeframes may define the trend. Defaults to higher timeframes only. */
  trendScope: TrendScope;
  markets: string[];
  defaultTimeframe: Timeframe;
  theme: "dark";
  emailAlerts: boolean;
  browserAlerts: boolean;
  disclaimerAcceptedAt: number | null;
}

export interface Subscription {
  tier: Tier;
  status: "active" | "trialing" | "canceled" | "none";
  provider: "stripe" | "demo" | "none";
  externalId: string | null;
  currentPeriodEnd: number | null;
  startedAt: number | null;
}

export interface Watchlist {
  id: string;
  userId: string;
  name: string;
  symbols: string[];
  createdAt: number;
}

export type AlertKind =
  | "score-above"
  | "score-below"
  | "direction-becomes"
  | "direction-change"
  | "price-cross-ma50"
  | "structure-change"
  | "factors-aligned"
  | "event-countdown";

export interface Alert {
  id: string;
  userId: string;
  symbol: string;
  kind: AlertKind;
  /** Numeric threshold: score level, factor count or hours before an event. */
  threshold: number;
  direction: Direction | null;
  note: string;
  active: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
  triggerCount: number;
  lastState: string | null;
}

export interface JournalEntry {
  id: string;
  userId: string;
  symbol: string;
  direction: "long" | "short";
  entry: number;
  stop: number | null;
  target: number | null;
  size: number | null;
  openedAt: number;
  closedAt: number | null;
  strategy: string;
  timeframe: Timeframe;
  mdScoreAtEntry: number | null;
  screenshotUrl: string | null;
  notes: string;
  outcome: "open" | "win" | "loss" | "breakeven";
  resultR: number | null;
  resultPct: number | null;
}

export interface SavedBacktest {
  id: string;
  userId: string;
  name: string;
  params: Record<string, unknown>;
  summary: Record<string, unknown>;
  createdAt: number;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
  at: number;
  grounded: boolean;
}

export interface AiConversation {
  id: string;
  userId: string;
  title: string;
  messages: AiMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SystemLog {
  id: string;
  at: number;
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface UsageEvent {
  id: string;
  at: number;
  userId: string | null;
  kind: "page-view" | "scan" | "ai-message" | "alert-trigger" | "asset-view";
  detail: string;
}

export interface Database {
  users: User[];
  watchlists: Watchlist[];
  alerts: Alert[];
  journal: JournalEntry[];
  backtests: SavedBacktest[];
  conversations: AiConversation[];
  logs: SystemLog[];
  usage: UsageEvent[];
}

export const EMPTY_DB: Database = {
  users: [], watchlists: [], alerts: [], journal: [], backtests: [], conversations: [], logs: [], usage: [],
};

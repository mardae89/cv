"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { NewsArticle, NewsCategory } from "@/lib/types";
import { Paywall } from "@/components/paywall";
import { EmptyState, ErrorState, Eyebrow, ImpactTag, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { timeAgo } from "@/lib/utils/format";
import { Icon } from "@/components/icons";

const CATEGORIES: (NewsCategory | "all")[] = [
  "all", "markets", "macro", "central-banks", "forex", "stocks", "crypto", "commodities", "geopolitics",
];

interface MappedMarket {
  symbol: string;
  name: string;
  group: string;
  relevance: number;
  effect: number;
  direction: string;
  reason: string;
}

export default function NewsPage() {
  const [category, setCategory] = useState<NewsCategory | "all">("all");
  const [impact, setImpact] = useState("any");
  const [open, setOpen] = useState<string | null>(null);

  const { data, loading, error, refresh, upgrade } = useApi<{ articles: NewsArticle[]; demo: boolean }>(
    `/api/news?category=${category}&impact=${impact}&limit=80`,
  );

  if (upgrade) return <Paywall requiredTier={upgrade.requiredTier} featureName="AI News Intelligence" />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <SectionHeading
        title="News Intelligence"
        subtitle="Every story is classified by theme, then mapped to the markets that theme actually touches."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-widest transition ${
                c === category ? "bg-gold text-void" : "border border-hairline text-mute hover:border-gold hover:text-gold"
              }`}
            >
              {c.replace("-", " ")}
            </button>
          ))}
        </div>
        <select value={impact} onChange={(e) => setImpact(e.target.value)} className="ml-auto px-3 py-1.5 text-xs">
          <option value="any">Any impact</option>
          <option value="high">High impact</option>
          <option value="medium">Medium impact</option>
          <option value="low">Low impact</option>
        </select>
      </div>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {loading && !data ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !data?.articles.length ? (
        <EmptyState title="No stories" message="No articles match this filter right now." />
      ) : (
        <div className="space-y-3">
          {data.articles.map((a) => (
            <Panel key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-snug">{a.headline}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-faint">
                    <span>{a.source}</span>
                    <span>{timeAgo(a.publishedAt)}</span>
                    <span className="border border-hairline px-1.5 py-0.5">{a.category.replace("-", " ")}</span>
                    <span className="text-gold">{a.theme.replace(/-/g, " ")}</span>
                    <ImpactTag impact={a.impact} />
                    {a.demo ? <span className="text-gold">Demo</span> : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`display text-sm font-bold uppercase tracking-widest ${
                    a.sentiment > 0.15 ? "text-bull" : a.sentiment < -0.15 ? "text-bear" : "text-mute"
                  }`}>
                    {a.sentiment > 0.15 ? "Bullish" : a.sentiment < -0.15 ? "Bearish" : "Neutral"}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-faint">for this theme</div>
                </div>
              </div>

              <p className="mt-3 border-l border-gold/40 pl-3 text-sm text-mute">
                <span className="eyebrow mr-2 text-gold">AI summary</span>
                {a.summary}
              </p>

              <button
                onClick={() => setOpen(open === a.id ? null : a.id)}
                className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gold hover:underline"
              >
                <Icon.crossMarket className="h-3.5 w-3.5" />
                {open === a.id ? "Hide market map" : "Which markets does this touch?"}
              </button>

              {open === a.id ? <NewsMap articleId={a.id} /> : null}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsMap({ articleId }: { articleId: string }) {
  const { data, loading } = useApi<{ mapped: MappedMarket[]; note: string }>(
    `/api/news/sentiment?articleId=${encodeURIComponent(articleId)}`,
  );

  if (loading) return <Skeleton className="mt-3 h-32" />;
  if (!data?.mapped.length) return <p className="mt-3 text-xs text-mute">No mapped markets for this story.</p>;

  return (
    <div className="mt-3 border-t border-hairline-soft pt-3">
      <Eyebrow className="mb-2">News → market connections</Eyebrow>
      <div className="grid gap-2 sm:grid-cols-2">
        {data.mapped.map((m) => (
          <Link
            key={m.symbol}
            href={`/markets/${encodeURIComponent(m.symbol)}`}
            className="flex items-start justify-between gap-3 border border-hairline-soft px-3 py-2 transition hover:border-gold/40"
          >
            <div className="min-w-0">
              <div className="display text-xs font-semibold">{m.symbol}</div>
              <div className="truncate text-[10px] text-faint">{m.group}</div>
            </div>
            <div className={`shrink-0 text-right text-[11px] uppercase tracking-widest ${
              m.direction === "bullish" ? "text-bull" : m.direction === "bearish" ? "text-bear" : "text-mute"
            }`}>
              {m.direction}
              <div className="text-[9px] text-faint">rel {(m.relevance * 100).toFixed(0)}%</div>
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">{data.note}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { postJson, useApi } from "@/lib/hooks";
import { MarketRow } from "@/components/market-card";
import {
  EmptyState, ErrorState, Eyebrow, GhostButton, GoldButton, Panel, SectionHeading, Skeleton,
} from "@/components/primitives";

interface WatchlistItem {
  symbol: string; name: string; price: number; precision: number;
  changePct: number; score: number; direction: string; label: string;
}
interface WatchlistData {
  id: string; name: string; symbols: string[]; items: WatchlistItem[];
}

export default function WatchlistsPage() {
  const { data, loading, error, refresh } = useApi<{ watchlists: WatchlistData[] }>("/api/watchlists");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  async function create() {
    try {
      await postJson("/api/watchlists", { name });
      setName("");
      setStatus(null);
      refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function addSymbol(id: string) {
    const symbol = (adding[id] ?? "").trim().toUpperCase();
    if (!symbol) return;
    try {
      await postJson(`/api/watchlists/${id}`, { add: symbol }, "PATCH");
      setAdding({ ...adding, [id]: "" });
      refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function removeSymbol(id: string, symbol: string) {
    await postJson(`/api/watchlists/${id}`, { remove: symbol }, "PATCH");
    refresh();
  }

  async function removeList(id: string) {
    await fetch(`/api/watchlists/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeading title="Watchlists" subtitle="Your markets, with the MD Direction Score beside every one." />

      <Panel className="p-4">
        <Eyebrow className="mb-2">New watchlist</Eyebrow>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Forex, My Stocks, My Markets"
            className="flex-1 px-3 py-2 text-sm"
          />
          <GoldButton onClick={create} disabled={!name.trim()}>Create</GoldButton>
        </div>
        {status ? <p className="mt-2 text-xs text-bear">{status}</p> : null}
      </Panel>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : !data?.watchlists.length ? (
        <EmptyState
          title="No watchlists yet"
          message="Create one above, then add markets from here or from any market detail page."
          action={<Link href="/markets"><GhostButton>Browse markets</GhostButton></Link>}
        />
      ) : (
        <div className="space-y-5">
          {data.watchlists.map((w) => (
            <Panel key={w.id}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline-soft px-4 py-3">
                <div>
                  <h3 className="display text-sm font-bold uppercase tracking-widest">{w.name}</h3>
                  <span className="text-[10px] uppercase tracking-widest text-faint">{w.symbols.length} markets</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={adding[w.id] ?? ""}
                    onChange={(e) => setAdding({ ...adding, [w.id]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && addSymbol(w.id)}
                    placeholder="Add symbol"
                    className="w-32 px-2 py-1.5 text-xs"
                  />
                  <GhostButton onClick={() => addSymbol(w.id)}>Add</GhostButton>
                  <button onClick={() => removeList(w.id)} className="text-[10px] uppercase tracking-widest text-faint hover:text-bear">
                    Delete
                  </button>
                </div>
              </div>
              {w.items.length === 0 ? (
                <p className="px-4 py-6 text-sm text-mute">No markets in this watchlist yet.</p>
              ) : (
                w.items.map((item) => (
                  <MarketRow
                    key={item.symbol}
                    symbol={item.symbol}
                    name={item.name}
                    score={item.score}
                    direction={item.direction}
                    price={item.price}
                    changePct={item.changePct}
                    precision={item.precision}
                    right={
                      <button
                        onClick={(e) => { e.preventDefault(); removeSymbol(w.id, item.symbol); }}
                        className="ml-2 text-[10px] uppercase tracking-widest text-faint hover:text-bear"
                      >
                        Remove
                      </button>
                    }
                  />
                ))
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { Paywall } from "@/components/paywall";
import { ErrorState, Eyebrow, Panel, SectionHeading, Skeleton } from "@/components/primitives";

interface Node { symbol: string; name: string; group: string; bias: number | null }
interface Edge { from: string; to: string; sign: 1 | -1; weight: number; label: string }
interface FocusLink { symbol: string; name: string; label: string; sign: 1 | -1; weight: number; bias: number | null; confirmation: number | null }

export default function CrossMarketPage() {
  const [focus, setFocus] = useState<string | null>(null);
  const map = useApi<{ nodes: Node[]; edges: Edge[] }>("/api/cross-market");
  const detail = useApi<{ symbol: string; name: string; links: FocusLink[]; inbound: { symbol: string; name: string; label: string; sign: 1 | -1 }[] }>(
    focus ? `/api/cross-market?symbol=${encodeURIComponent(focus)}` : null,
  );

  if (map.upgrade) return <Paywall requiredTier={map.upgrade.requiredTier} featureName="Cross-Market Intelligence" />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionHeading
        title="Cross-Market Map"
        subtitle="How the big drivers connect. Click a market to see everything it is linked to and which way."
      />

      {map.error ? <ErrorState message={map.error} onRetry={map.refresh} /> : null}

      {map.loading && !map.data ? (
        <Skeleton className="h-80" />
      ) : map.data ? (
        <Panel className="p-5">
          <Graph nodes={map.data.nodes} edges={map.data.edges} focus={focus} onFocus={setFocus} />
        </Panel>
      ) : null}

      {focus ? (
        detail.loading && !detail.data ? (
          <Skeleton className="h-64" />
        ) : detail.data ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <div className="border-b border-hairline-soft px-4 py-3">
                <Eyebrow>{detail.data.symbol} — related markets</Eyebrow>
              </div>
              {detail.data.links.map((l) => (
                <div key={l.symbol} className="flex items-center justify-between gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <Link href={`/markets/${encodeURIComponent(l.symbol)}`} className="display text-sm font-semibold hover:text-gold">
                      {l.symbol}
                    </Link>
                    <div className="truncate text-[11px] text-faint">{l.label} · moves {l.sign === 1 ? "with" : "against"}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs uppercase tracking-widest ${
                      (l.bias ?? 0) > 0.15 ? "text-bull" : (l.bias ?? 0) < -0.15 ? "text-bear" : "text-mute"
                    }`}>
                      {(l.bias ?? 0) > 0.15 ? "Bullish" : (l.bias ?? 0) < -0.15 ? "Bearish" : "Flat"}
                    </div>
                    <div className={`text-[10px] uppercase tracking-widest ${(l.confirmation ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                      {(l.confirmation ?? 0) >= 0 ? "Confirming" : "Contradicting"}
                    </div>
                  </div>
                </div>
              ))}
            </Panel>
            <Panel>
              <div className="border-b border-hairline-soft px-4 py-3">
                <Eyebrow>Markets that watch {detail.data.symbol}</Eyebrow>
              </div>
              {detail.data.inbound.length === 0 ? (
                <p className="px-4 py-6 text-sm text-mute">No markets reference this one directly.</p>
              ) : (
                detail.data.inbound.map((l) => (
                  <Link
                    key={l.symbol}
                    href={`/markets/${encodeURIComponent(l.symbol)}`}
                    className="flex items-center justify-between border-b border-hairline-soft px-4 py-3 last:border-b-0 hover:bg-panel-2"
                  >
                    <span className="display text-sm font-semibold">{l.symbol}</span>
                    <span className="text-[11px] text-faint">{l.label} · {l.sign === 1 ? "same direction" : "opposite"}</span>
                  </Link>
                ))
              )}
            </Panel>
          </div>
        ) : null
      ) : (
        <p className="text-sm text-mute">Select a market in the map to explore its relationships.</p>
      )}

      <p className="text-xs text-faint">
        Relationships are historical tendencies used as supporting evidence. They are not fixed rules and can break down, particularly around
        major policy events.
      </p>
    </div>
  );
}

/** Radial relationship graph drawn as SVG — no graph library needed. */
function Graph({
  nodes, edges, focus, onFocus,
}: {
  nodes: Node[]; edges: Edge[]; focus: string | null; onFocus: (s: string) => void;
}) {
  const W = 800;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 62;

  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.symbol, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 460 }}>
      {edges.map((e, i) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const active = focus === e.from || focus === e.to;
        return (
          <line
            key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={e.sign === 1 ? "var(--color-bull)" : "var(--color-bear)"}
            strokeWidth={active ? 1.8 : 0.8}
            opacity={focus ? (active ? 0.75 : 0.1) : 0.28}
          />
        );
      })}
      {nodes.map((n) => {
        const p = pos.get(n.symbol)!;
        const bias = n.bias ?? 0;
        const color = bias > 0.15 ? "var(--color-bull)" : bias < -0.15 ? "var(--color-bear)" : "var(--color-flat)";
        const active = focus === n.symbol;
        return (
          <g key={n.symbol} onClick={() => onFocus(n.symbol)} style={{ cursor: "pointer" }}>
            <circle cx={p.x} cy={p.y} r={active ? 22 : 18} fill="var(--color-ink)" stroke={color} strokeWidth={active ? 2.4 : 1.4} />
            <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9} fill="var(--color-bone)" fontFamily="var(--font-display)" fontWeight={700}>
              {n.symbol.replace("/USD", "").slice(0, 6)}
            </text>
            <text x={p.x} y={p.y + (p.y < cy ? -28 : 34)} textAnchor="middle" fontSize={8} fill="var(--color-faint)" letterSpacing="0.1em">
              {n.name.slice(0, 18).toUpperCase()}
            </text>
          </g>
        );
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="var(--color-faint)" letterSpacing="0.2em">
        CROSS-MARKET
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={11} fill="var(--color-gold)" letterSpacing="0.2em">
        RELATIONSHIPS
      </text>
    </svg>
  );
}

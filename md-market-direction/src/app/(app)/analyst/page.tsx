"use client";

import { useEffect, useRef, useState } from "react";
import { postJson, useApi } from "@/lib/hooks";
import { Paywall } from "@/components/paywall";
import { Eyebrow, GoldButton, Panel, SectionHeading, Skeleton } from "@/components/primitives";
import { Icon } from "@/components/icons";

interface Message { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  "Why is gold bullish?",
  "What is driving the dollar today?",
  "Which markets have the strongest bullish alignment?",
  "What major events are happening today?",
  "Compare gold and Bitcoin.",
  "What's changing in the market?",
];

export default function AnalystPage() {
  const meta = useApi<{ conversations: unknown[]; aiConfigured: boolean }>("/api/ai");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [usedLlm, setUsedLlm] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  if (meta.upgrade) return <Paywall requiredTier={meta.upgrade.requiredTier} featureName="The AI Market Analyst" />;

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setError(null);
    setBusy(true);
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    try {
      const res = await postJson<{ answer: string; conversationId: string; usedLlm: boolean }>("/api/ai", {
        question, history, conversationId,
      });
      setConversationId(res.conversationId);
      setUsedLlm(res.usedLlm);
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <SectionHeading
        title="AI Market Analyst"
        subtitle="Answers are built from the structured analysis this app produced — not from memory, and never invented."
      />

      {meta.data && !meta.data.aiConfigured ? (
        <div className="border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">
          No LLM provider is configured on this instance. The analyst is answering from the same structured data using the built-in
          explanation engine. Set <code className="text-bone">ANTHROPIC_API_KEY</code> or <code className="text-bone">OPENAI_API_KEY</code> for
          conversational answers.
        </div>
      ) : null}

      <Panel className="flex min-h-[55vh] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center border border-gold/40 text-gold">
                <Icon.ai />
              </div>
              <p className="text-sm text-mute">Ask about any market in the platform.</p>
              <div className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    className="border border-hairline px-3 py-1.5 text-xs text-mute transition hover:border-gold hover:text-gold"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[90%] whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "border border-gold/30 bg-gold/10 text-bone"
                      : "border border-hairline-soft bg-ink text-bone"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {busy ? <Skeleton className="h-20" /> : null}
          {error ? <p className="text-sm text-bear">{error}</p> : null}
          <div ref={endRef} />
        </div>

        <div className="border-t border-hairline-soft p-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(input)}
              placeholder="Why is gold bullish? What is driving the dollar today?"
              className="flex-1 px-3 py-2.5 text-sm"
              disabled={busy}
            />
            <GoldButton onClick={() => ask(input)} disabled={busy || !input.trim()}>Ask</GoldButton>
          </div>
          {usedLlm !== null ? (
            <Eyebrow className="mt-2">
              {usedLlm ? "Answered by the configured LLM, grounded in live analysis data" : "Answered by the built-in explanation engine"}
            </Eyebrow>
          ) : null}
        </div>
      </Panel>

      <p className="text-xs text-faint">
        The analyst describes current conditions and directional bias. It does not predict prices, quote probabilities, or give investment advice.
      </p>
    </div>
  );
}

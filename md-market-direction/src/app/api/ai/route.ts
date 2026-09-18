import { rateLimit, requireFeature } from "@/lib/auth/guard";
import { limitsFor } from "@/lib/auth/session";
import { buildContext } from "@/lib/engine/context";
import { globalDirection, scanUniverse } from "@/lib/engine/market";
import { answerQuestion, buildAnalystContext } from "@/lib/ai/analyst";
import { llmConfigured } from "@/lib/ai/llm";
import { newId, recordUsage, store } from "@/lib/db/store";
import { fail, ok, resolveMode } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;

  const daily = limitsFor(auth.user).aiMessagesPerDay;
  const limit = rateLimit(`ai:${auth.user.id}`, daily, 24 * 60 * 60_000);
  if (!limit.ok) return fail(`You have used your ${daily} AI messages for today.`, 429);

  const body = await req.json().catch(() => null);
  const question = String(body?.question ?? "").trim().slice(0, 1000);
  if (!question) return fail("Ask a question.");

  const mode = resolveMode(body?.mode, auth.user);
  const ctx = await buildContext();
  const analyses = await scanUniverse(ctx, mode);
  const global = globalDirection(analyses);

  // If the question does not name a market, ground the answer in the user's own
  // watchlists so the answer is about markets they actually follow.
  const watchSymbols = store.read().watchlists
    .filter((w) => w.userId === auth.user.id)
    .flatMap((w) => w.symbols);

  const data = await buildAnalystContext(ctx, question, global, mode, watchSymbols);
  const history = Array.isArray(body?.history)
    ? body.history.slice(-6).map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content).slice(0, 2000),
      }))
    : [];

  const { answer, usedLlm } = await answerQuestion(question, data, history);
  recordUsage(auth.user.id, "ai-message", question.slice(0, 80));

  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : newId("cnv");
  store.write((db) => {
    let conv = db.conversations.find((c) => c.id === conversationId && c.userId === auth.user.id);
    if (!conv) {
      conv = { id: conversationId, userId: auth.user.id, title: question.slice(0, 60), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      db.conversations.push(conv);
    }
    conv.messages.push({ role: "user", content: question, at: Date.now(), grounded: true });
    conv.messages.push({ role: "assistant", content: answer, at: Date.now(), grounded: true });
    conv.updatedAt = Date.now();
    if (db.conversations.length > 300) db.conversations.splice(0, db.conversations.length - 300);
  });

  return ok({
    conversationId,
    answer,
    usedLlm,
    aiConfigured: llmConfigured(),
    symbols: data.symbols,
    demo: ctx.demo,
    remaining: limit.remaining,
  });
}

export async function GET() {
  const auth = await requireFeature();
  if ("response" in auth) return auth.response;
  const conversations = store.read().conversations
    .filter((c) => c.userId === auth.user.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);
  return ok({ conversations, aiConfigured: llmConfigured() });
}

/**
 * LLM ABSTRACTION.
 *
 * The app never depends on a specific model vendor. If no key is configured the
 * AI features fall back to the deterministic explanation engine, which answers
 * from the same structured analysis data — so the product still works, it just
 * says so plainly instead of pretending.
 *
 * Keys are read server-side only.
 */

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LlmProvider {
  id: string;
  label: string;
  complete(req: LlmRequest): Promise<string>;
}

class AnthropicProvider implements LlmProvider {
  id = "anthropic";
  label = "Anthropic";
  constructor(
    private apiKey: string,
    private model = process.env.LLM_MODEL || "claude-sonnet-5",
  ) {}

  async complete(req: LlmRequest): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 900,
        temperature: req.temperature ?? 0.2,
        system: req.system,
        messages: req.messages,
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed: HTTP ${res.status}`);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
  }
}

class OpenAiCompatibleProvider implements LlmProvider {
  id = "openai-compatible";
  label = "OpenAI-compatible endpoint";
  constructor(
    private apiKey: string,
    private baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    private model = process.env.LLM_MODEL || "gpt-4o-mini",
  ) {}

  async complete(req: LlmRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 900,
        temperature: req.temperature ?? 0.2,
        messages: [{ role: "system", content: req.system }, ...req.messages],
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed: HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  }
}

let cached: LlmProvider | null | undefined;

export function getLlm(): LlmProvider | null {
  if (cached !== undefined) return cached;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  cached = anthropic
    ? new AnthropicProvider(anthropic)
    : openai
      ? new OpenAiCompatibleProvider(openai)
      : null;
  return cached;
}

export function llmConfigured(): boolean {
  return getLlm() !== null;
}

/**
 * The house style for every AI-generated sentence in the product.
 * Deliberately strict: no predictions, no probabilities, no hype.
 */
export const HOUSE_RULES = `You are the MD Market Direction analyst.

Rules you must always follow:
- You describe CURRENT CONDITIONS and DIRECTIONAL BIAS. You never predict future prices.
- You never state or imply probabilities of an outcome. The MD Direction Score is a measure of
  how strongly the available evidence aligns, not a probability.
- You never use the words guaranteed, sure thing, risk-free, "will rise", "will fall", "100%".
- You only use the data provided to you in the CONTEXT block. If something is not in the context,
  say plainly that the data is unavailable. Never invent prices, levels, statistics or headlines.
- Write in short, plain English. A trader without a finance degree must understand it.
- Always mention what could change the picture (event risk, structure break, MA cross, macro shift).`;

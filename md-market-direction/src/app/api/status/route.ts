import { demoSources, getFallbacks, isDemoMode, providerStatus } from "@/lib/providers/registry";
import { llmConfigured } from "@/lib/ai/llm";
import { cacheStats } from "@/lib/engine/context";
import { store } from "@/lib/db/store";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    demoMode: isDemoMode(),
    demoSources: demoSources(),
    providers: providerStatus(),
    fallbacks: getFallbacks(),
    ai: { configured: llmConfigured() },
    cache: cacheStats(),
    storage: store.storageLabel,
    stripe: { configured: Boolean(process.env.STRIPE_SECRET_KEY) },
    generatedAt: Date.now(),
  });
}

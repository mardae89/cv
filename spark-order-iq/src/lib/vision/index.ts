import type { VisionProviderId } from "../types";
import { claudeVisionProvider } from "./providers/claudeVision";
import { localOcrProvider } from "./providers/localOcr";
import { manualProvider } from "./providers/manual";
import type { AnalyzeOptions, OfferExtraction, VisionProvider } from "./types";

export * from "./types";
export { parseOfferText } from "./parse";

const PROVIDERS: Record<VisionProviderId, VisionProvider> = {
  "local-ocr": localOcrProvider,
  "claude-vision": claudeVisionProvider,
  manual: manualProvider,
};

export const providerList = (): VisionProvider[] => Object.values(PROVIDERS);

export const getProvider = (id: VisionProviderId): VisionProvider => PROVIDERS[id] ?? localOcrProvider;

/**
 * The one entry point the UI uses. Swapping in a different vision model later
 * means adding a provider here — no screen has to change.
 */
export async function analyzeOfferScreenshot(
  image: Blob,
  providerId: VisionProviderId,
  options: AnalyzeOptions = {},
): Promise<OfferExtraction> {
  const provider = getProvider(providerId);
  if (!provider.ready(options.apiKey ?? "")) {
    throw new Error(`${provider.label} isn't set up yet.`);
  }
  return provider.analyze(image, options);
}

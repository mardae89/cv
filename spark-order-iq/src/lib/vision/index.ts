import type { VisionProviderId } from "../types";
import { artifactSampleProvider } from "./providers/artifactSample";
import { claudeVisionProvider } from "./providers/claudeVision";
import { localOcrProvider } from "./providers/localOcr";
import { manualProvider } from "./providers/manual";
import { getSample } from "./runtime";
import type { AnalyzeOptions, OfferExtraction, VisionProvider } from "./types";

export * from "./types";
export { parseOfferText } from "./parse";
export { getSample, maybeInClaudeViewer } from "./runtime";

const PROVIDERS: Record<Exclude<VisionProviderId, "auto">, VisionProvider> = {
  "artifact-claude": artifactSampleProvider,
  "local-ocr": localOcrProvider,
  "claude-vision": claudeVisionProvider,
  manual: manualProvider,
};

/** How long each reader gets before the app gives up and opens the form. */
const TIMEOUT_MS: Record<Exclude<VisionProviderId, "auto">, number> = {
  "artifact-claude": 180_000,
  "local-ocr": 75_000,
  "claude-vision": 120_000,
  manual: 5_000,
};

export const providerList = (): VisionProvider[] => Object.values(PROVIDERS);

export const getProvider = (id: Exclude<VisionProviderId, "auto">): VisionProvider =>
  PROVIDERS[id] ?? localOcrProvider;

/**
 * "Auto" means: let Claude read it when the app is running somewhere Claude
 * is available, otherwise read it on the device. Resolved before each read,
 * not cached in settings, so the same install behaves correctly wherever it's
 * opened from.
 */
export async function resolveProviderId(
  id: VisionProviderId,
): Promise<Exclude<VisionProviderId, "auto">> {
  if (id !== "auto") return id;
  return (await getSample()) ? "artifact-claude" : "local-ocr";
}

export async function resolveProvider(id: VisionProviderId): Promise<VisionProvider> {
  return getProvider(await resolveProviderId(id));
}

class ReaderTimeout extends Error {
  constructor(label: string) {
    super(`${label} took too long and was stopped.`);
  }
}

/**
 * The one entry point the UI uses. Swapping in a different vision model later
 * means adding a provider here — no screen has to change.
 *
 * Every read is bounded: a reader that never comes back is cut off rather than
 * leaving a driver staring at a progress bar while offers expire.
 */
export async function analyzeOfferScreenshot(
  image: Blob,
  providerId: VisionProviderId,
  options: AnalyzeOptions = {},
): Promise<OfferExtraction> {
  const resolvedId = await resolveProviderId(providerId);
  const provider = getProvider(resolvedId);
  if (!provider.ready(options.apiKey ?? "")) {
    throw new Error(`${provider.label} isn't set up yet.`);
  }

  const controller = new AbortController();
  const passthrough = options.signal;
  if (passthrough) {
    if (passthrough.aborted) controller.abort();
    else passthrough.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ReaderTimeout(provider.label));
    }, TIMEOUT_MS[resolvedId]);
  });

  try {
    return await Promise.race([provider.analyze(image, { ...options, signal: controller.signal }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

import { extractionFromReport, OFFER_PROMPT, type ReportedOffer } from "../extraction";
import { describeSampleError, getSample } from "../runtime";
import type { AnalyzeOptions, OfferExtraction, VisionProvider } from "../types";

/**
 * Claude reads the screenshot through the artifact runtime.
 *
 * No API key, no CDN download, and the most accurate of the three readers.
 * It runs on the viewer's own Claude account, so the first read asks them to
 * allow it. Only available when the page is open inside a Claude viewer.
 */
export const artifactSampleProvider: VisionProvider = {
  id: "artifact-claude",
  label: "Claude (built in)",
  description: "Claude reads the screenshot here in the app. No key needed; uses your own Claude account.",
  ready: () => true,
  async analyze(image: Blob, options: AnalyzeOptions): Promise<OfferExtraction> {
    options.onProgress?.(0.08, "Waking Claude…");
    const sample = await getSample();
    if (!sample) {
      throw new Error("Claude isn't available in this view — switch the reader in Settings.");
    }

    const limits = await sample.limits().catch(() => null);
    if (!limits?.images) {
      throw new Error("This view can't send images to Claude — switch the reader in Settings.");
    }
    if (image.size > limits.images.maxInputBytes) {
      throw new Error("That image is too large to send. Try a screenshot rather than a photo.");
    }

    options.onProgress?.(0.2, "Claude is reading the offer…");
    try {
      const reported = await sample.json<ReportedOffer>(OFFER_PROMPT, {
        images: image,
        modelTier: "default",
        signal: options.signal,
      });
      options.onProgress?.(1, "Done");
      return extractionFromReport(reported ?? {}, "artifact-claude");
    } catch (error) {
      throw new Error(describeSampleError(error));
    }
  },
};

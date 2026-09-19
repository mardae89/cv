import { parseOfferText } from "../parse";
import type { AnalyzeOptions, OfferExtraction, VisionProvider } from "../types";

/**
 * On-device OCR via tesseract.js.
 *
 * Default provider because it needs no key and the screenshot never leaves the
 * phone. The engine (wasm + English traineddata) is fetched from a CDN the
 * first time it runs, then cached by the browser.
 */
export const localOcrProvider: VisionProvider = {
  id: "local-ocr",
  label: "On-device OCR",
  description: "Reads the screenshot on your phone. No key, nothing uploaded.",
  ready: () => true,
  async analyze(image: Blob, options: AnalyzeOptions): Promise<OfferExtraction> {
    options.onProgress?.(0.05, "Loading the reader…");
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", undefined, {
      logger: (message: { status?: string; progress?: number }) => {
        if (message.status === "recognizing text") {
          options.onProgress?.(0.2 + (message.progress ?? 0) * 0.75, "Reading the offer…");
        }
      },
    });
    try {
      options.onProgress?.(0.2, "Reading the offer…");
      const { data } = await worker.recognize(image);
      const parsed = parseOfferText(data.text ?? "");
      options.onProgress?.(1, "Done");
      return { ...parsed, provider: "local-ocr" };
    } finally {
      await worker.terminate().catch(() => {});
    }
  },
};

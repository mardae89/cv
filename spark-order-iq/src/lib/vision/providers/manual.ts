import { EMPTY_EXTRACTION, type OfferExtraction, type VisionProvider } from "../types";

/** No reading at all — straight to the form. Always available as a fallback. */
export const manualProvider: VisionProvider = {
  id: "manual",
  label: "Manual entry",
  description: "Skip reading the screenshot and type the offer in yourself.",
  ready: () => true,
  async analyze(): Promise<OfferExtraction> {
    return { ...EMPTY_EXTRACTION, provider: "manual", notes: ["Manual entry — nothing was read."] };
  },
};

import { extractionFromReport, OFFER_PROMPT, type ReportedOffer } from "../extraction";
import type { AnalyzeOptions, OfferExtraction, VisionProvider } from "../types";

/**
 * Claude reads the screenshot through the Anthropic API, using a key the
 * driver supplies. For running the app somewhere the built-in Claude reader
 * isn't available (your own hosting) and you still want model accuracy.
 *
 * Opt-in only: it does send the screenshot to Anthropic, and the settings
 * screen says so plainly.
 */

const MODEL = "claude-opus-5";

async function toBase64(image: Blob): Promise<{ data: string; mediaType: string }> {
  const buffer = await image.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const mediaType = image.type && /^image\/(png|jpeg|gif|webp)$/.test(image.type) ? image.type : "image/png";
  return { data: btoa(binary), mediaType };
}

export const claudeVisionProvider: VisionProvider = {
  id: "claude-vision",
  label: "Claude via API key",
  description: "Sends the screenshot to Anthropic using your own API key. For self-hosted copies of the app.",
  ready: (apiKey: string) => apiKey.trim().length > 0,
  async analyze(image: Blob, options: AnalyzeOptions): Promise<OfferExtraction> {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) throw new Error("Add your Anthropic API key in Settings to use this reader.");

    options.onProgress?.(0.1, "Preparing the screenshot…");
    const { data, mediaType } = await toBase64(image);

    options.onProgress?.(0.35, "Asking Claude…");
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType as "image/png", data } },
              { type: "text", text: OFFER_PROMPT },
            ],
          },
        ],
      },
      { signal: options.signal },
    );

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    // Tolerant parse: the whole reply, a fenced block, or the outermost object.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    let reported: ReportedOffer;
    try {
      reported = JSON.parse(body) as ReportedOffer;
    } catch {
      throw new Error("Claude's answer came back unreadable.");
    }

    options.onProgress?.(1, "Done");
    return extractionFromReport(reported, "claude-vision");
  },
};

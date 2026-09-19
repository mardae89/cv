import { EMPTY_EXTRACTION, type AnalyzeOptions, type OfferExtraction, type VisionProvider } from "../types";
import type { PickupType } from "../../types";

/**
 * Optional cloud provider: Claude reads the screenshot directly.
 *
 * Opt-in only. It needs the driver's own Anthropic API key, and it does send
 * the screenshot to Anthropic — the settings screen says so plainly. The
 * default provider stays on-device.
 */

const MODEL = "claude-opus-5";

const OFFER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    payout: { type: ["number", "null"], description: "Total offer payout in dollars." },
    offerMiles: { type: ["number", "null"], description: "Miles shown on the offer itself." },
    estimatedMinutes: { type: ["number", "null"], description: "Estimated trip time in minutes." },
    orders: { type: ["integer", "null"] },
    stops: { type: ["integer", "null"] },
    items: { type: ["integer", "null"] },
    pickupType: { type: ["string", "null"], enum: ["Walmart", "Sam's Club", null] },
    storeLabel: { type: ["string", "null"], description: "Store name and number if visible." },
    shopping: { type: ["boolean", "null"], description: "True only if the offer is marked shop-and-deliver." },
    heavyItems: { type: ["boolean", "null"], description: "True only if heavy or bulky is indicated." },
    confidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        payout: { type: ["number", "null"] },
        offerMiles: { type: ["number", "null"] },
        estimatedMinutes: { type: ["number", "null"] },
        items: { type: ["number", "null"] },
      },
      required: ["payout", "offerMiles", "estimatedMinutes", "items"],
    },
  },
  required: [
    "payout",
    "offerMiles",
    "estimatedMinutes",
    "orders",
    "stops",
    "items",
    "pickupType",
    "storeLabel",
    "shopping",
    "heavyItems",
    "confidence",
  ],
} as const;

const SYSTEM = [
  "You read a single screenshot of a delivery offer and report only what is visibly printed on it.",
  "Never infer, estimate, or fill in a value that is not legible in the image — return null for it instead.",
  "Do not report the driver's distance to the store; that is not on the offer.",
  "Confidence values are 0 to 1 and describe how clearly you could read that field.",
].join(" ");

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

interface ReportedOffer {
  payout: number | null;
  offerMiles: number | null;
  estimatedMinutes: number | null;
  orders: number | null;
  stops: number | null;
  items: number | null;
  pickupType: string | null;
  storeLabel: string | null;
  shopping: boolean | null;
  heavyItems: boolean | null;
  confidence: Record<string, number | null>;
}

const numberOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const claudeVisionProvider: VisionProvider = {
  id: "claude-vision",
  label: "Claude vision",
  description: "Sends the screenshot to Anthropic using your own API key. More accurate, not private.",
  ready: (apiKey: string) => apiKey.trim().length > 0,
  async analyze(image: Blob, options: AnalyzeOptions): Promise<OfferExtraction> {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) throw new Error("Add your Anthropic API key in Settings to use Claude vision.");

    options.onProgress?.(0.1, "Preparing the screenshot…");
    const { data, mediaType } = await toBase64(image);

    options.onProgress?.(0.35, "Asking Claude…");
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    type AnthropicTool = import("@anthropic-ai/sdk").Anthropic.Tool;
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        output_config: { effort: "low" },
        system: SYSTEM,
        tools: [
          {
            name: "report_offer",
            description: "Report the offer details visible in the screenshot.",
            strict: true,
            input_schema: OFFER_SCHEMA as unknown as AnthropicTool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: "report_offer" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType as "image/png", data } },
              { type: "text", text: "Report every offer field you can read. Use null for anything not clearly visible." },
            ],
          },
        ],
      },
      { signal: options.signal },
    );

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("Claude couldn't read this offer. Enter the details by hand.");
    }
    const reported = block.input as ReportedOffer;
    const conf = reported.confidence ?? {};
    const pickupType: PickupType | null =
      reported.pickupType === "Walmart" || reported.pickupType === "Sam's Club" ? reported.pickupType : null;

    options.onProgress?.(1, "Done");
    return {
      ...EMPTY_EXTRACTION,
      payout: numberOrNull(reported.payout),
      offerMiles: numberOrNull(reported.offerMiles),
      estimatedMinutes: numberOrNull(reported.estimatedMinutes),
      orders: numberOrNull(reported.orders),
      stops: numberOrNull(reported.stops),
      items: numberOrNull(reported.items),
      pickupType,
      storeLabel: typeof reported.storeLabel === "string" ? reported.storeLabel : null,
      shopping: typeof reported.shopping === "boolean" ? reported.shopping : null,
      heavyItems: typeof reported.heavyItems === "boolean" ? reported.heavyItems : null,
      confidence: {
        ...(numberOrNull(conf.payout) !== null ? { payout: conf.payout as number } : {}),
        ...(numberOrNull(conf.offerMiles) !== null ? { offerMiles: conf.offerMiles as number } : {}),
        ...(numberOrNull(conf.estimatedMinutes) !== null ? { estimatedMinutes: conf.estimatedMinutes as number } : {}),
        ...(numberOrNull(conf.items) !== null ? { items: conf.items as number } : {}),
      },
      provider: "claude-vision",
      rawText: null,
      notes: [],
    };
  },
};

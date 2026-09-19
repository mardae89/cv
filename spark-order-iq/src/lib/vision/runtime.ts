/**
 * Bridge to the Claude runtime that a published artifact page is given.
 *
 * When the app runs inside a Claude viewer, `window.claude` is there before
 * any page script does, and the `sample` capability can read an image. That
 * means the best screenshot reader needs no API key and no CDN download.
 * Everywhere else this resolves to null and the app falls back to on-device
 * OCR, exactly as before.
 */

export interface SampleImageLimits {
  maxCount: number;
  maxInputBytes: number;
  mediaTypes: string[];
}

export interface SampleLimits {
  maxPromptBytes: number;
  images?: SampleImageLimits;
}

export interface SampleOptions {
  images?: Blob | Blob[];
  modelTier?: "quick" | "default" | "complex";
  signal?: AbortSignal;
  onText?: (update: { text: string; delta: string }) => void;
  cache?: boolean;
}

export interface SampleFn {
  (input: string, options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json: <T>(input: string, options?: SampleOptions) => Promise<T>;
  limits: () => Promise<SampleLimits>;
}

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

let pending: Promise<SampleFn | null> | null = null;

/** Cheap synchronous hint, before `use()` has had its say. */
export function maybeInClaudeViewer(): boolean {
  return typeof window !== "undefined" && typeof window.claude?.use === "function";
}

/**
 * Resolves the `sample` capability, or null when this view can't run it.
 * Memoised: the answer takes up to ten seconds, so the app asks at startup
 * and the reply is waiting by the time a screenshot arrives.
 */
export function getSample(): Promise<SampleFn | null> {
  if (pending) return pending;
  pending = (async () => {
    if (!maybeInClaudeViewer()) return null;
    try {
      const resolved = await window.claude!.use("sample");
      return typeof resolved === "function" ? (resolved as SampleFn) : null;
    } catch {
      return null;
    }
  })();
  return pending;
}

/** Turns a rejected sample call into something worth showing a driver. */
export function describeSampleError(error: unknown): string {
  const code = (error as SampleError | null)?.code;
  switch (code) {
    case "not_granted":
      return "You'd need to allow this page to use Claude. Enter the offer by hand, or switch the reader in Settings.";
    case "rate_limited":
      return "Claude is rate-limited right now. Wait a moment, or enter the offer by hand.";
    case "images_unavailable":
      return "This view can't send images to Claude.";
    case "image_rejected":
      return "Claude couldn't open that image. Try a normal screenshot (PNG or JPEG).";
    case "session_expired":
      return "Your Claude session expired. Sign in again, or enter the offer by hand.";
    case "invalid_json":
      return "Claude's answer came back unreadable.";
    case "cancelled":
      return "Reading cancelled.";
    case "sampling_disabled":
    case "not_declared":
    case "capability_disabled":
    case "capability_removed":
      return "Claude isn't available in this view.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Claude couldn't read this one.";
  }
}

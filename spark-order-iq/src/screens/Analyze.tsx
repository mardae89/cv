import { useEffect, useMemo, useRef, useState } from "react";
import type { EarningsSeed } from "../components/AddEarningsSheet";
import { Header } from "../components/Header";
import { PickupDistance } from "../components/PickupDistance";
import { ResultView } from "../components/ResultView";
import { Banner, Button, Card, Field, NumberInput, ProgressBar, SectionLabel, Toggle } from "../components/ui";
import { SAMPLE_OFFERS } from "../lib/demo";
import { evaluateOrder, type Evaluation, type EvaluationInput } from "../lib/scoring";
import type { DailyProgress, OfferDraft } from "../lib/types";
import {
  analyzeOfferScreenshot,
  needsConfirmation,
  resolveProvider,
  toDraft,
  type ExtractField,
  type OfferExtraction,
  type VisionProvider,
} from "../lib/vision";
import { useStore } from "../state/store";

type Step = "capture" | "reading" | "confirm" | "result";

const emptyDraft = (pickupType: OfferDraft["pickupType"]): OfferDraft => ({
  payout: null,
  offerMiles: null,
  estimatedMinutes: null,
  orders: null,
  stops: null,
  items: null,
  pickupType,
  storeLabel: null,
  shopping: false,
  heavyItems: false,
  pickupDistanceMiles: null,
});

export function Analyze({
  progress,
  seed,
  onSeedConsumed,
  onLogOrder,
  onOpenSettings,
}: {
  progress: DailyProgress;
  seed: OfferDraft | null;
  onSeedConsumed: () => void;
  onLogOrder: (seed: EarningsSeed) => void;
  onOpenSettings: () => void;
}) {
  const { settings } = useStore();
  const [step, setStep] = useState<Step>("capture");
  const [draft, setDraft] = useState<OfferDraft>(() => emptyDraft(settings.defaultPickupType));
  const [extraction, setExtraction] = useState<OfferExtraction | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<ExtractField[]>([]);
  const [readProgress, setReadProgress] = useState({ fraction: 0, label: "" });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [showText, setShowText] = useState(false);
  const [provider, setProvider] = useState<VisionProvider | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Guards against a slow read landing after the driver has moved on.
  const runRef = useRef(0);

  // A screenshot only ever lives in memory, and only until it's been read.
  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  useEffect(() => {
    if (!seed) return;
    setDraft(seed);
    setExtraction(null);
    setUnconfirmed([]);
    setError(null);
    setStep("confirm");
    onSeedConsumed();
  }, [seed, onSeedConsumed]);

  // Which reader actually runs depends on where the app is open, so ask
  // rather than assume — and ask early, so it's known before a file arrives.
  useEffect(() => {
    let live = true;
    void resolveProvider(settings.visionProvider).then((resolved) => {
      if (live) setProvider(resolved);
    });
    return () => {
      live = false;
    };
  }, [settings.visionProvider]);

  // A visible clock on the reading step: silence for 30 seconds with no sense
  // of progress is what makes an app feel broken.
  useEffect(() => {
    if (step !== "reading") return;
    setElapsed(0);
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [step]);

  const dropScreenshot = () => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const cancelRead = () => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (!settings.keepScreenshots) dropScreenshot();
    setStep("confirm");
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    const run = ++runRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setEvaluation(null);
    dropScreenshot();
    const url = URL.createObjectURL(file);
    setPreview(url);
    setStep("reading");
    setReadProgress({ fraction: 0.02, label: "Starting…" });

    try {
      const result = await analyzeOfferScreenshot(file, settings.visionProvider, {
        apiKey: settings.anthropicApiKey,
        signal: controller.signal,
        onProgress: (fraction, label) => {
          if (runRef.current === run) setReadProgress({ fraction, label });
        },
      });
      if (runRef.current !== run) return;
      setExtraction(result);
      setUnconfirmed(needsConfirmation(result));
      setDraft((current) => ({
        ...toDraft(result, settings.defaultPickupType),
        // Keep a pickup distance the driver already entered this session.
        pickupDistanceMiles: current.pickupDistanceMiles,
      }));
      if (result.payout === null && result.offerMiles === null) {
        setError("Nothing legible came back from this image. Fill the numbers in below and analyze anyway.");
      }
    } catch (e) {
      if (runRef.current !== run) return;
      setExtraction(null);
      setUnconfirmed([]);
      // Reading is a convenience, never a gate: fall through to the form.
      setError(
        e instanceof Error && e.message
          ? e.message
          : "The reader couldn't start. The first read needs a connection — after that it works offline.",
      );
    } finally {
      if (runRef.current === run) {
        abortRef.current = null;
        if (!settings.keepScreenshots) dropScreenshot();
        setStep("confirm");
      }
    }
  };

  const ready = draft.payout !== null && draft.payout > 0 && draft.offerMiles !== null && draft.pickupDistanceMiles !== null;

  const runAnalysis = () => {
    if (!ready) return;
    const input: EvaluationInput = {
      payout: draft.payout!,
      offerMiles: draft.offerMiles!,
      pickupDistanceMiles: draft.pickupDistanceMiles!,
      estimatedMinutes: draft.estimatedMinutes,
      items: draft.items,
      orders: draft.orders,
      stops: draft.stops,
      shopping: draft.shopping,
      heavyItems: draft.heavyItems,
      pickupType: draft.pickupType,
    };
    setEvaluation(evaluateOrder(input, settings, progress));
    setStep("result");
    window.scrollTo({ top: 0, behavior: settings.reducedMotion ? "auto" : "smooth" });
  };

  const restart = () => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    dropScreenshot();
    setDraft(emptyDraft(settings.defaultPickupType));
    setExtraction(null);
    setUnconfirmed([]);
    setEvaluation(null);
    setError(null);
    setStep("capture");
  };

  const flag = (field: ExtractField) => unconfirmed.includes(field) && extraction !== null;

  const subtitle = useMemo(() => {
    if (step === "capture") return "Upload an offer screenshot";
    if (step === "reading") return "Reading the screenshot";
    if (step === "confirm") return "Confirm the details";
    return "Your decision";
  }, [step]);

  return (
    <div className="anim-rise pb-6">
      <Header title="ANALYZE ORDER" subtitle={subtitle} />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {step === "capture" ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="w-full rounded-card border-2 border-dashed border-gold/50 bg-gold/5 px-6 py-12 text-center active:bg-gold/10"
          >
            <div className="text-4xl">📸</div>
            <div className="mt-3 text-lg font-black tracking-wide text-gold">UPLOAD OFFER SCREENSHOT</div>
            <div className="mt-1 text-xs text-mute">From your photos or files</div>
          </button>

          <Button variant="secondary" size="md" full onClick={() => cameraRef.current?.click()}>
            📷 TAKE A PHOTO INSTEAD
          </Button>
          <Button
            variant="ghost"
            size="md"
            full
            onClick={() => {
              setExtraction(null);
              setUnconfirmed([]);
              setError(null);
              setStep("confirm");
            }}
          >
            Enter the offer by hand
          </Button>

          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="label">Reader</div>
                <div className="mt-1 text-sm font-semibold">{provider?.label ?? "Checking…"}</div>
                <p className="mt-1 text-xs text-mute">{provider?.description ?? "Working out the best reader for this device."}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={onOpenSettings}>
                Change
              </Button>
            </div>
          </Card>

          <div>
            <SectionLabel>Try it with sample data</SectionLabel>
            <div className="space-y-2">
              {SAMPLE_OFFERS.map((sample) => (
                <Card
                  key={sample.name}
                  onClick={() => {
                    setDraft(sample.draft);
                    setExtraction(null);
                    setUnconfirmed([]);
                    setError(null);
                    setStep("confirm");
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{sample.name}</div>
                      <div className="mt-0.5 text-xs text-mute">{sample.expectation}</div>
                    </div>
                    <div className="tnum shrink-0 text-right">
                      <div className="font-bold text-gold">${sample.draft.payout?.toFixed(2)}</div>
                      <div className="text-xs text-mute">{sample.draft.offerMiles} mi</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <p className="mt-2 px-1 text-xs text-mute">Sample offers — not real Spark data.</p>
          </div>

          <Banner tone="info">
            Spark Order IQ only reads what you upload. It never connects to Spark, and it never accepts or declines an offer
            for you.
          </Banner>
        </div>
      ) : null}

      {step === "reading" ? (
        <div className="space-y-4">
          {preview ? (
            <div className="relative overflow-hidden rounded-card border border-line">
              <img src={preview} alt="Offer screenshot" className="max-h-64 w-full object-contain bg-ink" />
            </div>
          ) : null}
          <Card className="anim-sweep relative overflow-hidden">
            <div className="flex items-baseline justify-between">
              <span className="label">{readProgress.label || "Reading…"}</span>
              <span className="tnum text-xs text-mute">{elapsed}s</span>
            </div>
            <div className="mt-3">
              <ProgressBar percent={readProgress.fraction * 100} />
            </div>
            <p className="mt-3 text-xs text-mute">
              {provider?.id === "artifact-claude"
                ? "Claude is looking at the screenshot. This usually takes 5–30 seconds."
                : provider?.id === "local-ocr"
                  ? "Running on your phone. The first read downloads the reader, which needs a connection."
                  : "Sending the screenshot to your configured reader."}
            </p>
          </Card>
          <Button size="md" variant="secondary" full onClick={cancelRead}>
            SKIP THIS — ENTER IT BY HAND
          </Button>
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className="space-y-4">
          {error ? (
            <Banner tone="warn" title="Couldn't confidently read this offer">
              {error} Enter the details by hand — everything else still works.
            </Banner>
          ) : null}

          {extraction && !error ? (
            <Banner tone={unconfirmed.length ? "warn" : "info"}>
              {unconfirmed.length
                ? `Read with ${provider?.label ?? "the reader"}. ${unconfirmed.length} field${unconfirmed.length > 1 ? "s need" : " needs"} confirmation.`
                : `Read with ${provider?.label ?? "the reader"}. Check the numbers before analyzing.`}
            </Banner>
          ) : null}

          {preview ? (
            <div className="space-y-2">
              <img src={preview} alt="Offer screenshot" className="max-h-56 w-full rounded-card border border-line object-contain bg-ink" />
              <Button size="sm" variant="ghost" full onClick={dropScreenshot}>
                Delete screenshot
              </Button>
            </div>
          ) : extraction ? (
            <p className="px-1 text-xs text-mute">Screenshot discarded after reading. Only the numbers below were kept.</p>
          ) : null}

          <Card>
            <SectionLabel>Offer details</SectionLabel>
            <div className="space-y-3">
              <Field label="Pay" right={flag("payout") ? <NeedsConfirmation /> : null}>
                <NumberInput
                  value={draft.payout}
                  onValueChange={(payout) => setDraft((d) => ({ ...d, payout }))}
                  prefix="$"
                  placeholder="0.00"
                  step="0.01"
                  invalid={draft.payout !== null && draft.payout <= 0}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Offer miles" right={flag("offerMiles") ? <NeedsConfirmation /> : null}>
                  <NumberInput
                    value={draft.offerMiles}
                    onValueChange={(offerMiles) => setDraft((d) => ({ ...d, offerMiles }))}
                    suffix="mi"
                    placeholder="0.0"
                    step="0.1"
                  />
                </Field>
                <Field label="Est. time" right={flag("estimatedMinutes") ? <NeedsConfirmation /> : null}>
                  <NumberInput
                    value={draft.estimatedMinutes}
                    onValueChange={(estimatedMinutes) => setDraft((d) => ({ ...d, estimatedMinutes }))}
                    suffix="min"
                    placeholder="—"
                    step="1"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Orders">
                  <NumberInput value={draft.orders} onValueChange={(orders) => setDraft((d) => ({ ...d, orders }))} placeholder="—" step="1" />
                </Field>
                <Field label="Stops">
                  <NumberInput value={draft.stops} onValueChange={(stops) => setDraft((d) => ({ ...d, stops }))} placeholder="—" step="1" />
                </Field>
                <Field label="Items">
                  <NumberInput value={draft.items} onValueChange={(items) => setDraft((d) => ({ ...d, items }))} placeholder="—" step="1" />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-line bg-panel-2 px-4 py-3">
                <span className="text-sm font-semibold">Shop &amp; deliver</span>
                <Toggle checked={draft.shopping} onChange={(shopping) => setDraft((d) => ({ ...d, shopping }))} label="Shop and deliver" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-line bg-panel-2 px-4 py-3">
                <span className="text-sm font-semibold">Heavy or bulky</span>
                <Toggle checked={draft.heavyItems} onChange={(heavyItems) => setDraft((d) => ({ ...d, heavyItems }))} label="Heavy or bulky" />
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel>Pickup distance</SectionLabel>
            <PickupDistance
              pickupType={draft.pickupType}
              onPickupTypeChange={(pickupType) => setDraft((d) => ({ ...d, pickupType }))}
              miles={draft.pickupDistanceMiles}
              onMilesChange={(pickupDistanceMiles) => setDraft((d) => ({ ...d, pickupDistanceMiles }))}
              storeLabel={draft.storeLabel}
              onStoreLabelChange={(storeLabel) => setDraft((d) => ({ ...d, storeLabel }))}
            />
          </Card>

          {draft.offerMiles !== null && draft.pickupDistanceMiles !== null ? (
            <Card>
              <div className="flex items-end justify-between">
                <div>
                  <div className="label">Est. total driving miles</div>
                  <div className="tnum mt-1 text-3xl font-black text-gold">
                    {(draft.offerMiles + draft.pickupDistanceMiles).toFixed(1)}
                  </div>
                </div>
                <div className="tnum text-right text-xs text-mute">
                  {draft.offerMiles.toFixed(1)} offer
                  <br />+ {draft.pickupDistanceMiles.toFixed(1)} pickup
                </div>
              </div>
              <p className="mt-2 text-xs text-mute">An estimate — not measured GPS mileage.</p>
            </Card>
          ) : null}

          {extraction?.rawText ? (
            <div>
              <Button size="sm" variant="ghost" full onClick={() => setShowText((v) => !v)}>
                {showText ? "Hide what was read" : "Show what was read"}
              </Button>
              {showText ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-line bg-panel-2 p-3 text-[11px] leading-relaxed text-mute whitespace-pre-wrap">
                  {extraction.rawText}
                </pre>
              ) : null}
            </div>
          ) : null}

          {extraction?.notes.length ? (
            <Banner tone="info">
              <ul className="space-y-1">
                {extraction.notes.map((note, i) => (
                  <li key={i}>• {note}</li>
                ))}
              </ul>
            </Banner>
          ) : null}

          <div className="space-y-2">
            <Button size="lg" full onClick={runAnalysis} disabled={!ready}>
              ANALYZE
            </Button>
            {!ready ? (
              <p className="text-center text-xs text-mute">Pay, offer miles and pickup distance are needed to score an offer.</p>
            ) : null}
            <Button size="sm" variant="ghost" full onClick={restart}>
              Start over
            </Button>
          </div>
        </div>
      ) : null}

      {step === "result" && evaluation ? (
        <ResultView
          evaluation={evaluation}
          draft={draft}
          onEdit={() => setStep("confirm")}
          onAnalyzeAnother={restart}
          onLog={() =>
            onLogOrder({
              payout: draft.payout,
              miles: Number((evaluation.economics.totalMiles).toFixed(1)),
              minutes: evaluation.economics.totalMinutes === null ? null : Math.round(evaluation.economics.totalMinutes),
              store: draft.pickupType,
              storeLabel: draft.storeLabel,
              type: draft.shopping ? "Shopping" : "Delivery",
              decision: evaluation.decision,
              score: evaluation.score,
            })
          }
        />
      ) : null}
    </div>
  );
}

function NeedsConfirmation() {
  return <span className="rounded-full bg-consider/15 px-2 py-0.5 text-[10px] font-bold text-consider">NEEDS CONFIRMATION</span>;
}

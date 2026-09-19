import { useState } from "react";
import { drivingMilesEstimate, geolocationAvailable, getCurrentPosition, parseCoords, ROAD_FACTOR } from "../lib/geo";
import { newId } from "../lib/storage";
import type { PickupType, SavedStore } from "../lib/types";
import { useStore } from "../state/store";
import { Banner, Button, Field, NumberInput, Segmented, Sheet, TextInput } from "./ui";

/**
 * The deadhead leg. The driver types the distance, or picks a store they saved
 * themselves and lets the browser measure from their current position.
 *
 * No store list is fetched from anywhere, and nothing here reads from Spark.
 */
export function PickupDistance({
  pickupType,
  onPickupTypeChange,
  miles,
  onMilesChange,
  storeLabel,
  onStoreLabelChange,
}: {
  pickupType: PickupType;
  onPickupTypeChange: (type: PickupType) => void;
  miles: number | null;
  onMilesChange: (miles: number | null) => void;
  storeLabel: string | null;
  onStoreLabelChange: (label: string | null) => void;
}) {
  const { settings, updateSettings } = useStore();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newStore, setNewStore] = useState({ label: "", coords: "" });
  const [busy, setBusy] = useState(false);

  const stores = settings.savedStores;

  const measureTo = async (store: SavedStore) => {
    setError(null);
    setBusy(true);
    setStatus("Getting your location…");
    try {
      const me = await getCurrentPosition();
      const estimate = drivingMilesEstimate(me, { lat: store.lat, lon: store.lon });
      onMilesChange(Number(estimate.toFixed(1)));
      onStoreLabelChange(store.label);
      onPickupTypeChange(store.type);
      setStatus(`About ${estimate.toFixed(1)} mi to ${store.label} — straight line × ${ROAD_FACTOR}. Adjust if you know better.`);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Couldn't get a location fix.");
    } finally {
      setBusy(false);
    }
  };

  const saveStore = async (useCurrent: boolean) => {
    setError(null);
    const label = newStore.label.trim() || `${pickupType} store`;
    try {
      setBusy(true);
      const coords = useCurrent ? await getCurrentPosition() : parseCoords(newStore.coords);
      if (!coords) {
        setError("Paste coordinates as latitude, longitude — e.g. 36.1699, -115.1398.");
        return;
      }
      const store: SavedStore = { id: newId(), label, type: pickupType, lat: coords.lat, lon: coords.lon };
      updateSettings({ savedStores: [...stores, store] });
      setAddOpen(false);
      setNewStore({ label: "", coords: "" });
      onStoreLabelChange(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that location.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Pickup location">
        <Segmented
          value={pickupType}
          onChange={(type) => onPickupTypeChange(type)}
          options={[
            { value: "Walmart" as PickupType, label: "Walmart" },
            { value: "Sam's Club" as PickupType, label: "Sam's Club" },
          ]}
        />
      </Field>

      <Field label="Distance from me" hint="Your drive to the store. This is added to the offer's miles.">
        <NumberInput value={miles} onValueChange={onMilesChange} suffix="miles" placeholder="0.0" step="0.1" />
      </Field>

      {storeLabel ? (
        <div className="flex items-center justify-between rounded-xl border border-line bg-panel-2 px-4 py-2.5 text-sm">
          <span className="truncate">{storeLabel}</span>
          <button type="button" className="text-mute text-xs font-semibold" onClick={() => onStoreLabelChange(null)}>
            Clear
          </button>
        </div>
      ) : null}

      {geolocationAvailable() ? (
        <div>
          <div className="label mb-2">Use my current location</div>
          {stores.length === 0 ? (
            <Button variant="secondary" size="md" full onClick={() => setAddOpen(true)}>
              📍 SAVE A STORE TO MEASURE FROM
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stores.map((store) => (
                <button
                  key={store.id}
                  type="button"
                  disabled={busy}
                  onClick={() => measureTo(store)}
                  className="rounded-full border border-line bg-panel-2 px-4 py-2 text-sm font-semibold active:border-gold disabled:opacity-50"
                >
                  📍 {store.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="rounded-full border border-dashed border-line px-4 py-2 text-sm font-semibold text-mute"
              >
                + Store
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-mute">This device doesn't offer location access — enter the distance by hand.</p>
      )}

      {status ? <Banner tone="info">{status}</Banner> : null}
      {error ? <Banner tone="warn">{error}</Banner> : null}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Save a pickup location">
        <div className="space-y-4">
          <Field label="Name">
            <TextInput
              value={newStore.label}
              onValueChange={(label) => setNewStore((s) => ({ ...s, label }))}
              placeholder={`${pickupType} #1234`}
            />
          </Field>
          <Button variant="secondary" full disabled={busy} onClick={() => saveStore(true)}>
            📍 USE MY CURRENT LOCATION
          </Button>
          <p className="text-center text-xs text-mute">Handy while you're sitting in the lot.</p>
          <Field label="Or paste coordinates" hint="Long-press the store in your maps app and copy its coordinates.">
            <TextInput
              value={newStore.coords}
              onValueChange={(coords) => setNewStore((s) => ({ ...s, coords }))}
              placeholder="36.1699, -115.1398"
            />
          </Field>
          <Button full disabled={busy} onClick={() => saveStore(false)}>
            SAVE STORE
          </Button>
          {error ? <Banner tone="warn">{error}</Banner> : null}
        </div>
      </Sheet>
    </div>
  );
}

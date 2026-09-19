/**
 * Distance helpers for the pickup leg.
 *
 * The driver supplies the pickup location — by typing the distance, or by
 * dropping a pin for a store they choose. Nothing here talks to Spark, and no
 * store list is scraped from anywhere.
 */

export interface Coords {
  lat: number;
  lon: number;
}

const EARTH_MILES = 3958.7613;

/** Great-circle distance in miles. */
export function haversineMiles(a: Coords, b: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line distance understates real driving. This is the usual rule of
 * thumb for surface streets — still an estimate, and labelled as one.
 */
export const ROAD_FACTOR = 1.25;

export function drivingMilesEstimate(a: Coords, b: Coords): number {
  return haversineMiles(a, b) * ROAD_FACTOR;
}

export function geolocationAvailable(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function getCurrentPosition(timeoutMs = 10_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!geolocationAvailable()) {
      reject(new Error("This device doesn't offer location access."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied. Enter the distance by hand."
              : "Couldn't get a location fix. Enter the distance by hand.",
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Accepts "34.05, -118.25" or "34.05 -118.25". */
export function parseCoords(text: string): Coords | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

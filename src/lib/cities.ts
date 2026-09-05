import raw from "./cities.json";

export type City = {
  name: string;
  countryCode: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
};

type Row = [string, string, number, number, number];

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryName(code: string) {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** ~11k settlements over 50 000 people, sorted largest first. */
export const cities: City[] = (raw as Row[]).map(([name, cc, lat, lon, pop]) => ({
  name,
  countryCode: cc,
  country: countryName(cc),
  lat,
  lon,
  population: pop,
}));

const R_KM = 6371.0088;

/** Great-circle distance in kilometres. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Compass bearing from a → b, as a 16-point label. */
export function bearingLabel(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180;
  const y = Math.sin((bLon - aLon) * rad) * Math.cos(bLat * rad);
  const x =
    Math.cos(aLat * rad) * Math.sin(bLat * rad) -
    Math.sin(aLat * rad) * Math.cos(bLat * rad) * Math.cos((bLon - aLon) * rad);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  const points = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return points[Math.round(deg / 22.5) % 16]!;
}

export type NearestCity = { city: City; distanceKm: number; bearing: string };

/** The closest populated place to a point, with distance and direction. */
export function nearestCity(lat: number, lon: number): NearestCity | null {
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of cities) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return null;
  return {
    city: best,
    distanceKm: bestD,
    bearing: bearingLabel(lat, lon, best.lat, best.lon),
  };
}

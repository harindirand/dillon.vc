import * as Astro from "astronomy-engine";
import catalogData from "./nasa-eclipse-catalog.json";
import {
  besselianElements,
  centralPoint,
  localCentralPhase,
  umbralLimit,
  penumbralDepth,
  geodetic,
  surfaceVector,
  elementWindow,
  bearingBetween,
  geodesicKm,
  destinationOn,
  toFundamental,
  add,
  dot,
  len,
  scale,
  sub,
  unit,
  KM_PER_AU,
  EARTH_EQUATORIAL_KM,
  type BesselianElements,
  type Vec3,
} from "./besselian";

export type EclipseKind = "total" | "annular" | "partial" | "hybrid";

export type PathPoint = {
  lat: number;
  lon: number;
  /** northern limit of the umbral/antumbral shadow at this instant */
  north?: { lat: number; lon: number } | undefined;
  /** southern limit */
  south?: { lat: number; lon: number } | undefined;
  /** distance between the two limits, km (0 when the limits can't be resolved) */
  widthKm: number;
  time: Date;
};

export type Eclipse = {
  id: string;
  kind: EclipseKind;
  peak: Date;
  /** eclipse magnitude at greatest eclipse: moon/sun apparent diameter ratio */
  magnitude: number | undefined;
  /** greatest-eclipse point, undefined for purely partial (polar) eclipses */
  lat?: number | undefined;
  lon?: number | undefined;
  /** central line of totality/annularity, empty for partial eclipses */
  path: PathPoint[];
  /** duration of totality/annularity at greatest eclipse, seconds */
  durationSeconds?: number | undefined;
  /** path width at greatest eclipse, km */
  pathWidthKm?: number | undefined;
  saros?: number | undefined;
  gamma?: number | undefined;
  /** where the headline numbers came from */
  source: "nasa" | "computed";
};

const EARTH_RADIUS_KM = 6371.0088;
const EARTH_RADIUS_AU = EARTH_RADIUS_KM / KM_PER_AU;

// ---------------------------------------------------------------------------
// NASA Five Millennium Catalog of Solar Eclipses (authoritative headline data)
// ---------------------------------------------------------------------------

export type CatalogEntry = {
  peak: string;
  type: string;
  typeRaw: string;
  saros: number;
  gamma: number;
  magnitude: number;
  lat: number;
  lon: number;
  sunAlt: number;
  pathWidthKm?: number;
  centralDurationSeconds?: number;
};

/**
 * Espenak & Meeus, "Five Millennium Catalog of Solar Eclipses" (NASA GSFC
 * TP-2006-214141), sliced to 1900-2100. Times are UT (catalog TD minus DT).
 * Regenerate with scripts/build-nasa-catalog.py.
 */
export const nasaCatalog = catalogData as CatalogEntry[];

const catalogByTime = nasaCatalog
  .map((e) => ({ entry: e, ms: Date.parse(e.peak) }))
  .sort((a, b) => a.ms - b.ms);

/** NASA catalog entry whose greatest eclipse is within 20 minutes of `date`. */
export function catalogEntryFor(date: Date): CatalogEntry | undefined {
  const target = date.getTime();
  let best: { entry: CatalogEntry; ms: number } | undefined;
  for (const c of catalogByTime) {
    const diff = Math.abs(c.ms - target);
    if (diff < 20 * 60_000 && (!best || diff < Math.abs(best.ms - target))) best = c;
    if (c.ms - target > 24 * 3600_000) break;
  }
  return best?.entry;
}

function kindFromCatalog(type: string): EclipseKind {
  switch (type) {
    case "T":
      return "total";
    case "A":
      return "annular";
    case "H":
      return "hybrid";
    default:
      return "partial";
  }
}

function normalizeKind(kind: Astro.EclipseKind): EclipseKind {
  switch (kind) {
    case Astro.EclipseKind.Total:
      return "total";
    case Astro.EclipseKind.Annular:
      return "annular";
    default:
      return "partial";
  }
}

// ---------------------------------------------------------------------------
// Path geometry, straight from the Besselian elements
// ---------------------------------------------------------------------------

/**
 * The limit curves are the envelope of the moving shadow, so each cross-track
 * solve considers a window of instants around the sample time rather than a
 * single frozen footprint.
 */
const ENVELOPE_SPAN_MIN = 14;
const ENVELOPE_STEP_SEC = 30;

/** Direction of travel of the shadow at an instant, degrees from north. */
function shadowBearing(time: Astro.AstroTime): number | null {
  const a = centralPoint(besselianElements(time.AddDays(-0.5 / 1440)));
  const b = centralPoint(besselianElements(time.AddDays(0.5 / 1440)));
  if (!a || !b) return null;
  return bearingBetween(a.lat, a.lon, b.lat, b.lon);
}

/**
 * One point of the central line together with the northern and southern limits
 * of totality/annularity there. The limits are found by solving the Besselian
 * shadow condition on the ellipsoid across the track, so the resulting ribbon is
 * the real footprint — including the strong widening where the shadow strikes at
 * a shallow angle near the sunrise/sunset ends of the track.
 *
 * `window` is the slice of elements whose shadow footprints can reach this part
 * of the track; the limits are the envelope of those footprints.
 */
function pathPointAt(time: Astro.AstroTime, window: BesselianElements[]): PathPoint | null {
  const centre = centralPoint(besselianElements(time));
  if (!centre) return null;
  const brg = shadowBearing(time);
  const point: PathPoint = { lat: centre.lat, lon: centre.lon, widthKm: 0, time: time.date };
  if (brg == null) return point;

  // the limits lie across the direction of travel; which side is "north"
  // depends on the track heading, so name them by resulting latitude
  const s1 = umbralLimit(window, centre, brg - 90);
  const s2 = umbralLimit(window, centre, brg + 90);
  if (!s1 || !s2) return point;
  const north = s1.lat >= s2.lat ? s1 : s2;
  const south = s1.lat >= s2.lat ? s2 : s1;
  point.north = north;
  point.south = south;
  point.widthKm = geodesicKm(north.lat, north.lon, south.lat, south.lon);
  return point;
}

function centralPath(peak: Astro.AstroTime): PathPoint[] {
  const points: PathPoint[] = [];
  const stepMinutes = 2;
  const spanMinutes = 330; // sunrise limb to sunset limb

  // One element table for the whole event, sampled finely enough to trace the
  // shadow envelope; each path point reads the slice around its own instant.
  const table = elementWindow(peak, spanMinutes + ENVELOPE_SPAN_MIN, ENVELOPE_STEP_SEC);
  const perMinute = 60 / ENVELOPE_STEP_SEC;
  const halfWindow = Math.round(ENVELOPE_SPAN_MIN * perMinute);

  for (let dm = -spanMinutes; dm <= spanMinutes; dm += stepMinutes) {
    const centreIndex = Math.round((dm + spanMinutes + ENVELOPE_SPAN_MIN) * perMinute);
    const window = table.slice(
      Math.max(0, centreIndex - halfWindow),
      Math.min(table.length, centreIndex + halfWindow + 1),
    );
    const p = pathPointAt(peak.AddDays(dm / 1440), window);
    if (p) points.push(p);
  }
  return points;
}

/**
 * Width of the path at greatest eclipse and the duration of the central phase
 * there, both computed for the exact instant of greatest eclipse rather than
 * interpolated from the drawn path.
 */
function greatestEclipseGeometry(peak: Astro.AstroTime): {
  lat: number;
  lon: number;
  widthKm?: number;
  durationSeconds?: number;
  magnitude?: number;
} | null {
  const el = besselianElements(peak);
  const centre = centralPoint(el);
  if (!centre) return null;
  const out: {
    lat: number;
    lon: number;
    widthKm?: number;
    durationSeconds?: number;
    magnitude?: number;
  } = { lat: centre.lat, lon: centre.lon };

  const brg = shadowBearing(peak);
  if (brg != null) {
    const window = elementWindow(peak, ENVELOPE_SPAN_MIN, ENVELOPE_STEP_SEC);
    const s1 = umbralLimit(window, centre, brg - 90);
    const s2 = umbralLimit(window, centre, brg + 90);
    if (s1 && s2) out.widthKm = geodesicKm(s1.lat, s1.lon, s2.lat, s2.lon);
  }

  // real local circumstances: duration = C3 - C2 at the greatest-eclipse site
  const phase = localCentralPhase(peak, centre.lat, centre.lon);
  if (phase) {
    out.durationSeconds = phase.durationSeconds;
    out.magnitude = phase.magnitude;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geodesy helpers (kept for the globe renderer and city lookups)
// ---------------------------------------------------------------------------

export const haversineKm = geodesicKm;
export const bearing = bearingBetween;
export function destination(lat: number, lon: number, bearingDeg: number, distKm: number) {
  return destinationOn(lat, lon, bearingDeg, distKm);
}

/**
 * The spot on Earth's surface that comes closest to the moon's shadow axis at a
 * given instant — where the sun is most covered. For total/annular events this
 * sits on the central line; for a partial eclipse, where the umbra misses the
 * globe entirely, it is the point of maximum obscuration on the ground.
 */
export function deepestSurfacePoint(date: Date): { lat: number; lon: number } | null {
  try {
    const time = Astro.MakeTime(date);
    const el = besselianElements(time);
    const axis = scale(el.basis.k, -1);
    const m = el.moon;
    // foot of the perpendicular from the Earth's centre onto the shadow axis
    const closest = add(m, scale(axis, -dot(m, axis)));
    const dir = len(closest) > 1e-12 ? unit(closest) : unit(scale(axis, -1));
    return geodetic(time, scale(dir, EARTH_RADIUS_AU));
  } catch {
    return null;
  }
}

/** Compute the next `count` solar eclipses starting from `from`. */
export function upcomingSolarEclipses(from: Date, count: number): Eclipse[] {
  const out: Eclipse[] = [];
  let info = Astro.SearchGlobalSolarEclipse(from);

  while (out.length < count) {
    out.push(buildEclipse(info));
    info = Astro.NextGlobalSolarEclipse(info.peak);
  }

  return out;
}

/**
 * Assemble one eclipse. Headline statistics come from the NASA catalog when the
 * event is covered by it; the drawn path is always computed from the Besselian
 * elements, and computed values fill in outside the catalog's range.
 */
export function buildEclipse(info: Astro.GlobalSolarEclipseInfo): Eclipse {
  const entry = catalogEntryFor(info.peak.date);
  const peak = entry ? Astro.MakeTime(new Date(entry.peak)) : info.peak;
  const kind = entry ? kindFromCatalog(entry.type) : normalizeKind(info.kind);

  const path = kind === "partial" ? [] : centralPath(peak);
  const geom = kind === "partial" ? null : greatestEclipseGeometry(peak);

  const focus =
    geom ??
    (info.latitude != null && info.longitude != null
      ? { lat: info.latitude, lon: info.longitude }
      : deepestSurfacePoint(peak.date));

  return {
    id: peak.date.toISOString(),
    kind,
    peak: peak.date,
    magnitude: entry?.magnitude ?? geom?.magnitude ?? info.obscuration,
    lat: focus?.lat ?? entry?.lat,
    lon: focus?.lon ?? entry?.lon,
    path,
    durationSeconds: entry?.centralDurationSeconds ?? geom?.durationSeconds,
    pathWidthKm: entry?.pathWidthKm ?? geom?.widthKm,
    saros: entry?.saros,
    gamma: entry?.gamma,
    source: entry ? "nasa" : "computed",
  };
}

/**
 * Totality band polygon (northern limit out, southern limit back) for a d3 geo
 * Polygon. Built from the calculated limit curves, not from an offset ribbon.
 */
export function bandPolygon(path: PathPoint[]): [number, number][] | null {
  const usable = path.filter((p) => p.north && p.south);
  if (usable.length < 3) return null;
  const north: [number, number][] = usable.map((p) => [p.north!.lon, p.north!.lat]);
  const south: [number, number][] = usable.map((p) => [p.south!.lon, p.south!.lat]);
  const ring = [...north, ...south.reverse()];
  ring.push(ring[0]!);
  return ring;
}

/**
 * Outline of the penumbral footprint at a given instant: the region of the
 * globe where at least a sliver of the sun is covered. This is what a partial
 * eclipse has instead of a totality band.
 */
export function penumbraRegion(date: Date): [number, number][] | null {
  try {
    const time = Astro.MakeTime(date);
    const el: BesselianElements = besselianElements(time);
    const axis = scale(el.basis.k, -1);
    const m = el.moon;

    const closest = add(m, scale(axis, -dot(m, axis)));
    const centreDir = len(closest) > 1e-12 ? unit(closest) : unit(scale(axis, -1));

    const depth = (u: Vec3) => penumbralDepth(el, scale(u, EARTH_RADIUS_AU));
    if (depth(centreDir) < 0) return null; // penumbra misses the globe

    // orthonormal basis perpendicular to the centre direction
    const helper: Vec3 = Math.abs(centreDir.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    const e1 = unit(sub(helper, scale(centreDir, dot(helper, centreDir))));
    const e2 = {
      x: centreDir.y * e1.z - centreDir.z * e1.y,
      y: centreDir.z * e1.x - centreDir.x * e1.z,
      z: centreDir.x * e1.y - centreDir.y * e1.x,
    };
    const at = (alpha: number, beta: number): Vec3 =>
      unit(
        add(
          scale(centreDir, Math.cos(alpha)),
          scale(add(scale(e1, Math.cos(beta)), scale(e2, Math.sin(beta))), Math.sin(alpha)),
        ),
      );

    const ring: [number, number][] = [];
    const steps = 96;
    for (let i = 0; i < steps; i++) {
      const beta = (i / steps) * 2 * Math.PI;
      let lo = 0;
      let hi = Math.PI / 2;
      if (depth(at(hi, beta)) >= 0) {
        lo = hi;
      } else {
        for (let k = 0; k < 30; k++) {
          const mid = (lo + hi) / 2;
          if (depth(at(mid, beta)) >= 0) lo = mid;
          else hi = mid;
        }
      }
      const u = at(lo, beta);
      const p = geodetic(time, scale(u, EARTH_RADIUS_AU));
      if (!p) return null;
      ring.push([p.lon, p.lat]);
    }
    ring.push(ring[0]!);
    return ring;
  } catch {
    return null;
  }
}

export function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/** Sub-solar point (where the sun is directly overhead) at a given instant. */
export function subsolarPoint(date: Date): { lat: number; lon: number } | null {
  try {
    const time = Astro.MakeTime(date);
    const el = besselianElements(time);
    return geodetic(time, scale(unit(el.sun), EARTH_RADIUS_AU));
  } catch {
    return null;
  }
}

/**
 * Lightweight summaries (no path sampling) of the next `count` solar eclipses.
 * Cheap enough to run during SSR/head rendering for structured data.
 */
export function upcomingEclipseSummaries(
  from: Date,
  count: number,
): { kind: EclipseKind; peak: Date; lat?: number | undefined; lon?: number | undefined }[] {
  const out: { kind: EclipseKind; peak: Date; lat?: number | undefined; lon?: number | undefined }[] =
    [];
  let info = Astro.SearchGlobalSolarEclipse(from);

  while (out.length < count) {
    const entry = catalogEntryFor(info.peak.date);
    out.push({
      kind: entry ? kindFromCatalog(entry.type) : normalizeKind(info.kind),
      peak: entry ? new Date(entry.peak) : info.peak.date,
      lat: info.latitude ?? entry?.lat ?? undefined,
      lon: info.longitude ?? entry?.lon ?? undefined,
    });
    info = Astro.NextGlobalSolarEclipse(info.peak);
  }

  return out;
}

/** Exposed for tests: Besselian elements and fundamental-plane conversion. */
export { besselianElements, toFundamental, surfaceVector, localCentralPhase, EARTH_EQUATORIAL_KM };

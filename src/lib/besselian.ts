/**
 * Standard Besselian solar-eclipse geometry.
 *
 * The Besselian method describes an eclipse in a "fundamental plane": the plane
 * through the Earth's centre perpendicular to the Moon's shadow axis. In that
 * frame the shadow cones are circles whose radii vary linearly with height, so
 * the umbral/antumbral limits on the Earth's surface, and the local contact
 * times, follow from a small set of elements (x, y, d, mu, l1, l2, tan f1,
 * tan f2) rather than from ad-hoc projections.
 *
 * Ephemerides come from astronomy-engine (VSOP87/ELP-based), the same source
 * used for eclipse discovery. Element and contact conventions follow the
 * Explanatory Supplement to the Astronomical Almanac / Meeus, "Elements of
 * Solar Eclipses", and are validated against NASA GSFC's Five Millennium
 * Catalog values in src/lib/eclipse.test.ts.
 */
import * as Astro from "astronomy-engine";

export const KM_PER_AU = 149597870.7;
export const SUN_RADIUS_KM = 696000;
/** Mean lunar radius, k = 0.2725076 Earth equatorial radii (IAU / NASA canon). */
export const MOON_RADIUS_KM = 1738.0;
export const EARTH_EQUATORIAL_KM = 6378.1366;
export const EARTH_POLAR_KM = 6356.7519;
/** First eccentricity squared of the WGS-84/IAU reference ellipsoid. */
export const EARTH_E2 = 1 - (EARTH_POLAR_KM * EARTH_POLAR_KM) / (EARTH_EQUATORIAL_KM * EARTH_EQUATORIAL_KM);
const EARTH_EQ_AU = EARTH_EQUATORIAL_KM / KM_PER_AU;
const DEG = Math.PI / 180;

export type Vec3 = { x: number; y: number; z: number };

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const unit = (a: Vec3): Vec3 => scale(a, 1 / len(a));
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/**
 * Besselian elements at one instant. Lengths are in Earth equatorial radii,
 * angles in degrees. `basis` carries the fundamental-plane axes so surface
 * points can be transformed into (xi, eta, zeta) without recomputing them.
 */
export type BesselianElements = {
  time: Astro.AstroTime;
  /** shadow-axis position on the fundamental plane */
  x: number;
  y: number;
  /** declination and ephemeris hour angle of the shadow axis, degrees */
  d: number;
  mu: number;
  /** Greenwich apparent sidereal time, degrees */
  gastDeg: number;
  /** penumbral and umbral shadow radii on the fundamental plane */
  l1: number;
  l2: number;
  tanF1: number;
  tanF2: number;
  /** Moon's height above the fundamental plane, Earth radii */
  zMoon: number;
  basis: { i: Vec3; j: Vec3; k: Vec3 };
  moon: Vec3;
  sun: Vec3;
};

function geoVectors(time: Astro.AstroTime): { sun: Vec3; moon: Vec3 } {
  const rot = Astro.Rotation_EQJ_EQD(time);
  const s = Astro.RotateVector(rot, Astro.GeoVector(Astro.Body.Sun, time, true));
  const m = Astro.RotateVector(rot, Astro.GeoMoon(time));
  return { sun: { x: s.x, y: s.y, z: s.z }, moon: { x: m.x, y: m.y, z: m.z } };
}

/** Compute the Besselian elements for an instant. */
export function besselianElements(time: Astro.AstroTime): BesselianElements {
  const { sun, moon } = geoVectors(time);

  // fundamental-plane z axis points from the Moon towards the Sun; the shadow
  // axis runs along -k, so surface points on the sunlit side have zeta > 0.
  const k = unit(sub(sun, moon));
  const d = Math.asin(k.z) / DEG;
  const alpha = Math.atan2(k.y, k.x);
  const i: Vec3 = { x: -Math.sin(alpha), y: Math.cos(alpha), z: 0 };
  const j = cross(k, i);

  const toRadii = KM_PER_AU / EARTH_EQUATORIAL_KM;
  const mR = scale(moon, toRadii);
  const x = dot(mR, i);
  const y = dot(mR, j);
  const zMoon = dot(mR, k);

  const kSun = SUN_RADIUS_KM / EARTH_EQUATORIAL_KM;
  const kMoon = MOON_RADIUS_KM / EARTH_EQUATORIAL_KM;
  const distSunMoon = len(sub(sun, moon)) * toRadii;
  // half-angles of the penumbral (diverging) and umbral (converging) cones
  const tanF1 = (kSun + kMoon) / distSunMoon;
  const tanF2 = (kSun - kMoon) / distSunMoon;
  // cone cross-sections where the axis crosses the fundamental plane
  const l1 = kMoon + zMoon * tanF1;
  const l2 = kMoon - zMoon * tanF2; // negative => antumbra (annular)

  const gast = Astro.SiderealTime(time); // hours, Greenwich apparent sidereal time
  const mu = normalizeDeg(gast * 15 - (alpha / DEG));

  return { time, x, y, d, mu, gastDeg: gast * 15, l1, l2, tanF1, tanF2, zMoon, basis: { i, j, k }, moon, sun };
}

function normalizeDeg(v: number) {
  return ((v % 360) + 360) % 360;
}

/** Geocentric equatorial-of-date position of a point on the ellipsoid, in AU. */
export function surfaceVector(time: Astro.AstroTime, lat: number, lon: number): Vec3 {
  const phi = lat * DEG;
  const gast = Astro.SiderealTime(time) * 15; // degrees
  const theta = (gast + lon) * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const n = EARTH_EQ_AU / Math.sqrt(1 - EARTH_E2 * sinPhi * sinPhi);
  return {
    x: n * cosPhi * Math.cos(theta),
    y: n * cosPhi * Math.sin(theta),
    z: n * (1 - EARTH_E2) * sinPhi,
  };
}

/** Convert a geocentric vector (AU) into fundamental-plane coords, Earth radii. */
export function toFundamental(el: BesselianElements, v: Vec3): { xi: number; eta: number; zeta: number } {
  const r = scale(v, KM_PER_AU / EARTH_EQUATORIAL_KM);
  return { xi: dot(r, el.basis.i), eta: dot(r, el.basis.j), zeta: dot(r, el.basis.k) };
}

/**
 * Signed shadow depth for a point, in Earth radii: positive inside the umbral
 * (or antumbral) shadow, negative outside. Uses the standard Besselian shadow
 * radius at the point's height above the fundamental plane.
 */
export function umbralDepth(el: BesselianElements, v: Vec3): number {
  const { xi, eta, zeta } = toFundamental(el, v);
  const dist = Math.hypot(xi - el.x, eta - el.y);
  const radius = Math.abs(el.l2 + zeta * el.tanF2);
  return radius - dist;
}

/** Same for the penumbra: positive where at least part of the Sun is hidden. */
export function penumbralDepth(el: BesselianElements, v: Vec3): number {
  const { xi, eta, zeta } = toFundamental(el, v);
  const dist = Math.hypot(xi - el.x, eta - el.y);
  const radius = Math.abs(el.l1 - zeta * el.tanF1);
  return radius - dist;
}

/**
 * Where the shadow axis meets the ellipsoid, i.e. the point on the central
 * line at this instant. Solved directly on the ellipsoid (no spherical
 * approximation). Returns null when the axis misses the Earth.
 */
export function centralPoint(el: BesselianElements): { lat: number; lon: number } | null {
  const axis = scale(el.basis.k, -1); // direction of travel of the shadow
  const m = el.moon;
  // squash z so the ellipsoid becomes a sphere of equatorial radius
  const f = Math.sqrt(1 - EARTH_E2);
  const mE: Vec3 = { x: m.x, y: m.y, z: m.z / f };
  const aE: Vec3 = { x: axis.x, y: axis.y, z: axis.z / f };
  const qa = dot(aE, aE);
  const qb = dot(mE, aE);
  const qc = dot(mE, mE) - EARTH_EQ_AU * EARTH_EQ_AU;
  const disc = qb * qb - qa * qc;
  if (disc <= 0) return null;
  const t = (-qb - Math.sqrt(disc)) / qa;
  if (t <= 0) return null;
  const p = add(m, scale(axis, t));
  return geodetic(el.time, p);
}

/** Geocentric vector (AU, equatorial of date) -> geodetic latitude/longitude. */
export function geodetic(time: Astro.AstroTime, v: Vec3): { lat: number; lon: number } | null {
  const xKm = v.x * KM_PER_AU;
  const yKm = v.y * KM_PER_AU;
  const zKm = v.z * KM_PER_AU;
  const p = Math.hypot(xKm, yKm);
  if (!isFinite(p)) return null;
  // Bowring/iterative geodetic latitude from geocentric coordinates
  let lat = Math.atan2(zKm, p * (1 - EARTH_E2));
  for (let n = 0; n < 8; n++) {
    const sinLat = Math.sin(lat);
    const nRad = EARTH_EQUATORIAL_KM / Math.sqrt(1 - EARTH_E2 * sinLat * sinLat);
    lat = Math.atan2(zKm + nRad * EARTH_E2 * sinLat, p);
  }
  const gast = Astro.SiderealTime(time) * 15;
  const lon = normalizeDeg(Math.atan2(yKm, xKm) / DEG - gast + 180) - 180;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return { lat: lat / DEG, lon };
}

// ---------------------------------------------------------------------------
// Local circumstances (contact times)
// ---------------------------------------------------------------------------

type Topo = { sep: number; rSun: number; rMoon: number };

/** Topocentric apparent angular radii and centre separation, in radians. */
export function topocentric(time: Astro.AstroTime, lat: number, lon: number): Topo {
  const { sun, moon } = geoVectors(time);
  const obs = surfaceVector(time, lat, lon);
  const s = sub(sun, obs);
  const m = sub(moon, obs);
  const ds = len(s);
  const dm = len(m);
  const cosSep = Math.min(1, Math.max(-1, dot(s, m) / (ds * dm)));
  return {
    sep: Math.acos(cosSep),
    rSun: Math.asin(Math.min(1, SUN_RADIUS_KM / (ds * KM_PER_AU))),
    rMoon: Math.asin(Math.min(1, MOON_RADIUS_KM / (dm * KM_PER_AU))),
  };
}

/**
 * Central-phase local circumstances at a fixed site: second contact (C2), third
 * contact (C3), the instant of maximum eclipse, and the eclipse magnitude
 * there. Contacts are the roots of sep(t) = |rMoon - rSun|, i.e. internal
 * tangency of the discs — the same condition for a total eclipse (Moon larger)
 * and an annular one (Sun larger).
 */
export function localCentralPhase(
  around: Astro.AstroTime,
  lat: number,
  lon: number,
  searchMinutes = 40,
): { c2: Date; c3: Date; durationSeconds: number; max: Date; magnitude: number; annular: boolean } | null {
  const f = (t: Astro.AstroTime) => {
    const c = topocentric(t, lat, lon);
    return Math.abs(c.rMoon - c.rSun) - c.sep; // > 0 inside the central phase
  };

  // locate the deepest moment on a coarse grid, then refine
  let best = around;
  let bestVal = -Infinity;
  const coarse = 0.25; // minutes
  for (let dm = -searchMinutes; dm <= searchMinutes; dm += coarse) {
    const t = around.AddDays(dm / 1440);
    const v = f(t);
    if (v > bestVal) {
      bestVal = v;
      best = t;
    }
  }
  // golden-ish refinement of the maximum
  let lo = best.AddDays(-coarse / 1440);
  let hi = best.AddDays(coarse / 1440);
  for (let n = 0; n < 40; n++) {
    const a = lo.AddDays((hi.ut - lo.ut) / 3);
    const b = lo.AddDays((2 * (hi.ut - lo.ut)) / 3);
    if (f(a) > f(b)) hi = b;
    else lo = a;
  }
  const max = lo.AddDays((hi.ut - lo.ut) / 2);
  const atMax = topocentric(max, lat, lon);
  const annular = atMax.rSun > atMax.rMoon;
  const magnitude =
    atMax.sep <= Math.abs(atMax.rMoon - atMax.rSun)
      ? atMax.rMoon / atMax.rSun
      : Math.max(0, (atMax.rSun + atMax.rMoon - atMax.sep) / (2 * atMax.rSun));

  if (f(max) <= 0) return null; // site never reaches totality/annularity

  const bisect = (a: Astro.AstroTime, b: Astro.AstroTime) => {
    // f(a) < 0 < f(b)
    let x = a;
    let y = b;
    for (let n = 0; n < 60; n++) {
      const mid = x.AddDays((y.ut - x.ut) / 2);
      if (f(mid) > 0) y = mid;
      else x = mid;
    }
    return x.AddDays((y.ut - x.ut) / 2);
  };

  const edge = (dir: -1 | 1) => {
    let outside: Astro.AstroTime | null = null;
    for (let dm = coarse; dm <= searchMinutes; dm += coarse) {
      const t = max.AddDays((dir * dm) / 1440);
      if (f(t) <= 0) {
        outside = t;
        break;
      }
    }
    if (!outside) return null;
    return dir < 0 ? bisect(outside, max) : bisect(outside, max);
  };

  const e1 = edge(-1);
  const e2 = edge(1);
  if (!e1 || !e2) return null;
  const c2 = e1.ut < e2.ut ? e1 : e2;
  const c3 = e1.ut < e2.ut ? e2 : e1;
  return {
    c2: c2.date,
    c3: c3.date,
    durationSeconds: (c3.ut - c2.ut) * 86400,
    max: max.date,
    magnitude,
    annular,
  };
}

// ---------------------------------------------------------------------------
// Northern / southern limits of the central path
// ---------------------------------------------------------------------------

const R_MEAN_KM = 6371.0088;

/** Great-circle offset on a sphere; adequate for stepping across a shadow. */
export function destinationOn(lat: number, lon: number, bearingDeg: number, distKm: number) {
  const d = distKm / R_MEAN_KM;
  const br = bearingDeg * DEG;
  const p1 = lat * DEG;
  const l1 = lon * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 =
    l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / DEG, lon: normalizeDeg(l2 / DEG + 180) - 180 };
}

export function geodesicKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MEAN_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dl = (lon2 - lon1) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.atan2(y, x) / DEG;
}

/**
 * How deeply a site ever falls inside the umbral/antumbral shadow, maximised
 * over a window of instants around `el`. Positive means the site experiences
 * totality (or annularity) at some moment: this is the condition that defines
 * the northern and southern limit curves of the path, which are the envelope of
 * the moving shadow rather than a single instantaneous cross-section. That
 * distinction matters most for high-latitude eclipses, where the footprint is a
 * long ellipse inclined to the direction of travel.
 */
export function envelopeDepth(
  elements: BesselianElements[],
  lat: number,
  lon: number,
): number {
  // Body-fixed geometry of the site is constant; only Earth's rotation angle
  // changes between samples, so hoist the ellipsoid maths out of the loop.
  const phi = lat * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const n = EARTH_EQ_AU / Math.sqrt(1 - EARTH_E2 * sinPhi * sinPhi);
  const rXY = n * cosPhi;
  const z = n * (1 - EARTH_E2) * sinPhi;

  let best = -Infinity;
  for (const el of elements) {
    const theta = (el.gastDeg + lon) * DEG;
    const d = umbralDepth(el, {
      x: rXY * Math.cos(theta),
      y: rXY * Math.sin(theta),
      z,
    });
    if (d > best) best = d;
  }
  return best;
}

/** Elements sampled every `stepSeconds` over +/- `spanMinutes` around a time. */
export function elementWindow(
  centreTime: Astro.AstroTime,
  spanMinutes: number,
  stepSeconds: number,
): BesselianElements[] {
  const out: BesselianElements[] = [];
  for (let s = -spanMinutes * 60; s <= spanMinutes * 60; s += stepSeconds) {
    out.push(besselianElements(centreTime.AddDays(s / 86400)));
  }
  return out;
}

/**
 * The limit of totality/annularity on one side of the central line: walk
 * outwards across the track until the shadow envelope no longer reaches the
 * ground, then bisect. No width inflation, floors, or caps are applied.
 */
export function umbralLimit(
  elements: BesselianElements[],
  centre: { lat: number; lon: number },
  bearingDeg: number,
  maxKm = 5000,
): { lat: number; lon: number } | null {
  const depthAt = (km: number) => {
    const p = destinationOn(centre.lat, centre.lon, bearingDeg, km);
    return envelopeDepth(elements, p.lat, p.lon);
  };
  if (depthAt(0) < 0) return null;

  let inside = 0;
  let outside = -1;
  let step = 5;
  let km = step;
  while (km <= maxKm) {
    if (depthAt(km) < 0) {
      outside = km;
      break;
    }
    inside = km;
    step = Math.min(step * 1.35, 200);
    km += step;
  }
  if (outside < 0) return null;

  for (let n = 0; n < 32; n++) {
    const mid = (inside + outside) / 2;
    if (depthAt(mid) >= 0) inside = mid;
    else outside = mid;
  }
  return destinationOn(centre.lat, centre.lon, bearingDeg, (inside + outside) / 2);
}

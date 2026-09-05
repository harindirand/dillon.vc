import { describe, expect, it } from "vitest";
import * as Astro from "astronomy-engine";
import {
  besselianElements,
  elementWindow,
  centralPoint,
  localCentralPhase,
  umbralLimit,
  geodesicKm,
  bearingBetween,
} from "./besselian";
import { catalogEntryFor, upcomingSolarEclipses, type Eclipse } from "./eclipse";

/**
 * Fixtures are NASA GSFC values from the Five Millennium Catalog of Solar
 * Eclipses (Espenak & Meeus). Times are UT of greatest eclipse.
 *
 * These tests deliberately exercise the *computed* Besselian geometry, not the
 * bundled catalog numbers, so a regression in the maths fails the suite.
 */
type Fixture = {
  label: string;
  peakUT: string;
  kind: "total" | "annular";
  lat: number;
  lon: number;
  widthKm: number;
  durationSeconds: number;
  magnitude: number;
};

const FIXTURES: Fixture[] = [
  {
    label: "2027-08-02 total (low latitude, very long duration)",
    peakUT: "2027-08-02T10:06:34Z",
    kind: "total",
    lat: 25.5,
    lon: 33.2,
    widthKm: 258,
    durationSeconds: 383,
    magnitude: 1.079,
  },
  {
    label: "2033-03-30 total (high latitude, grazing shadow)",
    peakUT: "2033-03-30T18:01:16Z",
    kind: "total",
    lat: 71.3,
    lon: -155.8,
    widthKm: 781,
    durationSeconds: 157,
    magnitude: 1.0462,
  },
  {
    label: "2024-04-08 total (North America)",
    peakUT: "2024-04-08T18:17:15Z",
    kind: "total",
    lat: 25.3,
    lon: -104.1,
    widthKm: 198,
    durationSeconds: 268,
    magnitude: 1.0566,
  },
  {
    label: "2027-02-06 annular (southern hemisphere)",
    peakUT: "2027-02-06T15:59:32Z",
    kind: "annular",
    lat: -31.3,
    lon: -48.5,
    widthKm: 282,
    durationSeconds: 471,
    magnitude: 0.9281,
  },
  {
    label: "2028-01-26 annular (long ring phase)",
    peakUT: "2028-01-26T15:07:43Z",
    kind: "annular",
    lat: 3.0,
    lon: -51.5,
    widthKm: 323,
    durationSeconds: 627,
    magnitude: 0.9208,
  },
];

function computeAtGreatest(peakUT: string) {
  const time = Astro.MakeTime(new Date(peakUT));
  const el = besselianElements(time);
  const centre = centralPoint(el);
  if (!centre) throw new Error("shadow axis missed the Earth at greatest eclipse");
  const a = centralPoint(besselianElements(time.AddDays(-0.5 / 1440)))!;
  const b = centralPoint(besselianElements(time.AddDays(0.5 / 1440)))!;
  const brg = bearingBetween(a.lat, a.lon, b.lat, b.lon);
  const window = elementWindow(time, 14, 30);
  const n = umbralLimit(window, centre, brg - 90);
  const s = umbralLimit(window, centre, brg + 90);
  if (!n || !s) throw new Error("could not resolve umbral limits");
  const phase = localCentralPhase(time, centre.lat, centre.lon);
  if (!phase) throw new Error("no central phase at greatest eclipse");
  return {
    centre,
    north: n,
    south: s,
    widthKm: geodesicKm(n.lat, n.lon, s.lat, s.lon),
    phase,
  };
}

describe("Besselian eclipse geometry vs NASA Five Millennium Catalog", () => {
  for (const f of FIXTURES) {
    describe(f.label, () => {
      const got = computeAtGreatest(f.peakUT);

      it("places greatest eclipse at the catalogued coordinates", () => {
        // The catalog quotes the greatest-eclipse time to the second and the
        // position to 0.1 degree, and the shadow centre can travel several km
        // per second, so compare as a ground distance rather than in degrees.
        const offsetKm = geodesicKm(got.centre.lat, got.centre.lon, f.lat, f.lon);
        expect(
          offsetKm,
          `centre ${got.centre.lat.toFixed(2)},${got.centre.lon.toFixed(2)} vs NASA ${f.lat},${f.lon}`,
        ).toBeLessThan(20);
      });

      it("reproduces the path width at greatest eclipse", () => {
        expect(got.widthKm).toBeGreaterThan(0);
        const err = Math.abs(got.widthKm - f.widthKm) / f.widthKm;
        expect(err, `computed ${got.widthKm.toFixed(0)} km vs NASA ${f.widthKm} km`).toBeLessThan(
          0.06,
        );
      });

      it("reproduces the central duration from C2/C3 contacts", () => {
        const d = got.phase.durationSeconds;
        expect(d).toBeCloseTo((got.phase.c3.getTime() - got.phase.c2.getTime()) / 1000, 2);
        const err = Math.abs(d - f.durationSeconds);
        expect(
          err,
          `computed ${d.toFixed(0)}s vs NASA ${f.durationSeconds}s`,
        ).toBeLessThan(Math.max(6, f.durationSeconds * 0.02));
      });

      it("reproduces the eclipse magnitude and type", () => {
        expect(Math.abs(got.phase.magnitude - f.magnitude)).toBeLessThan(0.005);
        expect(got.phase.annular).toBe(f.kind === "annular");
      });

      it("orders the limits north of south with the centre line between them", () => {
        const half = f.widthKm / 2;
        const toNorth = geodesicKm(got.centre.lat, got.centre.lon, got.north.lat, got.north.lon);
        const toSouth = geodesicKm(got.centre.lat, got.centre.lon, got.south.lat, got.south.lon);
        expect(got.north.lat).toBeGreaterThan(got.south.lat);
        expect(toNorth).toBeGreaterThan(half * 0.3);
        expect(toSouth).toBeGreaterThan(half * 0.3);
      });
    });
  }
});

describe("2033-03-30 regression", () => {
  const got = computeAtGreatest("2033-03-30T18:01:16Z");

  it("does not report the old ~4m49s duration", () => {
    expect(got.phase.durationSeconds).toBeLessThan(200);
    expect(got.phase.durationSeconds).toBeGreaterThan(120);
  });

  it("does not report the old ~285 km clamped width", () => {
    // NASA: 781 km. The grazing shadow makes the path far wider than the
    // perpendicular cone cross-section.
    expect(got.widthKm).toBeGreaterThan(600);
  });
});

describe("headline statistics come from the authoritative catalog", () => {
  const eclipses = upcomingSolarEclipses(new Date("2027-01-01T00:00:00Z"), 4);
  const byDay = (iso: string): Eclipse => {
    const found = eclipses.find((e) => e.peak.toISOString().slice(0, 10) === iso);
    if (!found) throw new Error(`no eclipse computed for ${iso}`);
    return found;
  };

  it("matches NASA for the 2027 total eclipse", () => {
    const e = byDay("2027-08-02");
    expect(e.source).toBe("nasa");
    expect(e.kind).toBe("total");
    expect(e.durationSeconds).toBe(383);
    expect(e.pathWidthKm).toBe(258);
    expect(e.magnitude).toBeCloseTo(1.079, 4);
    expect(e.saros).toBe(136);
    expect(Math.abs(e.peak.getTime() - Date.parse("2027-08-02T10:06:34Z"))).toBeLessThan(1000);
  });

  it("matches NASA for the 2027 annular eclipse", () => {
    const e = byDay("2027-02-06");
    expect(e.kind).toBe("annular");
    expect(e.durationSeconds).toBe(471);
    expect(e.pathWidthKm).toBe(282);
  });

  it("draws a band from real limit curves", () => {
    const e = byDay("2027-08-02");
    expect(e.path.length).toBeGreaterThan(50);
    const withLimits = e.path.filter((p) => p.north && p.south);
    expect(withLimits.length).toBeGreaterThan(40);
    // widths grow towards the ends of the track (shallow shadow incidence)
    const mid = withLimits[Math.floor(withLimits.length / 2)]!;
    expect(mid.widthKm).toBeGreaterThan(200);
    expect(mid.widthKm).toBeLessThan(320);
  });

  it("keeps partial eclipses free of a totality band", () => {
    const partial = upcomingSolarEclipses(new Date("2025-03-01T00:00:00Z"), 1)[0]!;
    expect(partial.kind).toBe("partial");
    expect(partial.path).toHaveLength(0);
    expect(partial.magnitude).toBeCloseTo(0.9376, 4);
  });
});

describe("catalog lookup", () => {
  it("finds the entry near a greatest-eclipse time", () => {
    expect(catalogEntryFor(new Date("2033-03-30T18:05:00Z"))?.pathWidthKm).toBe(781);
  });

  it("returns nothing far from an eclipse", () => {
    expect(catalogEntryFor(new Date("2033-06-01T00:00:00Z"))).toBeUndefined();
  });
});

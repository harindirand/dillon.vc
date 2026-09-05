import { useEffect, useMemo, useRef, useState } from "react";
import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoCircle,
  geoDistance,
  geoContains,
} from "d3-geo";
import { feature, mesh } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import countriesTopo from "world-atlas/countries-50m.json";
import type { Topology, GeometryCollection } from "topojson-specification";
import { bandPolygon, penumbraRegion, subsolarPoint, type Eclipse } from "@/lib/eclipse";
import { cities, distanceKm, type City } from "@/lib/cities";
import { skyPoints } from "@/lib/stars";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


const land = feature(
  landTopo as unknown as Topology,
  (landTopo as unknown as Topology).objects["land"] as GeometryCollection,
);

const countriesTopology = countriesTopo as unknown as Topology;
const countries = feature(
  countriesTopology,
  countriesTopology.objects["countries"] as GeometryCollection,
);
// shared borders only — drawing the mesh avoids double-stroked coastlines
const borders = mesh(
  countriesTopology,
  countriesTopology.objects["countries"] as GeometryCollection,
  (a, b) => a !== b,
);

export type Basemap = "minimal" | "political";

type Props = {
  eclipse: Eclipse | undefined;
  basemap?: Basemap;
  /** Nearest populated place to the eclipse peak — always labelled, prominently. */
  highlightCity?: City | null;
  /** Pulse the peak marker (e.g. while hovering the coordinates in the sidebar). */
  highlightPeak?: boolean;
  className?: string;
};

const COLORS: Record<string, string> = {
  total: "#fef3c7",
  annular: "#d8b56d",
  partial: "#b7a894",
  hybrid: "#fef3c7",
};

const FRICTION = 0.972; // per-frame angular-velocity decay (drag torque)
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;
const SKY_TAN = 0.3; // tan of the globe's angular radius → fixed field of view



type Hover = { x: number; y: number; title: string; body: string };

const KIND_NOUN: Record<string, string> = {
  total: "totality",
  annular: "annularity",
  hybrid: "totality",
  partial: "maximum coverage",
};

function fmtDMS(value: number, pos: string, neg: string) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}°${String(min).padStart(2, "0")}′${sec.toFixed(1).padStart(4, "0")}″${
    value >= 0 ? pos : neg
  }`;
}

export default function EclipseGlobe({
  eclipse,
  basemap = "minimal",
  highlightCity = null,
  highlightPeak = false,
  className,
}: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rotation = useRef<[number, number]>([0, -15]);
  const target = useRef<[number, number] | null>(null);
  const dragging = useRef(false);
  const spin = useRef(true);
  const vel = useRef<[number, number]>([0, 0]);
  const zoom = useRef(1);
  const zoomTarget = useRef(1);
  const peakPulse = useRef(false);
  const cursor = useRef<string>("grab");


  peakPulse.current = highlightPeak;

  const geo = useMemo(() => {
    if (!eclipse) return null;
    const ring = bandPolygon(eclipse.path);
    const centerline =
      eclipse.path.length > 1
        ? {
            type: "LineString" as const,
            coordinates: eclipse.path.map((p) => [p.lon, p.lat] as [number, number]),
          }
        : null;
    const band = ring ? { type: "Polygon" as const, coordinates: [ring] } : null;
    const sun = subsolarPoint(eclipse.peak);
    const night = sun
      ? geoCircle()
          .center([sun.lon + 180, -sun.lat])
          .radius(90)()
      : null;
    const penumbraRing = penumbraRegion(eclipse.peak);
    // d3's spherical fill treats a clockwise ring as the *outside* of the region,
    // so orient the ring so the shaded area is the partially eclipsed zone itself
    const penumbra = penumbraRing
      ? { type: "Polygon" as const, coordinates: [[...penumbraRing].reverse()] }
      : null;

    return { band, centerline, sun, night, penumbra };
  }, [eclipse]);

  // the real sky for this eclipse's date: a star at [lon, lat] is overhead there
  const sky = useMemo(() => skyPoints(eclipse?.peak ?? new Date()), [eclipse]);



  // only label the places that actually matter for this eclipse: near the track,
  // or — for partials with no track — inside the partial-coverage zone
  const localCities = useMemo(() => {
    if (!eclipse) return [];
    if (eclipse.path.length > 1) {
      const NEAR_KM = 400;
      return cities.filter((c) =>
        eclipse.path.some((p) => distanceKm(c.lat, c.lon, p.lat, p.lon) < NEAR_KM),
      );
    }
    const ring = geo?.penumbra;
    if (ring) return cities.filter((c) => geoContains(ring, [c.lon, c.lat]));
    return [];
  }, [eclipse, geo]);


  // fly to the greatest-eclipse point whenever the selection changes
  useEffect(() => {
    if (eclipse?.lat != null && eclipse.lon != null) {
      target.current = [-eclipse.lon, -eclipse.lat];
      spin.current = false;
    } else {
      spin.current = true;
      target.current = null;
    }
  }, [eclipse]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const projection = geoOrthographic().precision(0.4);
    const path = geoPath(projection, ctx);
    const graticule = geoGraticule10();

    let baseR = 200;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseR = Math.min(width, height) / 2 - 24;
      projection.scale(baseR * zoom.current).translate([width / 2, height / 2]);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!width || !height) return;

      zoom.current += (zoomTarget.current - zoom.current) * 0.18;
      projection.scale(baseR * zoom.current).translate([width / 2, height / 2]);

      // motion: ease toward target, coast on angular momentum, or idle spin
      const rot = rotation.current;
      if (!dragging.current) {
        if (target.current) {
          const [tl, tp] = target.current;
          let dl = ((tl - rot[0] + 540) % 360) - 180;
          const dp = tp - rot[1];
          rot[0] += dl * 0.06;
          rot[1] += dp * 0.06;
          if (Math.abs(dl) < 0.15 && Math.abs(dp) < 0.15) target.current = null;
        } else if (Math.abs(vel.current[0]) > 0.004 || Math.abs(vel.current[1]) > 0.004) {
          // L = Iω with linear drag: ω(t+dt) = ω(t) · e^(−dt/τ)
          rot[0] += vel.current[0];
          rot[1] = Math.max(-90, Math.min(90, rot[1] + vel.current[1]));
          vel.current[0] *= FRICTION;
          vel.current[1] *= FRICTION;
        } else if (spin.current) {
          vel.current = [0, 0];
          rot[0] += 0.06;
        }
      }

      projection.rotate([rot[0], rot[1], 0]);
      const center: [number, number] = [-rot[0], -rot[1]];

      ctx.clearRect(0, 0, width, height);
      const r = projection.scale();
      const cx = width / 2;
      const cy = height / 2;

      // starfield: gnomonic projection of the celestial sphere through the same
      // camera, so the sky matches the globe's orientation and this eclipse's date
      {
        const f = r / SKY_TAN;
        const rad = Math.PI / 180;
        const lam0 = -rot[0] * rad;
        const phi0 = -rot[1] * rad;
        const sinP0 = Math.sin(phi0);
        const cosP0 = Math.cos(phi0);
        const maxR = Math.hypot(width, height);
        for (const s of sky) {
          const phi = s.lat * rad;
          const dl = s.lon * rad - lam0;
          const cosPhi = Math.cos(phi);
          const sinPhi = Math.sin(phi);
          const dz = sinP0 * sinPhi + cosP0 * cosPhi * Math.cos(dl);
          if (dz <= 0.08) continue; // behind the camera
          const dx = cosPhi * Math.sin(dl);
          const dy = cosP0 * sinPhi - sinP0 * cosPhi * Math.cos(dl);
          const sx = cx + (f * dx) / dz;
          const sy = cy - (f * dy) / dz;
          const dist = Math.hypot(sx - cx, sy - cy);
          if (dist < r + 0.5) continue; // occluded by the Earth
          if (dist > maxR) continue;
          const bright = Math.max(0.12, Math.min(1, (6.2 - s.mag) / 5.2));
          const size = 0.4 + bright * 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(250,247,242,${(0.25 + bright * 0.7).toFixed(3)})`;
          ctx.fill();
          if (s.mag < 1.6) {
            ctx.beginPath();
            ctx.arc(sx, sy, size * 3.2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(250,247,242,0.07)";
            ctx.fill();
          }
        }
      }



      // ocean — subdued blue-grey, not vivid cobalt
      const grd = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      grd.addColorStop(0, "#4a6b7a");
      grd.addColorStop(0.65, "#2b3e48");
      grd.addColorStop(1, "#151d22");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = grd;
      ctx.fill();

      // graticule
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = "rgba(250,247,242,0.06)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // land / countries — muted olive/sage, not bright green
      if (basemap === "political") {
        ctx.beginPath();
        path(countries);
        ctx.fillStyle = "#5d6b53";
        ctx.fill();
        ctx.strokeStyle = "rgba(92,69,40,0.35)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.beginPath();
        path(borders);
        ctx.strokeStyle = "rgba(216,181,109,0.35)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      } else {
        ctx.beginPath();
        path(land);
        ctx.fillStyle = "#56684d";
        ctx.fill();
        ctx.strokeStyle = "rgba(216,181,109,0.18)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }




      if (geo) {
        const color = COLORS[eclipse?.kind ?? "total"] ?? "#fef3c7";

        // night side at greatest eclipse
        if (geo.night) {
          ctx.save();
          ctx.beginPath();
          path(geo.night);
          ctx.fillStyle = "rgba(12,9,6,0.55)";
          ctx.fill();
          ctx.restore();
        }

        // penumbral footprint: everywhere the sun is at least partly covered
        if (geo.penumbra) {
          ctx.beginPath();
          path(geo.penumbra);
          ctx.fillStyle = `${color}1f`;
          ctx.fill();
          ctx.strokeStyle = `${color}55`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (geo.band) {
          ctx.beginPath();
          path(geo.band);
          ctx.fillStyle = `${color}55`;
          ctx.fill();
          ctx.strokeStyle = `${color}cc`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        if (geo.centerline) {
          ctx.beginPath();
          path(geo.centerline);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        // greatest eclipse marker (only when on the visible hemisphere)
        if (eclipse?.lat != null && eclipse.lon != null) {
          const visible = geoDistance([eclipse.lon, eclipse.lat], center) < Math.PI / 2;
          if (visible) {
            const pt = projection([eclipse.lon, eclipse.lat]);
            if (pt) {
              if (peakPulse.current) {
                const t = (Date.now() % 1400) / 1400;
                ctx.beginPath();
                ctx.arc(pt[0], pt[1], 11 + t * 26, 0, Math.PI * 2);
                ctx.strokeStyle = `${color}${Math.round((1 - t) * 170)
                  .toString(16)
                  .padStart(2, "0")}`;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(pt[0], pt[1], 16, 0, Math.PI * 2);
                ctx.fillStyle = `${color}33`;
                ctx.fill();
              }
              ctx.beginPath();
              ctx.arc(pt[0], pt[1], peakPulse.current ? 6 : 4, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.beginPath();
              ctx.arc(pt[0], pt[1], 11, 0, Math.PI * 2);
              ctx.strokeStyle = peakPulse.current ? color : `${color}88`;
              ctx.lineWidth = peakPulse.current ? 1.6 : 1;
              ctx.stroke();
            }
          }
        }
      }

      // city labels — only places along this eclipse's track / coverage zone
      const taken: [number, number, number, number][] = [];

      // nearest city to the peak: always labelled, in the eclipse's accent colour
      if (highlightCity && geoDistance([highlightCity.lon, highlightCity.lat], center) < Math.PI / 2.08) {
        const pt = projection([highlightCity.lon, highlightCity.lat]);
        if (pt) {
          const accent = COLORS[eclipse?.kind ?? "total"] ?? "#fef3c7";
          ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
          ctx.textBaseline = "middle";
          const label = highlightCity.name;
          const w = ctx.measureText(label).width;
          taken.push([pt[0] - 6, pt[1] - 10, w + 22, 20]);
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 3.4, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 8, 0, Math.PI * 2);
          ctx.strokeStyle = `${accent}99`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.miterLimit = 2;
          ctx.strokeStyle = "rgba(16,12,9,0.85)";
          ctx.strokeText(label, pt[0] + 11, pt[1]);
          ctx.fillStyle = accent;
          ctx.fillText(label, pt[0] + 11, pt[1]);

        }
      }

      if (basemap === "political") {
        const z = zoom.current;
        const minPop = z >= 4.5 ? 20_000 : z >= 3 ? 80_000 : z >= 2 ? 250_000 : 700_000;
        ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        let drawn = 0;
        for (const c of localCities) {
          if (highlightCity && c.name === highlightCity.name) continue;
          if (c.population < minPop) break; // sorted largest first
          if (drawn > 70) break;
          if (geoDistance([c.lon, c.lat], center) > Math.PI / 2.08) continue;
          const pt = projection([c.lon, c.lat]);
          if (!pt) continue;
          // skip labels that would collide with one already placed
          const w = ctx.measureText(c.name).width;
          const box: [number, number, number, number] = [pt[0] - 3, pt[1] - 6, w + 10, 12];
          if (
            taken.some(
              (t) =>
                box[0] < t[0] + t[2] &&
                box[0] + box[2] > t[0] &&
                box[1] < t[1] + t[3] &&
                box[1] + box[3] > t[1],
            )
          )
            continue;
          taken.push(box);
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 1.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(250,247,242,0.88)";
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.miterLimit = 2;
          ctx.strokeStyle = "rgba(18,14,10,0.75)";
          ctx.strokeText(c.name, pt[0] + 5, pt[1]);
          ctx.fillStyle = "rgba(250,247,242,0.92)";
          ctx.fillText(c.name, pt[0] + 5, pt[1]);

          drawn++;
        }

      }



      // limb glow
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(216,181,109,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);

    // pointer drag to rotate, releasing with angular momentum
    let last: [number, number] | null = null;
    let lastMoveAt = 0;
    // active touch/pen/mouse points, for two-finger pinch zoom
    const points = new Map<number, { x: number; y: number }>();
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    const pinching = () => points.size >= 2;
    const pinchDist = () => {
      const [a, b] = [...points.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const onDown = (e: PointerEvent) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) {
        // second finger down: start a pinch, stop rotating
        dragging.current = false;
        last = null;
        vel.current = [0, 0];
        pinchStartDist = pinchDist();
        pinchStartZoom = zoomTarget.current;
        setHover(null);
        return;
      }
      if (points.size > 2) return;
      dragging.current = true;
      spin.current = false;
      target.current = null;
      vel.current = [0, 0];
      last = [e.clientX, e.clientY];
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(e.pointerId);
    };

    // hover explanations: figure out which feature sits under the pointer
    const noun = KIND_NOUN[eclipse?.kind ?? "total"] ?? "totality";
    const probe = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const rot = rotation.current;
      const center: [number, number] = [-rot[0], -rot[1]];

      // outside the disc entirely
      if (Math.hypot(px - width / 2, py - height / 2) > projection.scale() + 2) {
        setHover(null);
        canvas.style.cursor = "grab";
        return;
      }

      canvas.style.cursor = "grab";

      // greatest-eclipse dot
      if (eclipse?.lat != null && eclipse.lon != null) {
        if (geoDistance([eclipse.lon, eclipse.lat], center) < Math.PI / 2) {
          const pt = projection([eclipse.lon, eclipse.lat]);
          if (pt && Math.hypot(pt[0] - px, pt[1] - py) < 16) {
            canvas.style.cursor = "pointer";
            setHover({
              x: px,
              y: py,
              title: "Deepest point of the eclipse",
              body: `${fmtDMS(eclipse.lat, "N", "S")}, ${fmtDMS(eclipse.lon, "E", "W")} — the single spot on Earth where the most of the sun is hidden at the peak, and where the eclipse lasts longest. Click to copy the coordinates.`,
            });
            return;
          }
        }
      }

      // centreline
      if (eclipse?.path.length) {
        let best = Infinity;
        for (const p of eclipse.path) {
          if (geoDistance([p.lon, p.lat], center) > Math.PI / 2) continue;
          const pt = projection([p.lon, p.lat]);
          if (!pt) continue;
          best = Math.min(best, Math.hypot(pt[0] - px, pt[1] - py));
        }
        if (best < 6) {
          setHover({
            x: px,
            y: py,
            title: "Centreline",
            body: `The exact track of the middle of the moon's shadow. Stand on this line and ${noun} lasts as long as it possibly can.`,
          });
          return;
        }
      }

      const ll = projection.invert?.([px, py]);
      if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) {
        setHover(null);
        return;
      }

      // band of totality / annularity
      if (geo?.band && geoContains(geo.band, ll)) {
        setHover({
          x: px,
          y: py,
          title: eclipse?.kind === "annular" ? "Path of annularity" : "Path of totality",
          body:
            eclipse?.kind === "annular"
              ? "Inside this ribbon the moon sits fully in front of the sun but is too far away to cover it, leaving a bright \"ring of fire\" around a black disc."
              : "Inside this ribbon the moon completely blocks the sun. Day turns to dusk, the corona appears, and this is the only place totality is visible.",
        });
        return;
      }

      // penumbral zone
      if (geo?.penumbra && geoContains(geo.penumbra, ll)) {
        setHover({
          x: px,
          y: py,
          title: "Partial coverage zone",
          body:
            "Anywhere in this dashed region sees a bite taken out of the sun. The closer to the centre, the bigger the bite — outside it, nothing unusual happens at all.",
        });
        return;
      }

      // night side
      if (geo?.night && geoContains(geo.night, ll)) {
        setHover({
          x: px,
          y: py,
          title: "Night side",
          body:
            "It's dark here at the peak of the eclipse, so the sun is below the horizon and nothing is visible from the ground.",
        });
        return;
      }

      setHover(null);
    };

    const onMove = (e: PointerEvent) => {
      if (points.has(e.pointerId)) points.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinching()) {
        const d = pinchDist();
        if (pinchStartDist > 0 && d > 0) {
          zoomTarget.current = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, pinchStartZoom * (d / pinchStartDist)),
          );
        }
        return;
      }

      if (!dragging.current || !last) {
        if (!dragging.current) probe(e);
        return;
      }
      setHover(null);
      // ~1 px of drag ≈ 1 px of surface at the globe's centre, gently damped
      const k = (180 / Math.PI / projection.scale()) * 0.85;
      const dx = (e.clientX - last[0]) * k;
      const dy = (e.clientY - last[1]) * k;
      last = [e.clientX, e.clientY];
      lastMoveAt = e.timeStamp;
      rotation.current[0] += dx;
      rotation.current[1] = Math.max(-90, Math.min(90, rotation.current[1] - dy));
      // exponentially smoothed angular velocity, in degrees per frame
      vel.current[0] = vel.current[0] * 0.7 + dx * 0.3;
      vel.current[1] = vel.current[1] * 0.7 - dy * 0.3;
    };

    const onUp = (e: PointerEvent) => {
      const wasPinching = pinching();
      points.delete(e.pointerId);
      dragging.current = false;
      last = null;
      if (wasPinching) {
        // lifting one finger of a pinch shouldn't fling the globe
        vel.current = [0, 0];
        lastMoveAt = 0;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        return;
      }
      // release with the pointer at rest = intent to hold still, not to flick
      const restedFor = e.timeStamp - lastMoveAt;
      if (!lastMoveAt || restedFor > 90) {
        vel.current = [0, 0];
      } else {
        // decay whatever momentum remains by how long the pointer paused
        const k = Math.max(0, 1 - restedFor / 90);
        // cap the flick so a fast swipe spins fast but stays readable
        vel.current[0] = Math.max(-12, Math.min(12, vel.current[0] * k));
        vel.current[1] = Math.max(-8, Math.min(8, vel.current[1] * k));
      }
      lastMoveAt = 0;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };


    const onClick = (e: MouseEvent) => {
      if (eclipse?.lat == null || eclipse.lon == null) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const rot = rotation.current;
      const center: [number, number] = [-rot[0], -rot[1]];
      if (geoDistance([eclipse.lon, eclipse.lat], center) > Math.PI / 2) return;
      const pt = projection([eclipse.lon, eclipse.lat]);
      if (!pt) return;
      if (Math.hypot(pt[0] - px, pt[1] - py) < 18) {
        const text = `${eclipse.lat.toFixed(6)}, ${eclipse.lon.toFixed(6)}`;
        navigator.clipboard
          .writeText(text)
          .then(() => toast.success("Coordinates copied", { description: text }))
          .catch(() => toast.error("Couldn't copy", { description: text }));
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomTarget.current = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, zoomTarget.current * Math.exp(-dy * 0.0018)),
      );
    };

    const onLeave = () => setHover(null);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onClick);


    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);

    };
  }, [geo, eclipse, basemap, localCities, highlightCity, sky]);

  return (
    <div ref={wrapRef} className={cn("relative h-full w-full", className)}>
      <canvas ref={canvasRef} className="h-full w-full cursor-grab active:cursor-grabbing touch-none" />
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 w-60 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-sm"
          style={{ left: hover.x, top: hover.y - 12 }}
        >
          <div className="text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
            {hover.title}
          </div>
          <p className="mt-1.5 leading-relaxed text-foreground/90">{hover.body}</p>
        </div>
      ) : null}
    </div>
  );
}

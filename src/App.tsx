import { useEffect, useMemo, useRef, useState } from "react";
import { Sun, Clock, MapPin, Timer } from "lucide-react";
import { toast } from "sonner";
import EclipseGlobe from "@/components/EclipseGlobe";
import { nearestCity } from "@/lib/cities";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { upcomingSolarEclipses, type Eclipse, type EclipseKind } from "@/lib/eclipse";
import { cn } from "@/lib/utils";

async function copyCoords(lat: number, lon: number) {
  const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Coordinates copied", { description: text });
  } catch {
    toast.error("Couldn't copy", { description: text });
  }
}

const KIND_LABEL: Record<EclipseKind, string> = {
  total: "Total",
  annular: "Annular",
  partial: "Partial",
  hybrid: "Hybrid",
};

const KIND_CLASS: Record<EclipseKind, string> = {
  total: "text-eclipse-total border-eclipse-total/40 bg-eclipse-total/10",
  annular: "text-eclipse-annular border-eclipse-annular/40 bg-eclipse-annular/10",
  partial: "text-eclipse-partial border-eclipse-partial/40 bg-eclipse-partial/10",
  hybrid: "text-eclipse-total border-eclipse-total/40 bg-eclipse-total/10",
};

const KIND_HELP: Record<EclipseKind, string> = {
  total:
    "The moon covers the sun completely. Along a narrow track the sky goes dark in the middle of the day and the sun's corona becomes visible.",
  annular:
    'The moon passes dead centre but is too far from Earth to cover the sun, so a bright "ring of fire" stays visible around it.',
  partial:
    "The moon only clips the sun, so it looks like a bite has been taken out of it. The dark inner shadow misses the Earth entirely.",
  hybrid:
    "A rare eclipse that changes character along its track — annular near the ends, total in the middle.",
};

const FILTERS = ["all", "total", "annular", "partial"] as const;

function Tip({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help decoration-dotted underline-offset-4 hover:underline">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        <div className="text-[0.65rem] tracking-[0.16em] uppercase opacity-70">{title}</div>
        <p className="mt-1 text-xs leading-relaxed">{body}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtTime(d: Date) {
  return `${d.toUTCString().slice(17, 22)} UTC`;
}

function fmtDuration(seconds: number | undefined) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function fmtDMS(value: number, pos: string, neg: string) {
  const hemi = value >= 0 ? pos : neg;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}°${String(min).padStart(2, "0")}′${sec.toFixed(1).padStart(4, "0")}″${hemi}`;
}

function fmtCoords(lat?: number, lon?: number) {
  if (lat == null || lon == null) return "Polar / grazing";
  return `${fmtDMS(lat, "N", "S")}, ${fmtDMS(lon, "E", "W")}`;
}

function fmtDecimalCoords(lat?: number, lon?: number) {
  if (lat == null || lon == null) return "—";
  return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
}

function fmtCoordsShort(lat?: number, lon?: number) {
  if (lat == null || lon == null) return "Polar / grazing";
  const dm = (v: number, pos: string, neg: string) => {
    const abs = Math.abs(v);
    const deg = Math.floor(abs);
    const min = Math.round((abs - deg) * 60);
    return `${deg}°${String(min).padStart(2, "0")}′${v >= 0 ? pos : neg}`;
  };
  return `${dm(lat, "N", "S")} ${dm(lon, "E", "W")}`;
}

function useCountdown(to: Date | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!to) return null;
  const ms = to.getTime() - now;
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export default function App() {
  const [eclipses, setEclipses] = useState<Eclipse[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const from = new Date();
      from.setMonth(from.getMonth() - 3);
      const list = upcomingSolarEclipses(from, 27);
      setEclipses(list);
      const next = list.find((e) => e.peak.getTime() > Date.now());
      setSelectedId(next?.id ?? list[0]?.id ?? null);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const [hoverPeakId, setHoverPeakId] = useState<string | null>(null);

  const rowRef = useRef<HTMLDivElement | null>(null);
  const mobileRowRef = useRef<HTMLDivElement | null>(null);
  const fromSwipe = useRef(false);

  useEffect(() => {
    const attach = (el: HTMLElement) => {
      let t = 0;
      const onScroll = () => {
        window.clearTimeout(t);
        t = window.setTimeout(() => {
          if (el.scrollWidth <= el.clientWidth + 4) return;
          const box = el.getBoundingClientRect();
          const mid = box.left + box.width / 2;
          let bestId: string | null = null;
          let best = Infinity;
          Array.from(el.querySelectorAll<HTMLElement>("[data-eclipse-id]")).forEach((card) => {
            const r = card.getBoundingClientRect();
            const d = Math.abs(r.left + r.width / 2 - mid);
            if (d < best) {
              best = d;
              bestId = card.getAttribute("data-eclipse-id");
            }
          });
          if (bestId) {
            fromSwipe.current = true;
            setSelectedId(bestId);
          }
        }, 130);
      };
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        el.removeEventListener("scroll", onScroll);
        window.clearTimeout(t);
      };
    };

    const cleanups: (() => void)[] = [];
    if (rowRef.current) cleanups.push(attach(rowRef.current));
    return () => cleanups.forEach((c) => c());
  }, [eclipses]);

  useEffect(() => {
    if (fromSwipe.current) {
      fromSwipe.current = false;
      return;
    }
    [rowRef.current, mobileRowRef.current].forEach((el) => {
      if (!el) return;
      el.querySelector<HTMLElement>(`[data-eclipse-id="${selectedId}"]`)?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    });
  }, [selectedId]);

  const visible = useMemo(
    () => (eclipses ?? []).filter((e) => filter === "all" || e.kind === filter),
    [eclipses, filter],
  );

  const selected = useMemo(
    () => (eclipses ?? []).find((e) => e.id === selectedId),
    [eclipses, selectedId],
  );

  const nextEclipse = useMemo(
    () => (eclipses ?? []).find((e) => e.peak.getTime() > Date.now()),
    [eclipses],
  );

  const countdown = useCountdown(nextEclipse?.peak);

  const nearest = useMemo(
    () =>
      selected?.lat != null && selected.lon != null
        ? nearestCity(selected.lat, selected.lon)
        : null,
    [selected],
  );

  const nearestForEclipse = useMemo(() => {
    const map = new Map<string, { name: string; country: string }>();
    for (const e of eclipses ?? []) {
      if (e.lat != null && e.lon != null) {
        const n = nearestCity(e.lat, e.lon);
        if (n) map.set(e.id, { name: n.city.name, country: n.city.country });
      }
    }
    return map;
  }, [eclipses]);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <aside className="paper-grid order-2 hidden w-full shrink-0 flex-col border-b border-border bg-card lg:order-1 lg:flex lg:h-screen lg:w-[400px] lg:border-b-0 lg:border-r">
            <header className="px-7 pt-8 pb-6">
              <h1 className="font-display text-[2.6rem]">
                <span className="block text-[0.6rem] font-mono tracking-[0.24em] text-muted-foreground uppercase">
                  Solar eclipse tracker
                </span>
                The next shadow
                <br />
                to cross the Earth
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Every upcoming solar eclipse, computed from lunar and solar ephemerides — with its
                path of totality drawn on the globe.
              </p>
            </header>

            <section className="mx-7 rounded-md border border-border bg-secondary/40 p-4">
              <h2 className="flex items-center gap-1.5 text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase">
                <Clock className="size-3" />
                Next eclipse in
              </h2>
              {countdown ? (
                <div className="mt-2.5 flex items-end gap-4 font-mono">
                  {[
                    ["days", countdown.days],
                    ["hrs", countdown.hours],
                    ["min", countdown.minutes],
                    ["sec", countdown.seconds],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <div className="text-2xl leading-none tabular-nums text-eclipse-total">
                        {String(value).padStart(2, "0")}
                      </div>
                      <div className="mt-1 text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 h-8 animate-pulse rounded bg-muted" />
              )}
            </section>

            <h2 className="sr-only">Upcoming and recent solar eclipses</h2>

            <div className="flex gap-1.5 px-7 pt-6">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-sm border px-3 py-1 text-xs capitalize transition-colors",
                    filter === f
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div
              ref={rowRef}
              className="mt-4 min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-7 pb-8 lg:overflow-x-hidden lg:overflow-y-auto"
            >
              <ul className="flex snap-x snap-mandatory gap-2 lg:block lg:snap-none lg:space-y-1.5">
                {eclipses === null
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <li
                        key={i}
                        className="h-[68px] w-[72%] shrink-0 animate-pulse snap-start rounded-lg bg-muted/60 lg:w-auto"
                      />
                    ))
                  : visible.map((e) => {
                      const active = e.id === selectedId;
                      const past = e.peak.getTime() < Date.now();
                      return (
                        <li
                          key={e.id}
                          data-eclipse-id={e.id}
                          className="w-[72%] shrink-0 snap-start lg:w-auto"
                        >
                          <button
                            onClick={() => setSelectedId(e.id)}
                            className={cn(
                              "h-full w-full rounded-lg border px-3.5 py-3 text-left transition-colors",
                              active
                                ? "border-primary/40 bg-secondary"
                                : "border-border/40 lg:border-transparent lg:hover:bg-secondary/50",
                              past && !active && "opacity-55",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-sm tabular-nums">
                                {fmtDate(e.peak)}
                                {past ? (
                                  <span className="ml-2 font-sans text-[0.6rem] tracking-[0.16em] text-muted-foreground uppercase">
                                    past
                                  </span>
                                ) : null}
                              </span>
                              <Tip title={`${KIND_LABEL[e.kind]} eclipse`} body={KIND_HELP[e.kind]}>
                                <span
                                  className={cn(
                                    "rounded-sm border px-2 py-0.5 text-[0.65rem] tracking-[0.12em] uppercase",
                                    KIND_CLASS[e.kind],
                                  )}
                                >
                                  {KIND_LABEL[e.kind]}
                                </span>
                              </Tip>
                            </div>

                            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                              <Tip
                                title="Where the eclipse is deepest"
                                body={
                                  e.lat == null
                                    ? "This eclipse only grazes the Earth near a pole, so there's no single deepest point on the ground to quote."
                                    : `The spot on Earth where the most of the sun is hidden at the peak of the event. ${fmtCoords(
                                        e.lat,
                                        e.lon,
                                      )} — decimal: ${fmtDecimalCoords(e.lat, e.lon)}. Click the coordinates to copy them to your clipboard.`
                                }
                              >
                                {e.lat != null && e.lon != null ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="inline-flex cursor-pointer items-center gap-1 font-mono hover:text-primary hover:underline"
                                    onMouseEnter={() => setHoverPeakId(e.id)}
                                    onMouseLeave={() =>
                                      setHoverPeakId((cur) => (cur === e.id ? null : cur))
                                    }
                                    onFocus={() => setHoverPeakId(e.id)}
                                    onBlur={() =>
                                      setHoverPeakId((cur) => (cur === e.id ? null : cur))
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void copyCoords(e.lat!, e.lon!);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        void copyCoords(e.lat!, e.lon!);
                                      }
                                    }}
                                  >
                                    <MapPin className="size-3" />
                                    {fmtCoordsShort(e.lat, e.lon)}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-mono">
                                    <MapPin className="size-3" />
                                    {fmtCoordsShort(e.lat, e.lon)}
                                  </span>
                                )}
                              </Tip>

                              {e.durationSeconds ? (
                                <Tip
                                  title="Longest duration"
                                  body={`How long the sun stays ${
                                    e.kind === "annular" ? "a ring of fire" : "fully hidden"
                                  } for someone standing on the best spot of the track — minutes and seconds, not a clock time.`}
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <Timer className="size-3" />
                                    {fmtDuration(e.durationSeconds)}
                                  </span>
                                </Tip>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
              </ul>
            </div>
          </aside>

          <main className="relative order-1 h-dvh flex-1 overflow-hidden lg:order-2 lg:h-screen">
            <h2 className="sr-only">Eclipse path, totality band and nearest cities on the globe</h2>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(216,181,109,0.10),transparent_64%)]" />

            <EclipseGlobe
              eclipse={selected}
              basemap="political"
              highlightCity={nearest?.city ?? null}
              highlightPeak={hoverPeakId != null && hoverPeakId === selected?.id}
              className="absolute inset-0"
            />

            <div className="absolute top-0 right-0 left-0 hidden flex-wrap items-start justify-between gap-4 p-7 lg:flex">
              <div className="pointer-events-auto">
                <div className="flex items-center gap-1.5 text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
                  <Sun className="size-3" />
                  {selected ? (
                    <Tip
                      title={`${KIND_LABEL[selected.kind]} eclipse`}
                      body={KIND_HELP[selected.kind]}
                    >
                      {KIND_LABEL[selected.kind]} solar eclipse
                    </Tip>
                  ) : (
                    "— solar eclipse"
                  )}
                </div>
                <div className="mt-1 font-display text-2xl">
                  {selected ? fmtDate(selected.peak) : "Computing…"}
                </div>
                <div className="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
                  {selected ? (
                    <>
                      <Tip
                        title="Peak of the eclipse"
                        body={`The clock time — in UTC, the world's reference time zone — of the moment the eclipse is at its deepest anywhere on Earth. Local times along the path differ.${
                          selected.lat != null
                            ? ` Deepest at ${fmtCoords(selected.lat, selected.lon)} (${fmtDecimalCoords(selected.lat, selected.lon)}).`
                            : ""
                        }`}
                      >
                        Peak {fmtTime(selected.peak)}
                      </Tip>
                      {selected.lat != null && selected.lon != null ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                          onClick={() => void copyCoords(selected.lat!, selected.lon!)}
                        >
                          <MapPin className="size-3" />
                          {fmtCoordsShort(selected.lat, selected.lon)}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    ""
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-start justify-end gap-2">
                {selected ? (
                  <dl className="pointer-events-auto flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-white/10 bg-black/25 px-4 py-2 backdrop-blur-md">
                    <Stat
                      label="Max duration"
                      value={fmtDuration(selected.durationSeconds)}
                      help={`The longest the sun stays ${
                        selected.kind === "annular" ? "a ring of fire" : "hidden"
                      } anywhere along the track, in minutes and seconds.`}
                    />
                    <Stat
                      label="Band width"
                      value={selected.pathWidthKm ? `${Math.round(selected.pathWidthKm)} km` : "—"}
                      help="How wide the moon's dark shadow is on the ground at greatest eclipse, measured between the northern and southern limits of totality. Step outside this ribbon and you only see a partial eclipse."
                    />
                    <Stat
                      label="Nearest city"
                      value={
                        nearest
                          ? `${nearest.city.name} · ${Math.round(nearest.distanceKm).toLocaleString()} km`
                          : "—"
                      }
                      help={
                        nearest
                          ? `${nearest.city.name}, ${nearest.city.country} is the closest town of any size to the deepest point — about ${Math.round(
                              nearest.distanceKm,
                            ).toLocaleString()} km to the ${nearest.bearing} of it. Many eclipse peaks fall over open ocean, so this can be a long way off.`
                          : "This eclipse has no single deepest point on the ground, so there's no nearest city to quote."
                      }
                    />
                    <Stat
                      label="Magnitude"
                      value={selected.magnitude != null ? selected.magnitude.toFixed(3) : "—"}
                      help="Eclipse magnitude: the moon's apparent diameter as a fraction of the sun's at greatest eclipse. Above 1.000 the sun is fully covered (total); below 1.000 a rim of sun stays visible."
                    />
                  </dl>
                ) : null}
              </div>
            </div>

            <div className="pointer-events-none absolute top-4 left-4 z-30 lg:top-auto lg:bottom-8 lg:left-8">
              <a
                href="/"
                className="pointer-events-auto inline-block rounded-md border border-white/10 bg-black/30 px-3 py-1.5 text-[0.65rem] tracking-[0.18em] text-white/80 uppercase backdrop-blur-md transition-colors hover:border-white/25 hover:text-white"
              >
                Dillon Harindiran
              </a>
            </div>

            <div className="pointer-events-none absolute bottom-5 right-0 left-0 z-20 lg:hidden">
              <div
                ref={mobileRowRef}
                className="pointer-events-auto w-full overflow-x-auto overflow-y-hidden pb-5"
                style={{
                  touchAction: "pan-x",
                  WebkitOverflowScrolling: "touch",
                  scrollbarWidth: "none",
                }}
              >
                <ul className="flex snap-x snap-mandatory gap-2 px-4">
                  {eclipses === null
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <li
                          key={i}
                          className="h-[104px] w-[150px] shrink-0 snap-center animate-pulse rounded-lg bg-muted/60"
                        />
                      ))
                    : (eclipses ?? []).map((e) => {
                        const active = e.id === selectedId;
                        const past = e.peak.getTime() < Date.now();
                        return (
                          <li
                            key={e.id}
                            data-eclipse-id={e.id}
                            className="h-[104px] w-[150px] shrink-0 snap-center"
                          >
                            <button
                              onClick={() => setSelectedId(e.id)}
                              className={cn(
                                "h-full w-full rounded-lg border px-3 py-2 text-left transition-colors",
                                active
                                  ? "border-primary/40 bg-secondary"
                                  : "border-border/40 bg-card/80",
                                past && !active && "opacity-55",
                              )}
                            >
                              <div className="font-mono text-xs tabular-nums">{fmtDate(e.peak)}</div>
                              <span
                                className={cn(
                                  "mt-1 inline-block rounded-sm border px-1.5 py-0.5 text-[0.6rem] tracking-[0.1em] uppercase",
                                  KIND_CLASS[e.kind],
                                )}
                              >
                                {KIND_LABEL[e.kind]}
                              </span>
                              {nearestForEclipse.get(e.id) ? (
                                <div className="mt-1 truncate text-[0.65rem] leading-tight text-muted-foreground">
                                  {nearestForEclipse.get(e.id)!.name},{" "}
                                  {nearestForEclipse.get(e.id)!.country}
                                </div>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                </ul>
              </div>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="leading-tight">
      <dt className="text-[0.55rem] tracking-[0.16em] text-white/60 uppercase">
        {help ? (
          <Tip title={label} body={help}>
            {label}
          </Tip>
        ) : (
          label
        )}
      </dt>
      <dd className="mt-0.5 font-mono text-xs tabular-nums text-white/90">{value}</dd>
    </div>
  );
}

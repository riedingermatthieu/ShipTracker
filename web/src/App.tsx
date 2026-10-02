import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, Map as MapIcon, Moon, Sun, TriangleAlert } from "lucide-react";
import type { Center, ShipRow } from "./types";
import { useShipStream } from "./hooks/useShipStream";
import { TABBED_QUERY, useMediaQuery } from "./hooks/useMediaQuery";
import { bearing, distanceKm } from "./lib/geo";
import { LocationBar } from "./components/LocationBar";
import { StatsBar } from "./components/StatsBar";
import { ShipTable } from "./components/ShipTable";
import { ShipMap } from "./components/ShipMap";

const DEFAULT: { center: Center; radiusKm: number } = {
  center: { lat: 51.975, lon: 4.05, label: "Port of Rotterdam" },
  radiusKm: 20,
};

function initialArea(): { center: Center; radiusKm: number } {
  const p = new URLSearchParams(location.search);
  const lat = Number(p.get("lat")), lon = Number(p.get("lon")), r = Number(p.get("r"));
  if (p.has("lat") && p.has("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { center: { lat, lon, label: p.get("label") ?? undefined }, radiusKm: r >= 1 && r <= 100 ? r : DEFAULT.radiusKm };
  }
  try {
    const saved = JSON.parse(localStorage.getItem("area") ?? "null");
    if (saved?.center && saved.radiusKm) return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

export default function App() {
  const [{ center, radiusKm }, setArea] = useState(initialArea);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [selected, setSelected] = useState<number>();
  const [hovered, setHovered] = useState<number>();
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<"list" | "map">("list");
  const tabbed = useMediaQuery(TABBED_QUERY);
  const mainRef = useRef<HTMLElement>(null);

  const { ships, status, error, rate } = useShipStream(center, radiusKm);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Persist area in localStorage and the URL (shareable links).
  useEffect(() => {
    try {
      localStorage.setItem("area", JSON.stringify({ center, radiusKm }));
    } catch {
      /* ignore */
    }
    const p = new URLSearchParams({ lat: center.lat.toFixed(5), lon: center.lon.toFixed(5), r: String(radiusKm) });
    if (center.label) p.set("label", center.label);
    history.replaceState(null, "", `?${p}`);
  }, [center, radiusKm]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);

  const rows = useMemo<ShipRow[]>(() => {
    const out: ShipRow[] = [];
    for (const s of ships.values()) {
      if (s.lat === undefined || s.lon === undefined) continue;
      const d = distanceKm(center.lat, center.lon, s.lat, s.lon);
      if (d > radiusKm) continue;
      out.push({ ...s, lat: s.lat, lon: s.lon, distanceKm: d, bearing: bearing(center.lat, center.lon, s.lat, s.lon) });
    }
    return out;
  }, [ships, center.lat, center.lon, radiusKm]);

  const setCenter = useCallback((c: Center) => setArea((a) => ({ ...a, center: c })), []);
  const setRadius = useCallback((r: number) => setArea((a) => ({ ...a, radiusKm: r })), []);
  const select = useCallback((m: number) => setSelected((s) => (s === m ? undefined : m)), []);

  const switchView = useCallback((v: "list" | "map") => {
    setView(v);
    // Bring the top of the list/map into view when switching tabs.
    requestAnimationFrame(() => {
      const top = mainRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) mainRef.current?.scrollIntoView({ block: "start" });
    });
  }, []);

  const showOnMap = useCallback(
    (m: number) => {
      setSelected(m);
      switchView("map");
      if (!tabbed) return;
      requestAnimationFrame(() => mainRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    },
    [switchView, tabbed],
  );

  const showList = tabbed ? view === "list" : true;
  const showMap = tabbed ? view === "map" : true;

  const waiting = rows.length === 0 && (status === "live" || status === "connecting") && !error;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="ocean-glow pointer-events-none fixed inset-0" />
      <div className="relative mx-auto flex max-w-[1800px] flex-col gap-3 p-3 pb-24 sm:gap-4 sm:p-4 sm:pb-24 lg:h-dvh lg:p-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-sky-600 shadow-lg shadow-teal-500/20">
              <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor">
                <path d="M12 2 L19 21 L12 17 L5 21 Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">ShipTracker</h1>
              <p className="truncate text-xs text-muted">
                Live AIS vessels around {center.label ? <span className="text-fg">{center.label}</span> : "your point"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-muted transition hover:text-fg"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>

        <section className="card relative z-20 p-3 sm:p-4">
          <LocationBar center={center} radiusKm={radiusKm} onCenter={setCenter} onRadius={setRadius} />
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Live feed unavailable</p>
              <p className="opacity-80">{error}</p>
            </div>
          </div>
        )}

        <StatsBar rows={rows} status={status} rate={rate} />

        {/* grid-cols-1 = minmax(0, 1fr): without it the implicit column grows to fit
            the full width of long (truncated) ship names and the page overflows sideways. */}
        <main ref={mainRef} className="grid min-h-0 flex-1 scroll-mt-3 grid-cols-1 gap-4 lg:grid-cols-5">
          <div className={`min-h-[28rem] min-w-0 flex-col lg:col-span-3 lg:min-h-0 ${showList ? "flex" : "hidden"}`}>
            <ShipTable
              rows={rows}
              now={now}
              selected={selected}
              hovered={hovered}
              onSelect={select}
              onHover={setHovered}
              onShowOnMap={showOnMap}
              waiting={waiting}
            />
          </div>
          {/* Kept mounted when hidden so the map doesn't reload tiles on every tab switch */}
          <div className={`h-[calc(100dvh-8rem)] min-h-80 min-w-0 lg:col-span-2 lg:h-auto ${showMap ? "" : "hidden"}`}>
            <ShipMap
              center={center}
              radiusKm={radiusKm}
              rows={rows}
              selected={selected}
              hovered={hovered}
              dark={dark}
              visible={showMap}
              onSelect={select}
              onHover={setHovered}
              onPickCenter={setCenter}
            />
          </div>
        </main>
      </div>

      {/* Bottom tab bar on phones and tablets */}
      {tabbed && (
        <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-panel/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg">
          <div className="mx-auto grid max-w-md grid-cols-2 gap-2 p-2">
            {(
              [
                { id: "list", label: "List", icon: List, badge: rows.length },
                { id: "map", label: "Map", icon: MapIcon, badge: undefined },
              ] as const
            ).map(({ id, label, icon: Icon, badge }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  onClick={() => switchView(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
                    active ? "bg-accent text-accent-fg shadow-lg shadow-accent/20" : "text-muted active:bg-hover"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                  {badge !== undefined && (
                    <span
                      className={`min-w-6 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                        active ? "bg-black/15" : "bg-hover text-fg"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

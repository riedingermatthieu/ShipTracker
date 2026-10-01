import { useCallback, useEffect, useMemo, useState } from "react";
import { Moon, Sun, TriangleAlert } from "lucide-react";
import type { Center, ShipRow } from "./types";
import { useShipStream } from "./hooks/useShipStream";
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

  const waiting = rows.length === 0 && (status === "live" || status === "connecting") && !error;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="ocean-glow pointer-events-none fixed inset-0" />
      <div className="relative mx-auto flex max-w-[1800px] flex-col gap-4 p-4 lg:h-dvh lg:p-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-sky-600 shadow-lg shadow-teal-500/20">
              <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor">
                <path d="M12 2 L19 21 L12 17 L5 21 Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">ShipTracker</h1>
              <p className="text-xs text-muted">
                Live AIS vessels around {center.label ? <span className="text-fg">{center.label}</span> : "your point"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-muted transition hover:text-fg"
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

        <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-5">
          <div className="flex min-h-[28rem] flex-col lg:col-span-3 lg:min-h-0">
            <ShipTable
              rows={rows}
              now={now}
              selected={selected}
              hovered={hovered}
              onSelect={select}
              onHover={setHovered}
              waiting={waiting}
            />
          </div>
          <div className="h-[26rem] lg:col-span-2 lg:h-auto">
            <ShipMap
              center={center}
              radiusKm={radiusKm}
              rows={rows}
              selected={selected}
              hovered={hovered}
              dark={dark}
              onSelect={select}
              onHover={setHovered}
              onPickCenter={setCenter}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

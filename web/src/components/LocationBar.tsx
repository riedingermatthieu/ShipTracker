import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LocateFixed, MapPin, Search, X } from "lucide-react";
import type { Center } from "../types";
import { formatCoord } from "../lib/geo";

interface Props {
  center: Center;
  radiusKm: number;
  onCenter: (c: Center) => void;
  onRadius: (r: number) => void;
}

interface GeoResult {
  label: string;
  lat: number;
  lon: number;
  kind: string;
}

const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

export function LocationBar({ center, radiusKm, onCenter, onRadius }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string>();
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const coordMatch = query.match(COORD_RE);

  // Debounced place search (Nominatim via the relay).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || coordMatch) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await r.json();
        setResults(Array.isArray(data) ? data : []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (c: Center) => {
    onCenter(c);
    setQuery("");
    setResults([]);
    setOpen(false);
    setMessage(undefined);
  };

  const submit = () => {
    if (coordMatch) {
      const lat = Number(coordMatch[1]), lon = Number(coordMatch[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return pick({ lat, lon });
      return setMessage("Coordinates out of range");
    }
    const r = results[active];
    if (r) pick({ lat: r.lat, lon: r.lon, label: shortLabel(r.label) });
  };

  const locate = () => {
    if (!navigator.geolocation) return setMessage("Geolocation is not supported by this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        pick({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "My location" });
      },
      (err) => {
        setLocating(false);
        setMessage(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div ref={boxRef} className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMessage(undefined);
            setOpen(true);
          }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          }}
          placeholder="Search a port, city, coast… or paste “lat, lon”"
          className="h-11 w-full rounded-xl border border-line bg-field pl-10 pr-10 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        {loading ? (
          <LoaderCircle className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
        ) : query ? (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-fg"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}

        {open && (results.length > 0 || coordMatch) && (
          <ul className="absolute z-[1000] mt-2 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/30">
            {coordMatch ? (
              <li>
                <button onClick={submit} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-hover">
                  <MapPin className="size-4 text-accent" /> Go to {coordMatch[1]}, {coordMatch[2]}
                </button>
              </li>
            ) : (
              results.map((r, i) => (
                <li key={`${r.lat},${r.lon},${i}`}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick({ lat: r.lat, lon: r.lon, label: shortLabel(r.label) })}
                    className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm ${i === active ? "bg-hover" : ""}`}
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-fg">{shortLabel(r.label)}</span>
                      <span className="block truncate text-xs text-muted">{r.label}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        {message && <p className="absolute mt-1 text-xs text-rose-400">{message}</p>}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={locate}
          disabled={locating}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-field px-4 text-sm font-medium text-fg transition hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {locating ? <LoaderCircle className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          <span className="hidden sm:inline">My location</span>
        </button>

        <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-field px-4 lg:w-72 lg:flex-none">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Radius</span>
          <input
            type="range"
            min={1}
            max={100}
            value={radiusKm}
            onChange={(e) => onRadius(Number(e.target.value))}
            className="range w-0 min-w-0 flex-1"
          />
          <span className="w-14 text-right font-mono text-sm tabular-nums text-fg">{radiusKm} km</span>
        </label>
      </div>

      <div className="hidden min-w-0 items-center gap-2 text-xs text-muted xl:flex">
        <MapPin className="size-3.5 shrink-0 text-accent" />
        <span className="truncate font-mono">
          {formatCoord(center.lat, true)}, {formatCoord(center.lon, false)}
        </span>
      </div>
    </div>
  );
}

function shortLabel(label: string) {
  return label.split(",").slice(0, 2).join(",").trim();
}

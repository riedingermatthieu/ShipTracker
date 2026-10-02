import { forwardRef } from "react";
import { ChevronDown, ExternalLink, Map as MapIcon, Navigation } from "lucide-react";
import type { ShipRow } from "../types";
import { flagFromMmsi, flagUrl, navStatusInfo, shipCategory, shipTypeLabel, vesselLink } from "../lib/ais";
import { compass, formatCoord } from "../lib/geo";
import { ago } from "../lib/format";

interface Props {
  ship: ShipRow;
  now: number;
  expanded: boolean;
  formatDistance: (km: number) => string;
  onToggle: () => void;
  onShowOnMap: () => void;
}

const TONE = {
  move: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  stop: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  warn: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  neutral: "bg-hover text-muted",
};

/** Compact, tappable ship summary used instead of the table on phones. */
export const ShipCard = forwardRef<HTMLLIElement, Props>(function ShipCard(
  { ship: s, now, expanded, formatDistance, onToggle, onShowOnMap },
  ref,
) {
  const flag = flagFromMmsi(s.mmsi);
  const cat = shipCategory(s.shipType);
  const status = navStatusInfo(s.navStatus);
  const dir = s.heading ?? s.cog;

  return (
    <li ref={ref} className={`scroll-mt-44 border-b border-line/60 transition-colors ${expanded ? "bg-accent/8" : ""}`}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full gap-3 px-4 py-3 text-left active:bg-hover"
        style={{ boxShadow: `inset 3px 0 0 ${cat.color}` }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {flag ? (
              <img
                src={flagUrl(flag.code)}
                alt={flag.code}
                loading="lazy"
                className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/20"
              />
            ) : (
              <span className="h-3 w-[18px] shrink-0 rounded-[2px] bg-line" />
            )}
            <span className={`truncate font-semibold ${s.name ? "text-fg" : "italic text-muted"}`}>
              {s.name || "Unnamed vessel"}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: cat.color }} />
            <span className="truncate">{shipTypeLabel(s.shipType)}</span>
            {s.destination && (
              <>
                <span className="opacity-50">·</span>
                <span className="truncate">→ {s.destination}</span>
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {status && (
              <span className={`rounded-full px-2 py-0.5 font-medium ${TONE[status.tone]}`}>{status.label}</span>
            )}
            {s.sog !== undefined && (
              <span className="font-mono tabular-nums text-fg">
                {s.sog.toFixed(1)} <span className="text-muted">kn</span>
              </span>
            )}
            {dir !== undefined && (
              <span className="inline-flex items-center gap-1 font-mono tabular-nums text-fg">
                <Navigation className="size-3 text-accent" style={{ transform: `rotate(${dir - 45}deg)` }} />
                {Math.round(s.cog ?? dir)}°
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between">
          <span className="font-mono text-base font-semibold tabular-nums text-fg">{formatDistance(s.distanceKm)}</span>
          <span className="text-[11px] text-muted">
            {compass(s.bearing)} · {ago(now - s.lastSeen)}
          </span>
          <ChevronDown className={`size-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-field p-3 text-xs">
            <Detail label="Flag" value={flag?.name} />
            <Detail label="Call sign" value={s.callSign} mono />
            <Detail label="IMO" value={s.imo} mono />
            <Detail label="Bearing" value={`${Math.round(s.bearing)}° ${compass(s.bearing)}`} mono />
            <Detail label="Size" value={s.length ? `${s.length} × ${s.width ?? "?"} m` : undefined} mono />
            <Detail label="Draught" value={s.draught ? `${s.draught} m` : undefined} mono />
            <Detail label="Heading" value={s.heading !== undefined ? `${Math.round(s.heading)}°` : undefined} mono />
            <Detail label="Position" value={`${formatCoord(s.lat, true)}\n${formatCoord(s.lon, false)}`} mono />
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={onShowOnMap}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-fg active:opacity-90"
            >
              <MapIcon className="size-4" /> Show on map
            </button>
            <a
              href={vesselLink(s.mmsi)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-panel text-sm font-medium text-fg"
            >
              MMSI {s.mmsi} <ExternalLink className="size-3.5 text-muted" />
            </a>
          </div>
        </div>
      )}
    </li>
  );
});

function Detail({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`whitespace-pre-line break-words text-fg ${mono ? "font-mono tabular-nums" : ""}`}>
        {value ?? <span className="text-muted">—</span>}
      </dd>
    </div>
  );
}

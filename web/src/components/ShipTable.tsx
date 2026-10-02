import { useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, ExternalLink, Navigation, Search, Ship as ShipIcon } from "lucide-react";
import type { ShipRow } from "../types";
import { CATEGORIES, flagFromMmsi, flagUrl, navStatusInfo, shipCategory, shipTypeLabel, vesselLink, type CategoryKey } from "../lib/ais";
import { compass, kmToNm } from "../lib/geo";
import { ago } from "../lib/format";
import { PHONE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { ShipCard } from "./ShipCard";

interface Props {
  rows: ShipRow[];
  now: number;
  selected?: number;
  hovered?: number;
  onSelect: (mmsi: number) => void;
  onHover: (mmsi?: number) => void;
  onShowOnMap: (mmsi: number) => void;
  waiting: boolean;
}

const SORT_OPTIONS: { id: string; label: string; desc: boolean }[] = [
  { id: "distance", label: "Nearest first", desc: false },
  { id: "speed", label: "Fastest first", desc: true },
  { id: "lastSeen", label: "Recently seen", desc: true },
  { id: "name", label: "Name A–Z", desc: false },
  { id: "type", label: "Type", desc: false },
];

type Unit = "km" | "nm";
const col = createColumnHelper<ShipRow>();

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const saveJSON = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

export function ShipTable({ rows, now, selected, hovered, onSelect, onHover, onShowOnMap, waiting }: Props) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [sorting, setSorting] = useState<SortingState>([{ id: "distance", desc: false }]);
  const [filter, setFilter] = useState("");
  const [cats, setCats] = useState<Set<CategoryKey>>(new Set());
  const [unit, setUnit] = useState<Unit>(() => loadJSON("unit", "km"));
  const [visibility, setVisibility] = useState<VisibilityState>(() => loadJSON("columns", { size: false, bearing: false }));
  const [colMenu, setColMenu] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLElement>());

  useEffect(() => saveJSON("unit", unit), [unit]);
  useEffect(() => saveJSON("columns", visibility), [visibility]);

  useEffect(() => {
    if (selected !== undefined) rowRefs.current.get(selected)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const catCounts = useMemo(() => {
    const m = new Map<CategoryKey, number>();
    for (const r of rows) {
      const k = shipCategory(r.shipType).key as CategoryKey;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const data = useMemo(
    () => (cats.size ? rows.filter((r) => cats.has(shipCategory(r.shipType).key as CategoryKey)) : rows),
    [rows, cats],
  );

  const fmtDist = (km: number) => (unit === "km" ? km : kmToNm(km)).toFixed(km < 10 ? 2 : 1);

  const columns = useMemo(
    () => [
      col.accessor((r) => r.name ?? "", {
        id: "name",
        header: "Vessel",
        enableHiding: false,
        sortUndefined: "last",
        cell: ({ row: { original: r } }) => {
          const flag = flagFromMmsi(r.mmsi);
          return (
            <div className="flex min-w-44 items-center gap-3">
              {flag ? (
                <img
                  src={flagUrl(flag.code)}
                  alt={flag.code}
                  title={flag.name}
                  loading="lazy"
                  className="h-3.5 w-5 shrink-0 rounded-[3px] object-cover ring-1 ring-black/20"
                />
              ) : (
                <span className="h-3.5 w-5 shrink-0 rounded-[3px] bg-line" title="Unknown flag" />
              )}
              <div className="min-w-0">
                <div className={`truncate font-semibold ${r.name ? "text-fg" : "italic text-muted"}`}>{r.name || "Unnamed vessel"}</div>
                <div className="truncate text-[11px] text-muted">
                  {[flag?.name, r.callSign].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </div>
          );
        },
      }),
      col.accessor((r) => shipCategory(r.shipType).label, {
        id: "type",
        header: "Type",
        cell: ({ row: { original: r } }) => {
          const c = shipCategory(r.shipType);
          return (
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: `${c.color}1f`, color: c.color }}
            >
              <span className="size-1.5 rounded-full" style={{ background: c.color }} />
              {shipTypeLabel(r.shipType)}
            </span>
          );
        },
      }),
      col.accessor("mmsi", {
        header: "MMSI",
        cell: ({ getValue }) => (
          <a
            href={vesselLink(getValue())}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-accent"
          >
            {getValue()}
            <ExternalLink className="size-3 opacity-0 transition group-hover:opacity-100" />
          </a>
        ),
      }),
      col.accessor((r) => navStatusInfo(r.navStatus)?.label ?? "", {
        id: "status",
        header: "Status",
        sortUndefined: "last",
        cell: ({ row: { original: r } }) => {
          const s = navStatusInfo(r.navStatus);
          if (!s) return <span className="text-muted">—</span>;
          const tone = {
            move: "text-emerald-500 dark:text-emerald-400",
            stop: "text-sky-600 dark:text-sky-300",
            warn: "text-amber-600 dark:text-amber-400",
            neutral: "text-muted",
          }[s.tone];
          return <span className={`whitespace-nowrap text-xs font-medium ${tone}`}>{s.label}</span>;
        },
      }),
      col.accessor((r) => r.sog ?? -1, {
        id: "speed",
        header: "Speed",
        cell: ({ row: { original: r } }) =>
          r.sog === undefined ? (
            <span className="text-muted">—</span>
          ) : (
            <div className="w-20">
              <div className="font-mono text-sm tabular-nums text-fg">
                {r.sog.toFixed(1)} <span className="text-[11px] text-muted">kn</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-line">
                <div className="h-1 rounded-full bg-accent" style={{ width: `${Math.min(100, (r.sog / 25) * 100)}%` }} />
              </div>
            </div>
          ),
      }),
      col.accessor((r) => r.cog ?? r.heading ?? -1, {
        id: "course",
        header: "Course",
        cell: ({ row: { original: r } }) => {
          const dir = r.heading ?? r.cog;
          if (dir === undefined) return <span className="text-muted">—</span>;
          return (
            <span className="inline-flex items-center gap-2 font-mono text-sm tabular-nums text-fg">
              <Navigation className="size-3.5 text-accent" style={{ transform: `rotate(${dir - 45}deg)` }} />
              {Math.round(r.cog ?? dir)}°
            </span>
          );
        },
      }),
      col.accessor("distanceKm", {
        id: "distance",
        header: "Distance",
        cell: ({ getValue }) => (
          <span className="font-mono text-sm tabular-nums text-fg">
            {fmtDist(getValue())} <span className="text-[11px] text-muted">{unit}</span>
          </span>
        ),
      }),
      col.accessor("bearing", {
        header: "Bearing",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-fg">
            {Math.round(getValue())}° <span className="text-[11px] text-muted">{compass(getValue())}</span>
          </span>
        ),
      }),
      col.accessor((r) => r.destination ?? "", {
        id: "destination",
        header: "Destination",
        sortUndefined: "last",
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="whitespace-nowrap text-sm text-fg">{getValue()}</span>
          ) : (
            <span className="text-muted">—</span>
          ),
      }),
      col.accessor((r) => r.length ?? -1, {
        id: "size",
        header: "Size",
        cell: ({ row: { original: r } }) =>
          r.length ? (
            <span className="whitespace-nowrap font-mono text-xs tabular-nums text-fg">
              {r.length} × {r.width ?? "?"} m
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      }),
      col.accessor("lastSeen", {
        header: "Seen",
        sortDescFirst: true,
        cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted">{ago(now - getValue())}</span>,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unit, now],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onColumnVisibilityChange: setVisibility,
    getRowId: (r) => String(r.mmsi),
    globalFilterFn: (row, _id, value: string) => {
      const q = value.toLowerCase();
      const r = row.original;
      return [r.name, r.mmsi, r.callSign, r.destination, r.imo, flagFromMmsi(r.mmsi)?.name, shipTypeLabel(r.shipType)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    autoResetAll: false,
  });

  const visibleRows = table.getRowModel().rows;
  const toggleCat = (k: CategoryKey) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="card flex min-h-0 flex-1 flex-col overflow-clip">
      {/* Toolbar (sticks to the top of the screen while scrolling on phones) */}
      <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-t-2xl border-b border-line bg-panel p-3 sm:p-4 md:static md:bg-transparent">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={isPhone ? "Filter ships…" : "Filter by name, MMSI, call sign, destination, flag…"}
              className="h-10 w-full rounded-lg border border-line bg-field pl-9 pr-3 text-base text-fg outline-none placeholder:text-muted focus:border-accent md:h-9 md:text-sm"
            />
          </div>
          <div className="flex h-10 shrink-0 overflow-hidden rounded-lg border border-line text-xs font-medium md:h-9">
            {(["km", "nm"] as Unit[]).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`px-3 transition ${unit === u ? "bg-accent text-accent-fg" : "bg-field text-muted hover:text-fg"}`}
              >
                {u}
              </button>
            ))}
          </div>
          <div className="relative hidden shrink-0 md:block">
            <button
              onClick={() => setColMenu((v) => !v)}
              className="grid size-9 place-items-center rounded-lg border border-line bg-field text-muted hover:text-fg"
              aria-label="Toggle columns"
              title="Columns"
            >
              <Columns3 className="size-4" />
            </button>
            {colMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setColMenu(false)} />
                <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-line bg-panel p-1.5 shadow-2xl shadow-black/30">
                  {table
                    .getAllLeafColumns()
                    .filter((c) => c.getCanHide())
                    .map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-hover">
                        <input
                          type="checkbox"
                          checked={c.getIsVisible()}
                          onChange={c.getToggleVisibilityHandler()}
                          className="accent-[var(--color-accent)]"
                        />
                        {String(c.columnDef.header)}
                      </label>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>

        {isPhone && (
          <select
            value={sorting[0]?.id ?? "distance"}
            onChange={(e) => {
              const o = SORT_OPTIONS.find((s) => s.id === e.target.value)!;
              setSorting([{ id: o.id, desc: o.desc }]);
            }}
            aria-label="Sort ships"
            className="h-10 rounded-lg border border-line bg-field px-3 text-sm text-fg outline-none focus:border-accent"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                Sort: {o.label}
              </option>
            ))}
          </select>
        )}

        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {(Object.keys(CATEGORIES) as CategoryKey[])
            .filter((k) => catCounts.get(k))
            .map((k) => {
              const c = CATEGORIES[k];
              const on = cats.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleCat(k)}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition md:px-2.5 md:py-1 ${
                    on ? "border-transparent text-white" : "border-line text-muted hover:text-fg"
                  }`}
                  style={on ? { background: c.color } : undefined}
                >
                  {!on && <span className="size-1.5 rounded-full" style={{ background: c.color }} />}
                  {c.label}
                  <span className={on ? "opacity-80" : "opacity-60"}>{catCounts.get(k)}</span>
                </button>
              );
            })}
          {cats.size > 0 && (
            <button onClick={() => setCats(new Set())} className="px-2 text-xs text-accent hover:underline">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Card list on phones, table elsewhere */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isPhone ? (
          <ul>
            {visibleRows.map(({ original: s }) => (
              <ShipCard
                key={s.mmsi}
                ref={(el) => {
                  if (el) rowRefs.current.set(s.mmsi, el);
                  else rowRefs.current.delete(s.mmsi);
                }}
                ship={s}
                now={now}
                expanded={s.mmsi === selected}
                formatDistance={(km) => `${fmtDist(km)} ${unit}`}
                onToggle={() => onSelect(s.mmsi)}
                onShowOnMap={() => onShowOnMap(s.mmsi)}
              />
            ))}
            {waiting &&
              visibleRows.length === 0 &&
              Array.from({ length: 5 }, (_, i) => (
                <li key={`sk${i}`} className="flex gap-3 border-b border-line/60 px-4 py-3.5">
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 rounded" style={{ width: `${55 + ((i * 23) % 35)}%` }} />
                    <div className="skeleton h-3 w-1/3 rounded" />
                    <div className="skeleton h-3 w-1/2 rounded" />
                  </div>
                  <div className="skeleton h-4 w-14 rounded" />
                </li>
              ))}
          </ul>
        ) : (
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-panel/95 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} className="border-b border-line px-4 py-2.5">
                      <button
                        onClick={h.column.getToggleSortingHandler()}
                        className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider transition ${
                          sorted ? "text-accent" : "text-muted hover:text-fg"
                        }`}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const m = row.original.mmsi;
              const isSel = m === selected;
              const isHover = m === hovered;
              return (
                <tr
                  key={row.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(m, el);
                    else rowRefs.current.delete(m);
                  }}
                  onClick={() => onSelect(m)}
                  onMouseEnter={() => onHover(m)}
                  onMouseLeave={() => onHover(undefined)}
                  className={`cursor-pointer transition-colors ${
                    isSel ? "bg-accent/15" : isHover ? "bg-hover" : "hover:bg-hover"
                  }`}
                >
                  {row.getVisibleCells().map((cell, i) => (
                    <td
                      key={cell.id}
                      className={`border-b border-line/60 px-4 py-2.5 align-middle text-sm ${
                        i === 0 && isSel ? "shadow-[inset_3px_0_0_var(--color-accent)]" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {waiting &&
              visibleRows.length === 0 &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk${i}`}>
                  {table.getVisibleLeafColumns().map((c) => (
                    <td key={c.id} className="border-b border-line/60 px-4 py-3.5">
                      <div className="skeleton h-3.5 rounded" style={{ width: `${50 + ((i * 17 + c.id.length * 7) % 45)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        )}

        {visibleRows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-accent/10 text-accent">
              <ShipIcon className="size-6" />
            </div>
            {waiting ? (
              <>
                <p className="font-medium text-fg">Listening for AIS broadcasts…</p>
                <p className="max-w-sm text-sm text-muted">
                  Ships report their position every few seconds to minutes. Busy waters fill up quickly; open sea may stay quiet.
                </p>
              </>
            ) : rows.length > 0 ? (
              <p className="text-sm text-muted">No ships match your filters.</p>
            ) : (
              <p className="text-sm text-muted">No ships in range yet. Try a larger radius or a busier area.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-muted">
        <span>
          Showing {visibleRows.length} of {rows.length} ships
        </span>
        <span className="hidden sm:inline">AIS data: aisstream.io · Geocoding: OpenStreetMap Nominatim</span>
      </div>
    </div>
  );
}

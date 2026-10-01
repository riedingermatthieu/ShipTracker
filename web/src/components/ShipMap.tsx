import { useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Anchor, ZoomIn } from "lucide-react";
import type { Center, ShipRow } from "../types";
import { shipCategory } from "../lib/ais";

interface Props {
  center: Center;
  radiusKm: number;
  rows: ShipRow[];
  selected?: number;
  hovered?: number;
  dark: boolean;
  onSelect: (mmsi: number) => void;
  onHover: (mmsi?: number) => void;
  onPickCenter: (c: Center) => void;
}

const iconCache = new Map<string, L.DivIcon>();

function shipIcon(color: string, dir: number | undefined, moving: boolean, state: "normal" | "hover" | "selected") {
  const rot = Math.round((dir ?? 0) / 5) * 5;
  const key = `${color}|${dir === undefined ? "x" : rot}|${moving}|${state}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const size = state === "normal" ? 22 : 30;
    const stroke = state === "selected" ? "#fff" : "rgba(0,0,0,.55)";
    const sw = state === "selected" ? 2 : 1;
    const shape =
      dir === undefined || !moving
        ? `<circle cx="12" cy="12" r="5" fill="${color}" stroke="${stroke}" stroke-width="${sw}"/>`
        : `<path d="M12 2 L18 20 L12 16 L6 20 Z" fill="${color}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" transform="rotate(${rot} 12 12)"/>`;
    const ring = state === "selected" ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${color}" stroke-opacity=".5" stroke-width="2"/>` : "";
    icon = L.divIcon({
      className: "ship-icon",
      html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${ring}${shape}</svg>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function Recenter({ center, radiusKm }: { center: Center; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(center.lat, center.lon).toBounds(radiusKm * 2000);
    map.flyToBounds(bounds, { duration: 0.8, padding: [20, 20] });
  }, [center.lat, center.lon, radiusKm, map]);
  return null;
}

function FocusShip({ rows, selected }: { rows: ShipRow[]; selected?: number }) {
  const map = useMap();
  useEffect(() => {
    const r = rows.find((s) => s.mmsi === selected);
    if (r && !map.getBounds().pad(-0.15).contains([r.lat, r.lon])) map.panTo([r.lat, r.lon], { animate: true });
    // only when the selection changes, not on every position update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, map]);
  return null;
}

function ClickToCenter({ onPick }: { onPick: (c: Center) => void }) {
  useMapEvents({
    dblclick: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng, label: "Picked on map" }),
  });
  return null;
}

/** OpenSeaMap only draws buoys, beacons and lights from about this zoom level. */
const SEAMARK_DETAIL_ZOOM = 12;

function readSeamarkPref() {
  try {
    return localStorage.getItem("seamarks") !== "off";
  } catch {
    return true;
  }
}

export function ShipMap({ center, radiusKm, rows, selected, hovered, dark, onSelect, onHover, onPickCenter }: Props) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [zoom, setZoom] = useState(10);
  const [seamarks, setSeamarks] = useState(readSeamarkPref);

  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);

  useEffect(() => {
    try {
      localStorage.setItem("seamarks", seamarks ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
  }, [seamarks]);

  const markers = useMemo(
    () =>
      rows.map((r) => {
        const state = r.mmsi === selected ? "selected" : r.mmsi === hovered ? "hover" : "normal";
        const icon = shipIcon(shipCategory(r.shipType).color, r.heading ?? r.cog, (r.sog ?? 0) >= 0.5, state);
        return (
          <Marker
            key={r.mmsi}
            position={[r.lat, r.lon]}
            icon={icon}
            zIndexOffset={state === "selected" ? 1000 : state === "hover" ? 500 : 0}
            eventHandlers={{
              click: () => onSelect(r.mmsi),
              mouseover: () => onHover(r.mmsi),
              mouseout: () => onHover(undefined),
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} className="ship-tooltip">
              <strong>{r.name || `MMSI ${r.mmsi}`}</strong>
              <br />
              {r.sog !== undefined ? `${r.sog.toFixed(1)} kn · ` : ""}
              {r.distanceKm.toFixed(1)} km away
            </Tooltip>
          </Marker>
        );
      }),
    [rows, selected, hovered, onSelect, onHover],
  );

  return (
    <div className="card relative h-full min-h-80 overflow-hidden">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={10}
        maxZoom={16}
        doubleClickZoom={false}
        className="h-full w-full"
        attributionControl
        ref={setMap}
      >
        {/* Esri canvas basemaps: free, no API key (CARTO now requires one) */}
        <TileLayer
          key={`base-${dark}`}
          url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? "Dark" : "Light"}_Gray_Base/MapServer/tile/{z}/{y}/{x}`}
          attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          maxZoom={16}
        />
        <TileLayer
          key={`ref-${dark}`}
          url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? "Dark" : "Light"}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`}
          maxZoom={16}
        />
        {seamarks && (
          <TileLayer
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            attribution='Seamarks &copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'
            maxZoom={18}
          />
        )}
        <Circle
          center={[center.lat, center.lon]}
          radius={radiusKm * 1000}
          pathOptions={{ color: "#2dd4bf", weight: 1.5, dashArray: "6 6", fillColor: "#2dd4bf", fillOpacity: 0.05 }}
          interactive={false}
        />
        <CircleMarker
          center={[center.lat, center.lon]}
          radius={6}
          pathOptions={{ color: "#fff", weight: 2, fillColor: "#2dd4bf", fillOpacity: 1 }}
          interactive={false}
        />
        {markers}
        <Recenter center={center} radiusKm={radiusKm} />
        <FocusShip rows={rows} selected={selected} />
        <ClickToCenter onPick={onPickCenter} />
      </MapContainer>
      <div className="absolute right-2 top-2 z-[400] flex flex-col items-end gap-1.5">
        <button
          onClick={() => setSeamarks((v) => !v)}
          aria-pressed={seamarks}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-md backdrop-blur transition ${
            seamarks ? "border-accent/60 bg-panel/90 text-accent" : "border-line bg-panel/85 text-muted hover:text-fg"
          }`}
          title="Show buoys, beacons, lights and fairways from OpenSeaMap"
        >
          <Anchor className="size-3.5" />
          Seamarks {seamarks ? "on" : "off"}
        </button>
        {seamarks && zoom < SEAMARK_DETAIL_ZOOM && (
          <button
            onClick={() => map?.setZoom(SEAMARK_DETAIL_ZOOM)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel/90 px-2.5 py-1.5 text-[11px] text-muted shadow-md backdrop-blur transition hover:text-fg"
          >
            <ZoomIn className="size-3.5" />
            Zoom in to see buoys &amp; lights
          </button>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-md bg-panel/85 px-2 py-1 text-[11px] text-muted backdrop-blur">
        Double-click the map to move the search center
      </div>
    </div>
  );
}

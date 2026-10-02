import WebSocket from "ws";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";
const MESSAGE_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
  "ShipStaticData",
  "StaticDataReport",
];

/** A partial ship record; the browser merges patches by MMSI. */
export interface ShipPatch {
  mmsi: number;
  name?: string;
  lat?: number;
  lon?: number;
  sog?: number;
  cog?: number;
  heading?: number;
  navStatus?: number;
  shipType?: number;
  callSign?: string;
  imo?: number;
  destination?: string;
  length?: number;
  width?: number;
  draught?: number;
  lastSeen: number;
}

type StaticInfo = Omit<ShipPatch, "mmsi" | "lat" | "lon" | "sog" | "cog" | "heading" | "navStatus" | "lastSeen">;

export interface Area {
  lat: number;
  lon: number;
  radiusKm: number;
}

export type RelayStatus =
  | { type: "status"; status: "connecting" | "live" | "reconnecting" }
  | { type: "status"; status: "error"; message: string; fatal?: boolean };

// Static data (name, type, destination…) is only broadcast every ~6 minutes,
// so it is cached across all clients and attached to the next position patch.
const staticCache = new Map<number, StaticInfo>();
const STATIC_CACHE_MAX = 50_000;

function cacheStatic(mmsi: number, info: StaticInfo) {
  const merged = { ...staticCache.get(mmsi), ...info };
  staticCache.delete(mmsi);
  staticCache.set(mmsi, merged);
  if (staticCache.size > STATIC_CACHE_MAX) {
    staticCache.delete(staticCache.keys().next().value!);
  }
}

/** Square bounding box around a point, in aisstream's [[lat, lon], [lat, lon]] format. */
export function boundingBox({ lat, lon, radiusKm }: Area): [[number, number], [number, number]] {
  const dLat = radiusKm / 110.574;
  const dLon = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
  const clampLon = (v: number) => Math.max(-180, Math.min(180, v));
  return [
    [clampLat(lat - dLat), clampLon(lon - dLon)],
    [clampLat(lat + dLat), clampLon(lon + dLon)],
  ];
}

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/@+$/g, "").trim() || undefined : undefined);
const num = (v: unknown, invalid?: (n: number) => boolean) =>
  typeof v === "number" && Number.isFinite(v) && !invalid?.(v) ? v : undefined;

function dimensions(d: any): Pick<StaticInfo, "length" | "width"> {
  if (!d) return {};
  const length = (d.A ?? 0) + (d.B ?? 0);
  const width = (d.C ?? 0) + (d.D ?? 0);
  return { length: length || undefined, width: width || undefined };
}

/** Converts a raw aisstream message into a ship patch (or null if irrelevant). */
export function parseMessage(raw: any): ShipPatch | null {
  const meta = raw?.MetaData;
  const mmsi = num(meta?.MMSI);
  if (!mmsi) return null;
  const body = raw.Message?.[raw.MessageType];
  if (!body) return null;

  const patch: ShipPatch = { mmsi, name: clean(meta.ShipName), lastSeen: Date.now() };

  switch (raw.MessageType) {
    case "PositionReport":
    case "StandardClassBPositionReport":
    case "ExtendedClassBPositionReport": {
      Object.assign(patch, {
        lat: num(body.Latitude, (n) => Math.abs(n) > 90) ?? num(meta.latitude),
        lon: num(body.Longitude, (n) => Math.abs(n) > 180) ?? num(meta.longitude),
        sog: num(body.Sog, (n) => n >= 102.3),
        cog: num(body.Cog, (n) => n >= 360),
        heading: num(body.TrueHeading, (n) => n >= 360),
        navStatus: num(body.NavigationalStatus),
      });
      if (raw.MessageType === "ExtendedClassBPositionReport") {
        const info: StaticInfo = { name: clean(body.Name), shipType: num(body.Type) || undefined, ...dimensions(body.Dimension) };
        cacheStatic(mmsi, info);
      }
      break;
    }
    case "ShipStaticData": {
      cacheStatic(mmsi, {
        name: clean(body.Name),
        shipType: num(body.Type) || undefined,
        callSign: clean(body.CallSign),
        imo: num(body.ImoNumber) || undefined,
        destination: clean(body.Destination),
        draught: num(body.MaximumStaticDraught) || undefined,
        ...dimensions(body.Dimension),
      });
      break;
    }
    case "StaticDataReport": {
      const a = body.ReportA?.Valid ? body.ReportA : null;
      const b = body.ReportB?.Valid ? body.ReportB : null;
      cacheStatic(mmsi, {
        name: clean(a?.Name),
        shipType: num(b?.ShipType) || undefined,
        callSign: clean(b?.CallSign),
        ...dimensions(b?.Dimension),
      });
      break;
    }
    default:
      return null;
  }

  // Drop undefined keys so they don't overwrite known values client-side.
  return stripUndefined({ ...staticCache.get(mmsi), ...stripUndefined(patch) }) as ShipPatch;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * One upstream aisstream connection per browser client.
 * Reconnects with exponential backoff; area can be changed at any time.
 */
export class AisRelay {
  private ws?: WebSocket;
  private area?: Area;
  private retry = 0;
  private retryTimer?: NodeJS.Timeout;
  private closed = false;

  constructor(
    private apiKey: string,
    private onPatch: (p: ShipPatch) => void,
    private onStatus: (s: RelayStatus) => void,
  ) {}

  setArea(area: Area) {
    this.area = area;
    if (this.ws?.readyState === WebSocket.OPEN) this.subscribe();
    else if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.connect();
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.ws?.removeAllListeners();
    // terminate() on a still-connecting socket emits "error"; without a
    // listener that would crash the whole process.
    this.ws?.on("error", () => {});
    this.ws?.terminate();
  }

  private connect() {
    if (this.closed || !this.area) return;
    this.onStatus({ type: "status", status: this.retry ? "reconnecting" : "connecting" });
    const ws = new WebSocket(AISSTREAM_URL);
    this.ws = ws;
    let fatal = false;

    ws.on("open", () => this.subscribe());
    ws.on("message", (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg?.error) {
        fatal = /api key/i.test(msg.error);
        this.onStatus({ type: "status", status: "error", message: msg.error, fatal });
        return;
      }
      if (this.retry) {
        this.retry = 0;
        this.onStatus({ type: "status", status: "live" });
      }
      const patch = parseMessage(msg);
      if (patch) this.onPatch(patch);
    });
    ws.on("error", (err) => console.warn("[aisstream] socket error:", err.message));
    ws.on("close", () => {
      if (this.closed || fatal) return;
      // aisstream silently drops connections with an invalid key, so repeated
      // closes without any data are reported as a likely key problem.
      if (this.retry >= 2) {
        this.onStatus({
          type: "status",
          status: "error",
          message:
            "aisstream.io keeps closing the connection without sending data. Check that AISSTREAM_API_KEY in .env is valid. Retrying…",
        });
      } else {
        this.onStatus({ type: "status", status: "reconnecting" });
      }
      const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    });
  }

  private subscribe() {
    if (!this.area || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        APIKey: this.apiKey,
        BoundingBoxes: [boundingBox(this.area)],
        FilterMessageTypes: MESSAGE_TYPES,
      }),
    );
    // After repeated failures, wait for real data before claiming "live".
    if (this.retry < 2) this.onStatus({ type: "status", status: "live" });
  }
}

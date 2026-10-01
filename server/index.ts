import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocketServer } from "ws";
import { AisRelay, type Area } from "./aisRelay.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT) || 3001;
const API_KEY = process.env.AISSTREAM_API_KEY?.trim() ?? "";
const USER_AGENT = "ShipTracker/1.0 (open-source AIS demo)";

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(API_KEY) });
});

// --- Geocoding via Nominatim (free, max 1 request/second, cached) ---------
const geoCache = new Map<string, unknown>();
let nextSlot = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1100;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

app.get("/api/geocode", async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 200);
  if (q.length < 2) return res.json([]);
  const key = q.toLowerCase();
  if (geoCache.has(key)) return res.json(geoCache.get(key));

  try {
    await throttle();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q, format: "jsonv2", limit: "6" }).toString();
    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" } });
    if (!r.ok) throw new Error(`Nominatim responded ${r.status}`);
    const results = ((await r.json()) as any[]).map((p) => ({
      label: p.display_name as string,
      lat: Number(p.lat),
      lon: Number(p.lon),
      kind: p.type as string,
    }));
    geoCache.set(key, results);
    res.json(results);
  } catch (err) {
    console.warn("[geocode]", (err as Error).message);
    res.status(502).json({ error: "Geocoding service unavailable" });
  }
});

// --- Serve the built frontend in production --------------------------------
const webDist = path.join(ROOT, "web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|live).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

// --- Live AIS relay ---------------------------------------------------------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/live" });

function parseArea(v: any): Area | null {
  const lat = Number(v?.lat), lon = Number(v?.lon), radiusKm = Number(v?.radiusKm);
  if (![lat, lon, radiusKm].every(Number.isFinite)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, radiusKm: Math.min(Math.max(radiusKm, 0.5), 200) };
}

wss.on("connection", (client) => {
  const send = (msg: unknown) => client.readyState === client.OPEN && client.send(JSON.stringify(msg));

  if (!API_KEY) {
    send({
      type: "status",
      status: "error",
      fatal: true,
      message: "No AISSTREAM_API_KEY configured on the server. Get a free key at aisstream.io and add it to .env.",
    });
    return;
  }

  // Batch patches to keep the browser smooth in busy areas.
  let queue = new Map<number, object>();
  const flush = setInterval(() => {
    if (!queue.size) return;
    send({ type: "ships", ships: [...queue.values()] });
    queue = new Map();
  }, 500);

  const relay = new AisRelay(
    API_KEY,
    (p) => queue.set(p.mmsi, { ...queue.get(p.mmsi), ...p }),
    (s) => send(s),
  );

  client.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "subscribe") {
        const area = parseArea(msg);
        if (area) relay.setArea(area);
      }
    } catch {
      /* ignore malformed client messages */
    }
  });

  client.on("close", () => {
    clearInterval(flush);
    relay.close();
  });
});

server.listen(PORT, () => {
  console.log(`ShipTracker relay listening on http://localhost:${PORT}`);
  if (!API_KEY) console.warn("⚠  AISSTREAM_API_KEY is not set — live ship data is disabled. See .env.example");
});

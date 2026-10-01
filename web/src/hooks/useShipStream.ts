import { useEffect, useRef, useState } from "react";
import type { Center, ConnectionStatus, Ship } from "../types";
import { distanceKm } from "../lib/geo";

const STALE_MS = 15 * 60_000;

interface StreamState {
  ships: Map<number, Ship>;
  status: ConnectionStatus;
  error?: string;
  /** AIS updates received during the last few seconds, per second */
  rate: number;
}

/**
 * Connects to the relay's /live WebSocket and keeps a merged map of ships
 * around `center`. The subscription is debounced so dragging the radius
 * slider doesn't hammer the upstream service.
 */
export function useShipStream(center: Center, radiusKm: number): StreamState {
  const [ships, setShips] = useState<Map<number, Ship>>(() => new Map());
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string>();
  const [rate, setRate] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const areaRef = useRef({ ...center, radiusKm });
  const fatalRef = useRef(false);
  const countRef = useRef(0);

  // One socket for the hook's lifetime, with reconnect.
  useEffect(() => {
    let disposed = false;
    let retry = 0;
    let timer: number | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus(retry ? "reconnecting" : "connecting");
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ type: "subscribe", ...areaRef.current }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "status") {
          setStatus(msg.status);
          if (msg.status === "error") {
            setError(msg.message);
            fatalRef.current = Boolean(msg.fatal);
          } else if (msg.status === "live") {
            setError(undefined);
          }
        } else if (msg.type === "ships") {
          countRef.current += msg.ships.length;
          setShips((prev) => {
            const next = new Map(prev);
            for (const p of msg.ships as Ship[]) next.set(p.mmsi, { ...prev.get(p.mmsi), ...p });
            return next;
          });
        }
      };
      ws.onclose = () => {
        if (disposed || fatalRef.current) return;
        setStatus("reconnecting");
        timer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++));
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  // Debounced re-subscription when the area changes.
  useEffect(() => {
    areaRef.current = { lat: center.lat, lon: center.lon, radiusKm };
    const t = setTimeout(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "subscribe", ...areaRef.current }));
    }, 400);
    return () => clearTimeout(t);
  }, [center.lat, center.lon, radiusKm]);

  // Drop ships far outside the new area right away.
  useEffect(() => {
    setShips((prev) => {
      const next = new Map<number, Ship>();
      for (const [k, s] of prev) {
        if (s.lat === undefined || s.lon === undefined) continue;
        if (distanceKm(center.lat, center.lon, s.lat, s.lon) <= radiusKm * 1.5) next.set(k, s);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [center.lat, center.lon, radiusKm]);

  // Prune stale ships and compute the update rate.
  useEffect(() => {
    const id = setInterval(() => {
      setRate(countRef.current / 5);
      countRef.current = 0;
      const cutoff = Date.now() - STALE_MS;
      setShips((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [k, s] of prev) {
          if (s.lastSeen < cutoff) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return { ships, status, error, rate };
}

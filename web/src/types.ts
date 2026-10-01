export interface Ship {
  mmsi: number;
  name?: string;
  lat?: number;
  lon?: number;
  /** Speed over ground, knots */
  sog?: number;
  /** Course over ground, degrees */
  cog?: number;
  /** True heading, degrees */
  heading?: number;
  navStatus?: number;
  shipType?: number;
  callSign?: string;
  imo?: number;
  destination?: string;
  /** metres */
  length?: number;
  width?: number;
  draught?: number;
  /** epoch ms */
  lastSeen: number;
}

/** A ship with a known position, enriched relative to the search center. */
export interface ShipRow extends Ship {
  lat: number;
  lon: number;
  distanceKm: number;
  bearing: number;
}

export interface Center {
  lat: number;
  lon: number;
  label?: string;
}

export type ConnectionStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";

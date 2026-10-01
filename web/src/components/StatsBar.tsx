import { Activity, Anchor, Navigation, Ship } from "lucide-react";
import type { ConnectionStatus, ShipRow } from "../types";

interface Props {
  rows: ShipRow[];
  status: ConnectionStatus;
  rate: number;
}

export function StatsBar({ rows, status, rate }: Props) {
  const moving = rows.filter((r) => (r.sog ?? 0) >= 0.5).length;
  const stopped = rows.length - moving;
  const nearest = rows.reduce<ShipRow | undefined>((a, r) => (!a || r.distanceKm < a.distanceKm ? r : a), undefined);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat icon={<Ship className="size-4" />} label="Ships in range" value={rows.length} />
      <Stat icon={<Navigation className="size-4" />} label="Under way" value={moving} />
      <Stat icon={<Anchor className="size-4" />} label="Stationary" value={stopped} />
      <Stat
        icon={<Activity className="size-4" />}
        label="Feed"
        value={<StatusPill status={status} />}
        hint={status === "live" ? `${rate.toFixed(1)} msg/s${nearest ? ` · nearest ${nearest.distanceKm.toFixed(1)} km` : ""}` : undefined}
      />
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
        <div className="text-lg font-semibold tabular-nums leading-tight text-fg">{value}</div>
        {hint && <div className="truncate text-[11px] text-muted">{hint}</div>}
      </div>
    </div>
  );
}

const STATUS: Record<ConnectionStatus, { label: string; cls: string }> = {
  idle: { label: "Idle", cls: "bg-slate-500" },
  connecting: { label: "Connecting", cls: "bg-amber-400 animate-pulse" },
  live: { label: "Live", cls: "bg-emerald-400 live-dot" },
  reconnecting: { label: "Reconnecting", cls: "bg-amber-400 animate-pulse" },
  error: { label: "Error", cls: "bg-rose-500" },
};

export function StatusPill({ status }: { status: ConnectionStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-2 text-base">
      <span className={`size-2 rounded-full ${s.cls}`} />
      {s.label}
    </span>
  );
}

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
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      <Stat icon={<Ship className="size-4" />} label="Ships in range" short="Ships" value={rows.length} />
      <Stat icon={<Navigation className="size-4" />} label="Under way" short="Moving" value={moving} />
      <Stat icon={<Anchor className="size-4" />} label="Stationary" short="Stopped" value={stopped} />
      <Stat
        icon={<Activity className="size-4" />}
        label="Feed"
        short="Feed"
        value={<StatusPill status={status} />}
        hint={status === "live" ? `${rate.toFixed(1)} msg/s${nearest ? ` · nearest ${nearest.distanceKm.toFixed(1)} km` : ""}` : undefined}
      />
    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  /** Label used on narrow screens */
  short: string;
  value: React.ReactNode;
  hint?: string;
}

function Stat({ icon, label, short, value, hint }: StatProps) {
  return (
    <div className="card flex min-w-0 items-center gap-3 px-2.5 py-2 sm:px-4 sm:py-3">
      <div className="hidden size-9 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent sm:grid">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted sm:text-[11px]">
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </div>
        <div className="truncate text-base font-semibold tabular-nums leading-tight text-fg sm:text-lg">{value}</div>
        {hint && <div className="hidden truncate text-[11px] text-muted md:block">{hint}</div>}
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
    <span className="inline-flex max-w-full items-center gap-1.5 text-sm sm:gap-2 sm:text-base">
      <span className={`size-2 shrink-0 rounded-full ${s.cls}`} />
      <span className="truncate">{s.label}</span>
    </span>
  );
}

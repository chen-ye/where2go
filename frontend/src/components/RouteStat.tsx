import "./RouteStat.css";

interface RouteStatProps {
  value: number | null | undefined;
  units: string;
  decimals?: number;
  className?: string;
}

export function RouteStat({
  value,
  units,
  decimals = 0,
  className = "",
}: RouteStatProps) {
  const formattedValue =
    value !== null && value !== undefined
      ? decimals > 0
        ? value.toFixed(decimals)
        : Math.round(value).toString()
      : `––`;

  return (
    <div className={`stat-item ${className}`}>
      {formattedValue}
      <span className="stat-units">{units}</span>
    </div>
  );
}

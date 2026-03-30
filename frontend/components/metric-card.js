import Icon from "./icon";

export default function MetricCard({
  icon,
  label,
  value,
  helper,
  trend,
  tone = "neutral",
  onClick,
  className = "",
}) {
  const interactive = typeof onClick === "function";
  const Component = interactive ? "button" : "article";

  return (
    <Component
      type={interactive ? "button" : undefined}
      className={`metric-card tone-${tone} ${interactive ? "metric-card-action" : ""} ${className}`.trim()}
      onClick={interactive ? onClick : undefined}
    >
      <div className="metric-icon">
        <Icon name={icon} size={15} />
      </div>
      <div className="metric-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        {helper ? <span>{helper}</span> : null}
      </div>
      {trend ? <small className="metric-trend">{trend}</small> : null}
    </Component>
  );
}

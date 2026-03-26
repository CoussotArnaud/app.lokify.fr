import Icon from "./icon";

export default function MetricCard({
  icon,
  label,
  value,
  helper,
  trend,
  tone = "neutral",
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-icon">
        <Icon name={icon} size={18} />
      </div>
      <div className="metric-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        {helper ? <span>{helper}</span> : null}
      </div>
      {trend ? <small className="metric-trend">{trend}</small> : null}
    </article>
  );
}

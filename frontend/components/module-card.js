import ToggleSwitch from "./toggle-switch";
import StatusPill from "./status-pill";

export default function ModuleCard({
  module,
  enabled,
  onToggle,
  showToggle = true,
}) {
  return (
    <article className={`module-card accent-${module.accent}`}>
      <div className="module-visual">
        <span>{module.category}</span>
        {module.isNew ? <StatusPill tone="info">Nouveau</StatusPill> : null}
        {module.isComingSoon ? <StatusPill tone="warning">Bientot</StatusPill> : null}
      </div>
      <div className="module-copy">
        <h3>{module.title}</h3>
        <p>{module.description}</p>
      </div>
      <div className="module-actions">
        <a href="#module-details" className="button ghost">
          En savoir plus
        </a>
        {showToggle ? (
          <ToggleSwitch
            checked={enabled}
            onChange={onToggle}
            label={enabled ? "Actif" : "Activer"}
            disabled={module.isComingSoon}
          />
        ) : null}
      </div>
    </article>
  );
}

"use client";

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  compact = false,
}) {
  return (
    <button
      type="button"
      className={`toggle-switch ${checked ? "checked" : ""} ${compact ? "compact" : ""}`.trim()}
      aria-pressed={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label && !compact ? <span className="toggle-label">{label}</span> : null}
    </button>
  );
}

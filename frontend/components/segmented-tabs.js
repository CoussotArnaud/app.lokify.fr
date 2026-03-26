export default function SegmentedTabs({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}) {
  return (
    <div className={`segmented-tabs segmented-tabs-${size}`} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={value === option.id ? "active" : ""}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

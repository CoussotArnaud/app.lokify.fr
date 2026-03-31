"use client";

import Icon from "../icon";

export default function StorefrontEmptyState({
  icon = "shop",
  title,
  description,
  actionLabel = "",
  onAction = null,
  compact = false,
}) {
  return (
    <div
      className={`storefront-empty-state ${compact ? "compact" : ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="storefront-empty-state-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </div>
      <div className="storefront-empty-state-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && typeof onAction === "function" ? (
        <button type="button" className="button ghost" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

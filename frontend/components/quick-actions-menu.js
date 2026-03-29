import Link from "next/link";

import Icon from "./icon";

export default function QuickActionsMenu({ items, triggerLabel = "Reservation" }) {
  if (items.length === 1) {
    return (
      <Link href={items[0].href} className="button primary quick-actions-trigger">
        <Icon name="plus" size={16} />
        <span>{triggerLabel}</span>
      </Link>
    );
  }

  return (
    <details className="quick-actions-menu">
      <summary className="button primary quick-actions-trigger">
        <Icon name="plus" size={16} />
        <span>{triggerLabel}</span>
      </summary>
      <div className="quick-actions-popover">
        {items.map((item) => (
          <Link key={item.id} href={item.href} className="quick-action-link">
            <div>
              <strong>{item.label}</strong>
              <small>{item.helper}</small>
            </div>
            {item.badge ? <span className="quick-action-badge">{item.badge}</span> : null}
          </Link>
        ))}
      </div>
    </details>
  );
}

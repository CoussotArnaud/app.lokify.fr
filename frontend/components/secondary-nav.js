"use client";

export default function SecondaryNav({
  eyebrow,
  title,
  groups,
  activeId,
  onChange,
}) {
  return (
    <aside className="secondary-nav-panel">
      <div className="secondary-nav-head">
        {eyebrow ? <p className="panel-eyebrow">{eyebrow}</p> : null}
        {title ? <h3>{title}</h3> : null}
      </div>

      <div className="secondary-nav-groups">
        {groups.map((group) => (
          <div key={group.title || group.items.map((item) => item.id).join("-")} className="secondary-nav-group">
            {group.title ? <p className="secondary-nav-group-title">{group.title}</p> : null}
            <div className="secondary-nav-list">
              {group.items.map((item) => {
                const isActive = item.id === activeId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`secondary-nav-item ${isActive ? "active" : ""}`}
                    onClick={() => onChange(item.id)}
                  >
                    <span>
                      <strong>{item.label}</strong>
                      {item.helper ? <small>{item.helper}</small> : null}
                    </span>
                    {item.badge ? <em>{item.badge}</em> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

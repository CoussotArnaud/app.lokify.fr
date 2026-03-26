export default function Panel({
  title,
  description,
  eyebrow,
  actions,
  footer,
  className = "",
  children,
  ...props
}) {
  return (
    <section className={`panel ${className}`.trim()} {...props}>
      {title || description || eyebrow || actions ? (
        <header className="panel-header panel-header-advanced">
          <div>
            {eyebrow ? <p className="panel-eyebrow">{eyebrow}</p> : null}
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="panel-body">{children}</div>
      {footer ? <footer className="panel-footer panel-footer-advanced">{footer}</footer> : null}
    </section>
  );
}

export default function SectionCard({ title, description, children, footer }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h4>{title}</h4>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="panel-body">{children}</div>
      {footer ? <div className="panel-footer">{footer}</div> : null}
    </section>
  );
}


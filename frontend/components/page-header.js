export default function PageHeader({ title, description, actions }) {
  return (
    <div className="page-header">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}


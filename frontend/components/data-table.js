export default function DataTable({
  columns,
  rows,
  emptyMessage = "Aucune donnee.",
  rowKey = "id",
  className = "",
}) {
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key || column.label}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={typeof rowKey === "function" ? rowKey(row) : row[rowKey]}>
                {columns.map((column) => (
                  <td key={column.key || column.label}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty-cell">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

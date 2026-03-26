const escapeValue = (value) => {
  const normalized = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/"/g, '""');

  return `"${normalized}"`;
};

export const buildCsv = (columns, rows) => {
  const header = columns.map((column) => escapeValue(column.label)).join(";");
  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const rawValue =
          typeof column.value === "function" ? column.value(row) : row[column.key] ?? "";

        return escapeValue(rawValue);
      })
      .join(";")
  );

  return [header, ...lines].join("\n");
};

export const downloadCsv = (filename, columns, rows) => {
  const csvContent = buildCsv(columns, rows);
  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

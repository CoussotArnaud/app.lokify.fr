const hexToRgba = (hexColor, alpha) => {
  if (!/^#(?:[0-9a-fA-F]{6})$/.test(hexColor || "")) {
    return null;
  }

  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export default function StatusPill({ tone = "neutral", color = "", children }) {
  const customStyles = color
    ? {
        color,
        backgroundColor: hexToRgba(color, 0.12) || undefined,
        borderColor: hexToRgba(color, 0.22) || undefined,
      }
    : undefined;

  return (
    <span className={`status-pill tone-${tone}`} style={customStyles}>
      {children}
    </span>
  );
}

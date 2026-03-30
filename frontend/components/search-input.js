"use client";

import Icon from "./icon";

export default function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher",
  className = "",
}) {
  return (
    <label className={`search-input ${className}`.trim()}>
      <Icon name="search" size={14} />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

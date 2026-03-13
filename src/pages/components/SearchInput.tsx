// src/components/SearchInput.tsx
import React from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export const SearchInput: React.FC<Props> = ({
  value,
  onChange,
  placeholder = "Search…",
}) => (
  <input
    type="text"
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full border px-2 py-1 rounded text-xs focus:ring ring-1 ring-blue-400/30 shadow-sm"
  />
);

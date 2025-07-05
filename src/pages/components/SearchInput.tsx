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
    className="w-full border px-3 py-2 rounded focus:ring h-25 ring-2 ring-blue-400/30 shadow-lg shadow-blue-500/10"
  />
);

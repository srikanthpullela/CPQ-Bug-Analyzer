// src/components/SearchInput.tsx
import React from "react";
import { X, Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isDarkMode?: boolean;
}

export const SearchInput: React.FC<Props> = ({
  value,
  onChange,
  placeholder = "Filter\u2026",
  isDarkMode = false,
}) => (
  <div className="relative w-full flex items-center">
    <Search
      className={`absolute left-2.5 w-3.5 h-3.5 pointer-events-none ${
        isDarkMode ? "text-gray-500" : "text-gray-400"
      }`}
      style={{ top: "50%", transform: "translateY(-50%)" }}
    />
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full pl-8 pr-7 py-1.5 rounded-md text-xs border transition-colors duration-100 focus:outline-none focus:ring-1 ${
        isDarkMode
          ? "bg-gray-900 border-gray-600 text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/30"
          : "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-blue-400/30"
      }`}
    />
    {value && (
      <button
        onClick={() => onChange("")}
        className={`absolute right-2 p-0.5 rounded-full transition-colors ${
          isDarkMode
            ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            : "text-gray-400 hover:text-gray-600 hover:bg-gray-200"
        }`}
        style={{ top: "50%", transform: "translateY(-50%)" }}
        title="Clear search"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </div>
);

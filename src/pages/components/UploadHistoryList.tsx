// src/components/UploadHistoryList.tsx
import React from "react";

interface UploadEntry {
  id: string;
  name: string;
  timestamp: number;
}

interface Props {
  uploads: UploadEntry[];
  onLoad: (id: string) => void;
  isDarkMode?: boolean;
}

export const UploadHistoryList: React.FC<Props> = ({ uploads, onLoad, isDarkMode = false }) => {
  if (!uploads.length) return null;

  return (
    <div className={`mb-4 p-2 border rounded ${isDarkMode ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-200"}`}>
      <div className={`font-medium mb-2 ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}>Recent Uploads</div>
      <ul className="text-sm flex flex-wrap gap-2">
        {uploads.map((u) => (
          <li
            key={u.id}
            title={u.name}
            onClick={() => onLoad(u.id)}
            className={`
        cursor-pointer hover:underline 
        truncate px-2 py-1 rounded 
        whitespace-nowrap overflow-hidden text-ellipsis
        ${isDarkMode ? "text-blue-400 hover:bg-gray-600 bg-gray-700" : "text-blue-600 hover:bg-blue-50 bg-white"}
      `}
          >
            {u.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

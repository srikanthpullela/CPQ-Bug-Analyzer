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
}

export const UploadHistoryList: React.FC<Props> = ({ uploads, onLoad }) => {
  if (!uploads.length) return null;

  return (
    <div className="mb-4 p-2 bg-gray-50 border rounded">
      <div className="font-medium mb-2">Recent Uploads</div>
      <ul className="text-sm flex flex-wrap gap-2">
        {uploads.map((u) => (
          <li
            key={u.id}
            title={u.name}
            onClick={() => onLoad(u.id)}
            className="
        cursor-pointer text-blue-600 hover:underline 
        truncate px-2 py-1 rounded 
        hover:bg-blue-50
        whitespace-nowrap overflow-hidden text-ellipsis
         bg-white
      "
          >
            {u.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

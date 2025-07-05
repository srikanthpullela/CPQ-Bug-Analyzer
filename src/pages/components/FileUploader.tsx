// src/components/FileUploader.tsx
import React, { useRef } from "react";

interface Props {
  onParse: (fileText: string, fileName: string) => void;
  onDownload: () => void;
  hasHar: boolean;
}

export const FileUploader: React.FC<Props> = ({
  onParse,
  onDownload,
  hasHar,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const fileContent = reader.result as string;
      onParse(fileContent, file.name); // ✅ Correct usage
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-2 mb-2">
      <input ref={inputRef} type="file" accept=".har,.json" />
      <button
        onClick={handleUpload}
        className="py-2.5 px-5 me-2 mb-2 mx-2 text-sm font-medium text-white bg-red-600 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
      >
        Upload & Parse
      </button>
      {hasHar && (
        <button
          onClick={onDownload}
          className="py-2.5 px-5 me-2 mb-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
        >
          Download Modified HAR
        </button>
      )}
    </div>
  );
};

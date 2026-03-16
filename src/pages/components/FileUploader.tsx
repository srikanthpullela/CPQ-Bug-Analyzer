// src/components/FileUploader.tsx
import React, { useRef, useState, useCallback } from "react";
import { Upload, FileText, Download } from "lucide-react";

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
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadFile = useCallback((file: File) => {
    setFileName(file.name);
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const fileContent = reader.result as string;
      onParse(fileContent, file.name);
      setIsLoading(false);
    };
    reader.onerror = () => setIsLoading(false);
    reader.readAsText(file);
  }, [onParse]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.har') || file.name.endsWith('.json'))) {
      loadFile(file);
    }
  }, [loadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".har,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-indigo-400 bg-indigo-50"
            : fileName
            ? "border-green-300 bg-green-50/50"
            : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50"
        }`}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : fileName ? (
          <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
        ) : (
          <Upload className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
        <span className={`text-sm truncate ${fileName ? "text-green-700 font-medium" : "text-slate-500"}`}>
          {isLoading ? "Parsing..." : fileName || "Drop a .har / .json file or click to browse"}
        </span>
      </div>

      {hasHar && (
        <button
          onClick={onDownload}
          className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 hover:text-slate-800 transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      )}
    </div>
  );
};

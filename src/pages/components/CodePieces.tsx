import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Plus, Copy, Trash2, Edit3, Save, X, Search, Code, FileText, AlertTriangle, HardDrive, Home, ArrowLeft } from "lucide-react";

interface CodePiece {
  id: string;
  title: string;
  code: string;
  language: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "cpq-bug-analyzer-code-pieces";
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
const BACKUP_KEY = "cpq-bug-analyzer-code-pieces-backup";

export const CodePieces: React.FC = () => {
  const [pieces, setPieces] = useState<CodePiece[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewPiece, setShowNewPiece] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [newPiece, setNewPiece] = useState({
    title: "",
    code: "",
    language: "text"  // Changed default from "javascript" to "text"
  });

  // Safe localStorage operations with error handling
  const saveToStorage = (data: CodePiece[]) => {
    try {
      const jsonString = JSON.stringify(data);
      
      // Check size before saving
      if (jsonString.length > MAX_STORAGE_SIZE) {
        setStorageError("Data too large for storage. Consider removing some pieces.");
        return false;
      }

      // Create backup of current data
      const existingData = localStorage.getItem(STORAGE_KEY);
      if (existingData) {
        localStorage.setItem(BACKUP_KEY, existingData);
      }

      localStorage.setItem(STORAGE_KEY, jsonString);
      setStorageError("");
      return true;
    } catch (error) {
      console.error("Failed to save to localStorage:", error);
      if (error instanceof DOMException && error.code === 22) {
        setStorageError("Storage quota exceeded. Please remove some pieces.");
      } else {
        setStorageError("Failed to save data. Please try again.");
      }
      return false;
    }
  };

  const loadFromStorage = (): CodePiece[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];

      const parsed = JSON.parse(saved);
      
      // Validate data structure
      if (!Array.isArray(parsed)) {
        console.warn("Invalid data structure in storage");
        return [];
      }

      // Validate each piece
      const validPieces = parsed.filter((piece: any) => {
        return (
          piece &&
          typeof piece.id === "string" &&
          typeof piece.title === "string" &&
          typeof piece.code === "string" &&
          typeof piece.language === "string" &&
          typeof piece.createdAt === "number" &&
          typeof piece.updatedAt === "number"
        );
      });

      return validPieces;
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
      
      // Try to restore from backup
      try {
        const backup = localStorage.getItem(BACKUP_KEY);
        if (backup) {
          const backupData = JSON.parse(backup);
          setStorageError("Restored from backup due to data corruption.");
          return Array.isArray(backupData) ? backupData : [];
        }
      } catch (backupError) {
        console.error("Backup also corrupted:", backupError);
      }
      
      setStorageError("Failed to load saved pieces. Data may be corrupted.");
      return [];
    }
  };

  // Load pieces from localStorage on mount
  useEffect(() => {
    const loadedPieces = loadFromStorage();
    setPieces(loadedPieces);
  }, []);

  // Save pieces to localStorage whenever pieces change (with debouncing)
  useEffect(() => {
    if (pieces.length === 0) return; // Don't save empty array on initial load
    
    const timeoutId = setTimeout(() => {
      saveToStorage(pieces);
    }, 500); // Debounce saves by 500ms

    return () => clearTimeout(timeoutId);
  }, [pieces]);

  // Enhanced storage info with remaining memory
  const getStorageInfo = () => {
    try {
      const used = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
      const usedMB = (used / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_STORAGE_SIZE / (1024 * 1024)).toFixed(2);
      const remainingBytes = MAX_STORAGE_SIZE - used;
      const remainingMB = (remainingBytes / (1024 * 1024)).toFixed(2);
      const percentage = (used / MAX_STORAGE_SIZE) * 100;
      
      return { 
        used: usedMB, 
        max: maxMB, 
        remaining: remainingMB,
        remainingBytes,
        percentage: Math.max(0, percentage)
      };
    } catch {
      return { used: "0", max: "5", remaining: "5", remainingBytes: MAX_STORAGE_SIZE, percentage: 0 };
    }
  };

  const filteredPieces = pieces.filter(
    (piece) =>
      piece.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      piece.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      piece.language.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveNew = () => {
    if (!newPiece.title.trim() || !newPiece.code.trim()) return;

    const piece: CodePiece = {
      id: Date.now().toString(),
      title: newPiece.title.trim(),
      code: newPiece.code.trim(),
      language: newPiece.language,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const newPieces = [piece, ...pieces];
    const jsonString = JSON.stringify(newPieces);
    
    if (jsonString.length > MAX_STORAGE_SIZE) {
      setStorageError("Adding this piece would exceed storage limit. Please remove some pieces first.");
      return;
    }

    setPieces(newPieces);
    setNewPiece({ title: "", code: "", language: "text" });
    setShowNewPiece(false);
  };

  const handleUpdate = (id: string, updates: Partial<CodePiece>) => {
    setPieces((prev) =>
      prev.map((piece) =>
        piece.id === id
          ? { ...piece, ...updates, updatedAt: Date.now() }
          : piece
      )
    );
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    const piece = pieces.find(p => p.id === id);
    if (piece) {
      setDeleteConfirm({ id, title: piece.title });
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      setPieces((prev) => prev.filter((piece) => piece.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      // You could add a toast notification here
    } catch (error) {
      console.error("Failed to copy code:", error);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  };

  const exportData = () => {
    try {
      const dataStr = JSON.stringify(pieces, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `code-pieces-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStorageError("Failed to export data");
    }
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);
        if (Array.isArray(importedData)) {
          setPieces(importedData);
          setStorageError("");
        } else {
          setStorageError("Invalid file format");
        }
      } catch (error) {
        setStorageError("Failed to import file");
      }
    };
    reader.readAsText(file);
    
    // Reset input
    event.target.value = "";
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  };

  const languages = [
    "text", "javascript", "typescript", "python", "java", "csharp", "css", "html", 
    "sql", "json", "xml", "bash", "powershell", "apex", "other"
  ];

  const storageInfo = getStorageInfo();

  // Add function to format text with basic highlighting
  const formatCodeContent = (code: string, language: string) => {
    if (language === "text") {
      return code
        // Highlight URLs
        .replace(
          /(https?:\/\/[^\s]+)/g,
          '<span class="text-blue-600 underline">$1</span>'
        )
        // Highlight email addresses
        .replace(
          /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
          '<span class="text-blue-600 underline">$1</span>'
        )
        // Highlight headers (lines starting with #)
        .replace(
          /^(#{1,6}\s+.*)$/gm,
          '<span class="text-gray-800 font-bold">$1</span>'
        )
        // Highlight bold text (**text**)
        .replace(
          /\*\*(.*?)\*\*/g,
          '<span class="font-bold">$1</span>'
        )
        // Highlight italic text (*text*)
        .replace(
          /\*(.*?)\*/g,
          '<span class="italic">$1</span>'
        )
        // Highlight code blocks (`code`)
        .replace(
          /`([^`]+)`/g,
          '<span class="bg-gray-100 px-1 rounded font-mono text-sm">$1</span>'
        );
    }
    return code;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <Home className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
            <span className="text-slate-300">|</span>
            <span className="text-slate-700 font-medium">Code Pieces</span>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <Link to="/formatter" className="text-slate-600 hover:text-blue-600 transition-colors">
              Formatter
            </Link>
            <Link to="/compare" className="text-slate-600 hover:text-blue-600 transition-colors">
              Compare
            </Link>
            <Link to="/har" className="text-slate-600 hover:text-blue-600 transition-colors">
              HAR
            </Link>
            <Link to="/log" className="text-slate-600 hover:text-blue-600 transition-colors">
              Log
            </Link>
          </div>
        </div>
      </nav>

      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          {/* Storage Error Alert */}
          {storageError && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-red-800 font-medium">Storage Error</p>
                <p className="text-red-600 text-sm">{storageError}</p>
              </div>
              <button
                onClick={() => setStorageError("")}
                className="ml-auto text-red-600 hover:text-red-800"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {deleteConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-lg flex items-center justify-center z-50 p-4"
                style={{
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
                onClick={() => setDeleteConfirm(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-xl shadow-2xl w-full max-w-md relative z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-red-100 rounded-full">
                        <Trash2 className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800">
                          Delete Code Piece
                        </h3>
                        <p className="text-slate-600">
                          This action cannot be undone.
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3 mb-6">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Title:</span>{" "}
                        {deleteConfirm.title}
                      </p>
                    </div>

                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmDelete}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header with Enhanced Storage Info */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white">
                <Code className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Code Pieces
                </h1>
                <p className="text-slate-600">
                  Store and manage your code snippets
                </p>
              </div>
            </div>

            {/* Enhanced Storage Info Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-slate-500" />
                  <span className="text-slate-700 font-medium">
                    Storage Usage
                  </span>
                </div>

                <div className="flex-1 flex items-center gap-6">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Used:</span>
                    <span className="font-semibold text-slate-700">
                      {storageInfo.used}MB
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="text-slate-500">{storageInfo.max}MB</span>
                  </div>

                  <div className="flex-1 max-w-xs">
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          storageInfo.percentage > 80
                            ? "bg-red-500"
                            : storageInfo.percentage > 60
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                        style={{
                          width: `${Math.min(storageInfo.percentage, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Remaining:</span>
                    <span
                      className={`font-semibold ${
                        parseFloat(storageInfo.remaining) < 1
                          ? "text-red-600"
                          : parseFloat(storageInfo.remaining) < 2
                          ? "text-yellow-600"
                          : "text-green-600"
                      }`}
                    >
                      {storageInfo.remaining}MB
                    </span>
                  </div>

                  <div className="text-sm text-slate-500">
                    {pieces.length} piece{pieces.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {storageInfo.percentage > 75 && (
                <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  Storage is running low. Consider exporting or removing some
                  pieces.
                </div>
              )}
            </div>

            {/* Search and Actions */}
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search code pieces..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-2">
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="hidden"
                  id="import-file"
                />
                <label
                  htmlFor="import-file"
                  className="px-4 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Import
                </label>

                <button
                  onClick={exportData}
                  className="px-4 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                >
                  Export
                </button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowNewPiece(true)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium flex items-center gap-2 hover:shadow-lg transition-all duration-200"
                >
                  <Plus className="w-4 h-4" />
                  New Piece
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* New Piece Modal */}
          <AnimatePresence>
            {showNewPiece && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-lg flex items-center justify-center z-50 p-4"
                style={{
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
                onClick={() => setShowNewPiece(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-screen overflow-hidden relative z-10"
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxHeight: "90vh" }}
                >
                  <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-semibold">Add New Code Piece</h2>
                    <button
                      onClick={() => setShowNewPiece(false)}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Title
                        </label>
                        <input
                          type="text"
                          value={newPiece.title}
                          onChange={(e) =>
                            setNewPiece({ ...newPiece, title: e.target.value })
                          }
                          placeholder="Enter piece title..."
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Type
                        </label>
                        <select
                          value={newPiece.language}
                          onChange={(e) =>
                            setNewPiece({ ...newPiece, language: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {languages.map((lang) => (
                            <option key={lang} value={lang}>
                              {lang === "text" ? "Text" : lang.charAt(0).toUpperCase() + lang.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Content
                      </label>
                      <textarea
                        value={newPiece.code}
                        onChange={(e) =>
                          setNewPiece({ ...newPiece, code: e.target.value })
                        }
                        placeholder="Paste your code here..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none overflow-y-auto"
                        style={{
                          height: "calc(min(60vh, 400px))",
                          minHeight: "200px",
                          maxHeight: "calc(90vh - 320px)",
                        }}
                      />
                    </div>

                    <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 sticky bottom-0 bg-white">
                      <button
                        onClick={() => setShowNewPiece(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveNew}
                        disabled={!newPiece.title.trim() || !newPiece.code.trim()}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Save Piece
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Code Pieces Grid */}
          <div className="grid gap-6">
            <AnimatePresence>
              {filteredPieces.map((piece, index) => (
                <CodePieceCard
                  key={piece.id}
                  piece={piece}
                  index={index}
                  isEditing={editingId === piece.id}
                  onEdit={() => setEditingId(piece.id)}
                  onSave={(updates) => handleUpdate(piece.id, updates)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => handleDelete(piece.id)}
                  onCopy={() => handleCopy(piece.code)}
                  languages={languages}
                  formatDate={formatDate}
                />
              ))}
            </AnimatePresence>

            {filteredPieces.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-600 mb-2">
                  {pieces.length === 0
                    ? "No code pieces yet"
                    : "No matches found"}
                </h3>
                <p className="text-slate-500">
                  {pieces.length === 0
                    ? "Create your first code piece to get started"
                    : "Try adjusting your search terms"}
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Separate component for each code piece card
interface CodePieceCardProps {
  piece: CodePiece;
  index: number;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<CodePiece>) => void;
  onCancel: () => void;
  onDelete: () => void;
  onCopy: () => void;
  languages: string[];
  formatDate: (timestamp: number) => string;
}

const CodePieceCard: React.FC<CodePieceCardProps> = ({
  piece,
  index,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onCopy,
  languages,
  formatDate,
}) => {
  const [editData, setEditData] = useState({
    title: piece.title,
    code: piece.code,
    language: piece.language,
  });

  const handleSave = () => {
    if (!editData.title.trim() || !editData.code.trim()) return;
    onSave(editData);
  };

  // Add function to format text content
  const formatCodeContent = (code: string, language: string) => {
    if (language === "text") {
      return code
        .replace(
          /(https?:\/\/[^\s]+)/g,
          '<span class="text-blue-600 underline cursor-pointer">$1</span>'
        )
        .replace(
          /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
          '<span class="text-blue-600 underline">$1</span>'
        )
        .replace(
          /^(#{1,6}\s+.*)$/gm,
          '<span class="text-gray-800 font-bold text-lg">$1</span>'
        )
        .replace(
          /\*\*(.*?)\*\*/g,
          '<span class="font-bold">$1</span>'
        )
        .replace(
          /\*(.*?)\*/g,
          '<span class="italic">$1</span>'
        )
        .replace(
          /`([^`]+)`/g,
          '<span class="bg-gray-100 px-1 rounded font-mono text-sm">$1</span>'
        );
    }
    return code;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden hover:shadow-xl transition-all duration-300"
    >
      {isEditing ? (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
              />
            </div>
            <select
              value={editData.language}
              onChange={(e) => setEditData({ ...editData, language: e.target.value })}
              className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang === "text" ? "Text" : lang.charAt(0).toUpperCase() + lang.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={editData.code}
            onChange={(e) => setEditData({ ...editData, code: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm mb-4 resize-none overflow-y-auto"
            style={{
              height: 'calc(min(40vh, 300px))',
              minHeight: '150px',
              maxHeight: 'calc(70vh - 200px)'
            }}
          />

          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold text-slate-800">{piece.title}</h3>
              <div className="flex gap-2">
                <button
                  onClick={onCopy}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Copy code"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={onEdit}
                  className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  title="Edit piece"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={onDelete}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete piece"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="bg-slate-100 px-2 py-1 rounded-md font-medium">
                {piece.language === "text" ? "Text" : piece.language}
              </span>
              <span>Created: {formatDate(piece.createdAt)}</span>
              {piece.updatedAt !== piece.createdAt && (
                <span>Updated: {formatDate(piece.updatedAt)}</span>
              )}
            </div>
          </div>

          <div className="p-6">
            {piece.language === "text" ? (
              <div 
                className="bg-slate-50 rounded-lg p-4 text-sm border border-slate-200 max-h-96 overflow-y-auto whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ 
                  __html: formatCodeContent(piece.code, piece.language)
                }}
              />
            ) : (
              <pre className="bg-slate-50 rounded-lg p-4 text-sm font-mono overflow-x-auto border border-slate-200 max-h-96 overflow-y-auto">
                <code>{piece.code}</code>
              </pre>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};

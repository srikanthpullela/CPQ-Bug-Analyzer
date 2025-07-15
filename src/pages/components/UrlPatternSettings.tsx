// src/components/UrlPatternSettings.tsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface UrlPattern {
  name: string;
  pattern: string;
  type: 'apex' | 'http' | 'generic';
  enabled: boolean;
  description?: string;
}

interface Props {
  isDarkMode?: boolean;
  onClose: () => void;
}

export const UrlPatternSettings: React.FC<Props> = ({ isDarkMode = false, onClose }) => {
  const [patterns, setPatterns] = useState<UrlPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Default patterns fallback
  const getDefaultPatterns = (): UrlPattern[] => [
    {
      name: "ApexRemote",
      pattern: "apexremote",
      type: "apex",
      enabled: true,
      description: "Salesforce ApexRemote calls - extracts method from JSON payload"
    },
    {
      name: "CongaCloud",
      pattern: "congacloud",
      type: "http",
      enabled: true,
      description: "CongaCloud API calls - uses HTTP method and endpoint"
    }
  ];

  useEffect(() => {
    // Try to get patterns from localStorage first
    try {
      const stored = localStorage.getItem('har_extractor_url_patterns');
      if (stored) {
        const localPatterns = JSON.parse(stored);
        // Apply strict filtering to ensure only ApexRemote and CongaCloud
        const allowedPatterns = ['apexremote', 'congacloud'];
        const filteredPatterns = localPatterns.filter((p: UrlPattern) => {
          return allowedPatterns.includes(p.pattern.toLowerCase()) && 
                 (p.name.toLowerCase() === 'apexremote' || p.name.toLowerCase() === 'congacloud');
        });
        
        if (filteredPatterns.length > 0) {
          setPatterns(filteredPatterns);
        } else {
          // No valid patterns, use defaults
          setPatterns(getDefaultPatterns());
        }
        setIsLoading(false);
        return;
      }
    } catch (error) {
      console.warn('Error reading patterns from localStorage:', error);
    }

    // No localStorage data, use defaults
    setPatterns(getDefaultPatterns());
    setIsLoading(false);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Apply strict filtering before saving
      const allowedPatterns = ['apexremote', 'congacloud'];
      const filteredPatterns = patterns.filter((p) => {
        return allowedPatterns.includes(p.pattern.toLowerCase()) && 
               (p.name.toLowerCase() === 'apexremote' || p.name.toLowerCase() === 'congacloud');
      });
      
      // Save to localStorage (primary storage)
      localStorage.setItem('har_extractor_url_patterns', JSON.stringify(filteredPatterns));
      console.log('Successfully saved patterns to localStorage');
      
      // Also try to notify devtools (best effort)
      window.postMessage({ 
        source: "HAR_EXTRACTOR", 
        type: "SAVE_URL_PATTERNS", 
        patterns: filteredPatterns 
      }, "*");
      
      // Wait a moment for user feedback, then complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setIsSaving(false);
      toast.success('URL patterns saved successfully!');
      onClose();
      
    } catch (error) {
      console.error('Error saving patterns:', error);
      setIsSaving(false);
      toast.error('Error saving patterns. Please try again.');
    }
  };

  const resetToDefaults = () => {
    if (confirm('Reset all patterns to defaults? This will remove any custom patterns you have added.')) {
      const defaults = getDefaultPatterns();
      setPatterns(defaults);
      
      // Save to localStorage immediately
      try {
        localStorage.setItem('har_extractor_url_patterns', JSON.stringify(defaults));
        console.log('Reset to defaults and saved to localStorage');
        toast.success('Patterns reset to defaults');
      } catch (error) {
        console.error('Error saving defaults to localStorage:', error);
        toast.error('Error resetting patterns');
      }
      
      // Notify devtools (best effort)
      window.postMessage({ 
        source: "HAR_EXTRACTOR", 
        type: "SAVE_URL_PATTERNS", 
        patterns: defaults 
      }, "*");
    }
  };

  const clearAllPatterns = () => {
    if (confirm('Clear all URL patterns? This will stop the extension from capturing any API calls until you add new patterns.')) {
      setPatterns([]);
      
      // Clear localStorage immediately
      try {
        localStorage.removeItem('har_extractor_url_patterns');
        console.log('Cleared all patterns from localStorage');
        toast.success('All patterns cleared');
      } catch (error) {
        console.error('Error clearing localStorage:', error);
        toast.error('Error clearing patterns');
      }
      
      // Notify devtools (best effort)
      window.postMessage({ 
        source: "HAR_EXTRACTOR", 
        type: "SAVE_URL_PATTERNS", 
        patterns: [] 
      }, "*");
    }
  };

  const addNewPattern = () => {
    // Show a warning about restricted patterns
    if (!confirm('Note: Only ApexRemote and CongaCloud patterns are supported. Other patterns will be filtered out when saving. Continue?')) {
      return;
    }
    
    const newPattern: UrlPattern = {
      name: "New Pattern",
      pattern: "",
      type: "generic",
      enabled: true,
      description: ""
    };
    setPatterns([...patterns, newPattern]);
  };

  const updatePattern = (index: number, field: keyof UrlPattern, value: any) => {
    const updated = patterns.map((p, i) => i === index ? { ...p, [field]: value } : p);
    setPatterns(updated);
  };

  const removePattern = (index: number) => {
    setPatterns(patterns.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div
        className={`query-modal-container fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50`}
      >
        <div
          className={`query-modal rounded-lg p-6 max-w-md w-full mx-4 ${
            isDarkMode ? "bg-gray-800 text-white" : "bg-white text-gray-900"
          }`}
        >
          <div className="flex justify-between items-center mb-4">
            <div className="text-center flex-1">Loading patterns...</div>
            <button
              onClick={onClose}
              className={`text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4`}
            >
              ×
            </button>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 mb-4">
              If this takes too long, the extension might not be properly
              loaded.
            </div>
            <button
              onClick={() => {
                setPatterns(getDefaultPatterns());
                setIsLoading(false);
              }}
              className={`px-4 py-2 text-sm font-medium rounded ${
                isDarkMode
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              Load Default Patterns
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`query-modal-container fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50`}
    >
      <div
        className={`query-modal rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto ${
          isDarkMode ? "bg-gray-800 text-white" : "bg-white text-gray-900"
        }`}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">URL Pattern Settings</h2>
          <button
            onClick={onClose}
            className={`text-gray-400 hover:text-gray-600 text-2xl leading-none`}
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {patterns.map((pattern, index) => (
            <div
              key={index}
              className={`border rounded-lg p-4 ${
                isDarkMode
                  ? "border-gray-600 bg-gray-700"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={pattern.name}
                    onChange={(e) =>
                      updatePattern(index, "name", e.target.value)
                    }
                    className={`w-full px-3 py-2 border rounded text-sm ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    URL Pattern
                  </label>
                  <input
                    type="text"
                    value={pattern.pattern}
                    onChange={(e) =>
                      updatePattern(index, "pattern", e.target.value)
                    }
                    placeholder="e.g., apexremote"
                    className={`w-full px-3 py-2 border rounded text-sm ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={pattern.type}
                    onChange={(e) =>
                      updatePattern(
                        index,
                        "type",
                        e.target.value as UrlPattern["type"]
                      )
                    }
                    className={`w-full px-3 py-2 border rounded text-sm ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }`}
                  >
                    <option value="apex">Apex (JSON method)</option>
                    <option value="http">HTTP (REST API)</option>
                    <option value="generic">Generic</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={pattern.enabled}
                      onChange={(e) =>
                        updatePattern(index, "enabled", e.target.checked)
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Enabled</span>
                  </label>
                  <button
                    onClick={() => removePattern(index)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="mt-2">
                <label className="block text-sm font-medium mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={pattern.description || ""}
                  onChange={(e) =>
                    updatePattern(index, "description", e.target.value)
                  }
                  placeholder="Description of this pattern..."
                  className={`w-full px-3 py-2 border rounded text-sm ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mt-6">
          <div className="space-x-2">
            <button
              onClick={addNewPattern}
              className={`px-4 py-2 text-sm font-medium rounded ${
                isDarkMode
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              Add New Pattern
            </button>
            <button
              onClick={resetToDefaults}
              className={`px-4 py-2 text-sm font-medium rounded ${
                isDarkMode
                  ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                  : "bg-yellow-500 hover:bg-yellow-600 text-white"
              }`}
            >
              Reset to Defaults
            </button>
            <button
              onClick={clearAllPatterns}
              className={`px-4 py-2 text-sm font-medium rounded ${
                isDarkMode
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-red-500 hover:bg-red-600 text-white"
              }`}
            >
              Clear All
            </button>
          </div>

          <div className="space-x-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded ${
                isDarkMode
                  ? "bg-gray-600 hover:bg-gray-700 text-white"
                  : "bg-gray-300 hover:bg-gray-400 text-gray-700"
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`px-4 py-2 text-sm font-medium rounded ${
                isDarkMode
                  ? "bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-600"
                  : "bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300"
              }`}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        <div
          className={`mt-4 p-3 rounded text-sm ${
            isDarkMode
              ? "bg-yellow-900 text-yellow-200 border border-yellow-700"
              : "bg-yellow-50 text-yellow-800 border border-yellow-200"
          }`}
        >
          <strong>⚠️ Important:</strong> This extension only supports ApexRemote and CongaCloud patterns. 
          Other patterns (including Salesforce.com, Force.com, etc.) will be automatically filtered out 
          for security and performance reasons.
        </div>

        <div
          className={`mt-4 p-3 rounded text-sm ${
            isDarkMode
              ? "bg-gray-700 text-gray-300"
              : "bg-blue-50 text-blue-800"
          }`}
        >
          <strong>Pattern Types:</strong>
          <ul className="mt-1 space-y-1 text-xs">
            <li>
              <strong>Apex:</strong> Extracts method name from JSON payload (for
              Salesforce ApexRemote)
            </li>
            <li>
              <strong>HTTP:</strong> Uses HTTP method + endpoint (for
              traditional REST APIs)
            </li>
            <li>
              <strong>Generic:</strong> Basic processing for other API types
            </li>
          </ul>
        </div>

        <div
          className={`mt-2 p-3 rounded text-sm ${
            isDarkMode
              ? "bg-gray-700 text-gray-300"
              : "bg-gray-50 text-gray-700"
          }`}
        >
          <strong>Storage Info:</strong>
          <ul className="mt-1 space-y-1 text-xs">
            <li>• Patterns are saved in browser's localStorage</li>
            <li>• Use "Reset to Defaults" to restore original patterns</li>
            <li>
              • Use "Clear All" to remove all patterns and stop API capture
            </li>
            <li>• Changes take effect immediately after saving</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

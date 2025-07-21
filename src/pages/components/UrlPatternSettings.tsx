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
    // Simply read from localStorage without any filtering or modification
    try {
      const stored = localStorage.getItem('har_extractor_url_patterns');
      if (stored) {
        const localPatterns = JSON.parse(stored);
        console.log('📖 Loading patterns from localStorage:', localPatterns);
        
        // Use exactly what's in localStorage - no filtering
        if (Array.isArray(localPatterns) && localPatterns.length > 0) {
          setPatterns(localPatterns);
          setIsLoading(false);
          return;
        }
      }
      
      console.log('📝 No patterns found in localStorage, setting defaults');
    } catch (error) {
      console.warn('⚠️ Error reading patterns from localStorage:', error);
    }

    // No localStorage data or error, use defaults
    const defaults = getDefaultPatterns();
    console.log('Setting default patterns:', defaults);
    setPatterns(defaults);
    setIsLoading(false);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Simply save what the user has configured - no filtering or modification
      const patternsToSave = patterns.map(p => ({
        name: p.name || 'Unnamed Pattern',
        pattern: p.pattern || '',
        type: p.type || 'generic',
        enabled: p.enabled !== false, // default to true
        description: p.description || ''
      }));
      
      console.log('Saving patterns to localStorage:', patternsToSave);
      
      // Save directly to localStorage
      localStorage.setItem('har_extractor_url_patterns', JSON.stringify(patternsToSave));
      
      // Verify the save was successful by reading it back immediately
      const verification = localStorage.getItem('har_extractor_url_patterns');
      if (verification) {
        const parsed = JSON.parse(verification);
        console.log('✅ Verification: Successfully saved and confirmed in localStorage:', parsed);
        
        // Update our state to match exactly what was saved
        setPatterns(parsed);
        
        setIsSaving(false);
        toast.success(`✅ Patterns saved successfully! (${parsed.length} patterns)`);
        
        // Small delay for user feedback, then close
        setTimeout(() => {
          onClose();
        }, 1000);
        
      } else {
        throw new Error('Failed to verify localStorage save - data not found');
      }
      
    } catch (error) {
      console.error('❌ Error saving patterns:', error);
      setIsSaving(false);
      toast.error('❌ Error saving patterns. Please try again.');
    }
  };

  const resetToDefaults = () => {
    if (confirm('Reset all patterns to defaults? This will remove any custom patterns you have added.')) {
      const defaults = getDefaultPatterns();
      setPatterns(defaults);
      
      // Save to localStorage immediately
      try {
        localStorage.setItem('har_extractor_url_patterns', JSON.stringify(defaults));
        console.log('✅ Reset to defaults and saved to localStorage:', defaults);
        toast.success('✅ Patterns reset to defaults and saved!');
      } catch (error) {
        console.error('❌ Error saving defaults to localStorage:', error);
        toast.error('❌ Error resetting patterns');
      }
    }
  };

  const clearAllPatterns = () => {
    if (confirm('Clear all URL patterns? This will stop the extension from capturing any API calls until you add new patterns.')) {
      setPatterns([]);
      
      // Clear localStorage immediately
      try {
        localStorage.removeItem('har_extractor_url_patterns');
        console.log('✅ Cleared all patterns from localStorage');
        toast.success('✅ All patterns cleared!');
      } catch (error) {
        console.error('❌ Error clearing localStorage:', error);
        toast.error('❌ Error clearing patterns');
      }
    }
  };

  const addNewPattern = () => {
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
              ? "bg-green-900 text-green-200 border border-green-700"
              : "bg-green-50 text-green-800 border border-green-200"
          }`}
        >
          <strong>✅ Simple Storage:</strong> Your patterns are saved directly to browser localStorage. 
          Changes are saved exactly as you configure them and will persist when you reopen DevTools.
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

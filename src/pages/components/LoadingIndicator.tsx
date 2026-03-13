import React from 'react';

interface LoadingIndicatorProps {
  isDarkMode?: boolean;
  message?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ 
  isDarkMode = false,
  message = "Capturing network activity..." 
}) => {
  return (
    <div className={`w-full py-3 px-4 flex items-center justify-center gap-3 transition-colors duration-200 ${
      isDarkMode 
        ? "bg-gray-800 border-t border-gray-700" 
        : "bg-gray-50 border-t border-gray-200"
    }`}>
      {/* Animated flowing dots loader */}
      <div className="flex items-center gap-1">
        <div className={`w-2 h-2 rounded-full animate-pulse ${
          isDarkMode ? "bg-indigo-400" : "bg-indigo-600"
        }`} style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
        <div className={`w-2 h-2 rounded-full animate-pulse ${
          isDarkMode ? "bg-indigo-400" : "bg-indigo-600"
        }`} style={{ animationDelay: '200ms', animationDuration: '1s' }}></div>
        <div className={`w-2 h-2 rounded-full animate-pulse ${
          isDarkMode ? "bg-indigo-400" : "bg-indigo-600"
        }`} style={{ animationDelay: '400ms', animationDuration: '1s' }}></div>
      </div>

      {/* Loading message */}
      <span className={`text-sm font-medium transition-colors duration-200 ${
        isDarkMode ? "text-gray-300" : "text-gray-600"
      }`}>
        {message}
      </span>

      {/* Animated spinner */}
      <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${
        isDarkMode 
          ? "border-indigo-400" 
          : "border-indigo-600"
      }`}></div>
    </div>
  );
};

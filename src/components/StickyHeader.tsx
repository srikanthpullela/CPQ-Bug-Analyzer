import React from 'react';
import { Link } from 'react-router-dom';
import { Bug, Monitor, GitCompare, ArrowRight } from 'lucide-react';
import { useScroll } from '../hooks/useScroll';

const StickyHeader: React.FC = () => {
  const { isScrolled, scrollDirection } = useScroll();

  return (
    <>
      {/* Sticky Header - appears when scrolling */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled && scrollDirection === 'down'
            ? 'transform translate-y-0 opacity-100'
            : 'transform -translate-y-full opacity-0'
        }`}
      >
        <div className="bg-white border-b border-gray-200 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link to="/" className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
                  <Bug className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">
                    <span className="text-red-500">Conga</span> Bug Analyzer
                  </h1>
                </div>
              </Link>

              {/* Quick Actions */}
              <div className="flex items-center space-x-4">
                <Link
                  to="/har"
                  className="hidden sm:inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Monitor className="w-4 h-4 mr-2" />
                  HAR Extractor
                </Link>
                <Link
                  to="/compare-tool"
                  className="hidden sm:inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <GitCompare className="w-4 h-4 mr-2" />
                  Compare
                </Link>
                <Link
                  to="/har"
                  className="sm:hidden p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Monitor className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for sticky header */}
      <div
        className={`transition-all duration-300 ${
          isScrolled && scrollDirection === 'down' ? 'h-16' : 'h-0'
        }`}
      />
    </>
  );
};

export default StickyHeader;

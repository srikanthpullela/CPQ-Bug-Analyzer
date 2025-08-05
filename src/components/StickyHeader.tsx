import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Bug, 
  Monitor, 
  GitCompare, 
  ArrowRight, 
  Code, 
  FileX2, 
  FileText, 
  BarChart3,
  Bookmark,
  Network,
  Search,
  Zap
} from 'lucide-react';
import { useScroll } from '../hooks/useScroll';

const StickyHeader: React.FC = () => {
  const { isScrolled, scrollDirection, visibleSections, scrollY } = useScroll();
  const [shouldShow, setShouldShow] = React.useState(false);

  // Better logic for showing/hiding header
  React.useEffect(() => {
    if (isScrolled) {
      if (scrollDirection === 'down' && scrollY > 200) {
        setShouldShow(true);
      } else if (scrollDirection === 'up' && scrollY < 150) {
        setShouldShow(false);
      }
    } else {
      setShouldShow(false);
    }
  }, [isScrolled, scrollDirection, scrollY]);

  // Debug: Log visible sections and scroll position
  React.useEffect(() => {
    console.log('Scroll Y:', scrollY, 'Visible sections:', visibleSections);
  }, [visibleSections, scrollY]);

  // Define feature icons for each row
  const firstRowFeatures = [
    { icon: Monitor, title: 'HAR Extractor', link: '/har' },
    { icon: GitCompare, title: 'Request/Response Compare', link: '/compare-tool' },
    { icon: Code, title: 'JSON Prettifier', link: '/formatter' }
  ];

  const secondRowFeatures = [
    { icon: FileX2, title: 'JSON Diff Compare', link: '/compare' },
    { icon: FileText, title: 'Code Pieces', link: '/pieces' },
    { icon: BarChart3, title: 'Log Analyzer', link: '/log' }
  ];

  const additionalSections = [
    // { icon: Bookmark, title: 'Quick Bookmarks', section: 'bookmarks' },
    // { icon: Network, title: 'Real-time Monitoring', section: 'key-features' },
    // { icon: Zap, title: 'Quick Start', section: 'quick-start' }
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.querySelector(`[data-section="${sectionId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <>
      {/* Sticky Header - appears when scrolling */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out ${
          shouldShow
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

              {/* Dynamic Navigation Icons */}
              <div className="flex items-center space-x-3">
                {/* First Row Features - Show only when actually in features section */}
                {visibleSections.includes('features-grid') && scrollY > 600 && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 rounded-lg border border-blue-200">
                    {firstRowFeatures.map((feature, index) => (
                      <Link
                        key={index}
                        to={feature.link}
                        className="group relative p-2 text-blue-600 hover:bg-blue-100 rounded-md transition-all duration-200"
                      >
                        <feature.icon className="w-4 h-4" />
                        {/* Tooltip */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                          {feature.title}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800"></div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Second Row Features - Show when scrolled to bookmarks */}
                {visibleSections.includes('bookmarks') && scrollY > 900 && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-lg border border-green-200">
                    {secondRowFeatures.map((feature, index) => (
                      <Link
                        key={index}
                        to={feature.link}
                        className="group relative p-2 text-green-600 hover:bg-green-100 rounded-md transition-all duration-200"
                      >
                        <feature.icon className="w-4 h-4" />
                        {/* Tooltip */}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                          {feature.title}
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800"></div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Section Navigation Icons - Commented Out */}
                {/* 
                {(visibleSections.includes('key-features') || visibleSections.includes('quick-start')) && scrollY > 1200 && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-red-50 rounded-lg border border-red-200">
                    {additionalSections.map((section, index) => {
                      if (section.section && visibleSections.includes(section.section)) {
                        return (
                          <button
                            key={index}
                            onClick={() => scrollToSection(section.section!)}
                            className="group relative p-2 text-red-600 hover:bg-red-100 rounded-md transition-all duration-200"
                          >
                            <section.icon className="w-4 h-4" />
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                              {section.title}
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800"></div>
                            </div>
                          </button>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
                */}

                {/* Bookmarks Icon - Always show when bookmarks section is visible */}
                {visibleSections.includes('bookmarks') && scrollY > 800 && (
                  <div className="flex items-center px-2 py-1 bg-purple-50 rounded-lg border border-purple-200">
                    <button
                      onClick={() => scrollToSection('bookmarks')}
                      className="group relative p-2 text-purple-600 hover:bg-purple-100 rounded-md transition-all duration-200"
                    >
                      <Bookmark className="w-4 h-4" />
                      {/* Tooltip */}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                        Quick Bookmarks
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800"></div>
                      </div>
                    </button>
                  </div>
                )}

                {/* Separator */}
                <div className="h-6 w-px bg-gray-300"></div>

                {/* Original Quick Actions */}
                <div className="flex items-center space-x-2">
                  <Link
                    to="/har"
                    className="hidden lg:inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Monitor className="w-4 h-4 mr-2" />
                    HAR Extractor
                  </Link>
                  <Link
                    to="/compare-tool"
                    className="hidden xl:inline-flex items-center px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <GitCompare className="w-4 h-4 mr-2" />
                    Compare
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for sticky header */}
      <div
        className={`transition-all duration-500 ${
          shouldShow ? 'h-16' : 'h-0'
        }`}
      />
    </>
  );
};

export default StickyHeader;

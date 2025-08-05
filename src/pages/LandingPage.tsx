"use client";

import React from "react";
import { Link } from "react-router-dom";
import BookmarksSection from "../components/BookmarksSection";
import StickyHeader from "../components/StickyHeader";
import UserGuideSection from "../components/UserGuideSection";
import { 
  Monitor, 
  FileText, 
  GitCompare, 
  Code, 
  BarChart3, 
  FileCheck, 
  Search, 
  Zap,
  ArrowRight,
  Bug,
  Network,
  Settings,
  FileX2,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ExternalLink
} from "lucide-react";

const LandingPage: React.FC = () => {
  const features = [
    {
      icon: <Monitor className="w-8 h-8" />,
      title: "HAR Extractor",
      description: "Monitor and analyze HTTP/WebSocket traffic in real-time with our Chrome DevTools extension",
      link: "/har",
      color: "blue"
    },
    {
      icon: <GitCompare className="w-8 h-8" />,
      title: "Request/Response Compare",
      description: "Side-by-side comparison of SFDC and Turbo API requests and responses",
      link: "/compare-tool",
      color: "green"
    },
    {
      icon: <Code className="w-8 h-8" />,
      title: "JSON Prettifier",
      description: "Format and beautify JSON data with syntax highlighting and validation",
      link: "/formatter",
      color: "purple"
    },
    {
      icon: <FileX2 className="w-8 h-8" />,
      title: "JSON Diff Compare",
      description: "Compare two JSON objects and highlight differences with detailed analysis",
      link: "/compare",
      color: "yellow"
    },
    {
      icon: <FileText className="w-8 h-8" />,
      title: "Code Pieces",
      description: "Store and manage reusable code snippets and documentation",
      link: "/pieces",
      color: "indigo"
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      title: "Log Analyzer",
      description: "Analyze and parse log files with advanced filtering and search capabilities",
      link: "/log",
      color: "red"
    }
  ];

  const getColorClasses = (color: string) => {
    const colorMap = {
      blue: "from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700",
      green: "from-green-500 to-green-600 hover:from-green-600 hover:to-green-700",
      purple: "from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700",
      orange: "from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700",
      indigo: "from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700",
      red: "from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.blue;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Sticky Header Component */}
      <StickyHeader />
      
      {/* Hero Section */}
      <header className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 transition-all duration-500 w-full max-w-full">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-500 py-24">
          <div className="text-center">
            <div className="flex justify-center items-center mb-6">
              <div className="p-4 bg-white/10 rounded-full backdrop-blur-sm transition-all duration-500">
                <Bug className="text-white transition-all duration-500 w-12 h-12" />
              </div>
            </div>
            <h1 className="font-bold text-white mb-6 transition-all duration-500 text-4xl md:text-6xl">
              <span className="text-red-400">Conga</span> Bug Analyzer
            </h1>
            <p className="text-blue-100 mb-8 max-w-3xl mx-auto transition-all duration-500 text-xl md:text-2xl">
              Comprehensive debugging and analysis toolkit for Conga CPQ
              applications
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center transition-all duration-500">
              <Link
                to="/har"
                className="inline-flex items-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                data-discover="true"
              >
                <Monitor className="w-5 h-5 mr-2" />
                Start Debugging
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                to="/compare-tool"
                className="inline-flex items-center px-8 py-4 border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-blue-600 transition-all duration-200"
                data-discover="true"
              >
                <GitCompare className="w-5 h-5 mr-2" />
                Compare Tools
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 bg-white/5 rounded-full blur-3xl transition-all duration-700 w-64 h-64"></div>
          <div className="absolute bottom-1/4 right-1/4 bg-purple-400/10 rounded-full blur-3xl transition-all duration-700 w-96 h-96"></div>
        </div>
      </header>

      {/* Features Grid */}
      <section data-section="features-grid" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Powerful Debugging Tools
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need to analyze, debug, and optimize your Conga CPQ
            applications
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Link
              key={index}
              to={feature.link}
              className="group relative overflow-hidden bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-r ${getColorClasses(
                  feature.color
                )} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}
              ></div>

              <div className="relative p-8">
                <div
                  className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r ${getColorClasses(
                    feature.color
                  )} text-white rounded-lg mb-4 shadow-lg`}
                >
                  {feature.icon}
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                  {feature.title}
                </h3>

                <p className="text-gray-600 mb-4 leading-relaxed">
                  {feature.description}
                </p>

                <div className="flex items-center text-blue-600 font-medium group-hover:text-blue-700">
                  Learn more
                  <ArrowRight className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              {/* Hover Effect Border */}
              <div
                className={`absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-blue-200 transition-colors duration-300`}
              ></div>
            </Link>
          ))}
        </div>
      </section>

      {/* Bookmarks Section */}
      <div data-section="bookmarks">
        <BookmarksSection />
      </div>

      {/* User Guide Section */}
      <div data-section="user-guide">
        <UserGuideSection />
      </div>

      {/* Key Features Section */}
      <section data-section="key-features" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Choose Conga Bug Analyzer?
            </h2>
            <p className="text-xl text-gray-600">
              Built specifically for Conga CPQ/Platform debugging and analysis
              workflows
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 text-blue-600 rounded-full mb-4">
                <Network className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Real-time Monitoring
              </h3>
              <p className="text-gray-600">
                Monitor HTTP/WebSocket traffic as it happens with our Chrome
                DevTools integration
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-4">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Advanced Analysis
              </h3>
              <p className="text-gray-600">
                Deep-dive into request/response data with powerful comparison
                and filtering tools
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 text-purple-600 rounded-full mb-4">
                <Zap className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Developer Friendly
              </h3>
              <p className="text-gray-600">
                Intuitive interface designed for developers with JSON formatting
                and syntax highlighting
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Start Section */}
      <section data-section="quick-start" className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
            Get Started in Minutes
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-4">
                1
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Install Extension
              </h3>
              <p className="text-gray-600 text-sm">
                Load the Chrome extension in Developer Mode
              </p>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-4">
                2
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Open DevTools
              </h3>
              <p className="text-gray-600 text-sm">
                Navigate to HAR Extractor tab in Chrome DevTools
              </p>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-lg mb-4">
                3
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">
                Start Analyzing
              </h3>
              <p className="text-gray-600 text-sm">
                Monitor traffic and use our analysis tools
              </p>
            </div>
          </div>

          <Link
            to="/har"
            className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            <Monitor className="w-5 h-5 mr-2" />
            Launch HAR Extractor
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <Bug className="w-8 h-8 text-blue-400 mr-3" />
                <h3 className="text-xl font-bold"><span className="text-red-400">Conga</span> Bug Analyzer</h3>
              </div>
              <p className="text-gray-400 mb-4">
                Comprehensive debugging and analysis toolkit for Conga
                CPQ/Platform applications. Built by developers, for developers.
              </p>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-4">Tools</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link
                    to="/har"
                    className="hover:text-white transition-colors"
                  >
                    HAR Extractor
                  </Link>
                </li>
                <li>
                  <Link
                    to="/compare-tool"
                    className="hover:text-white transition-colors"
                  >
                    Compare Tool
                  </Link>
                </li>
                <li>
                  <Link
                    to="/formatter"
                    className="hover:text-white transition-colors"
                  >
                    JSON Formatter
                  </Link>
                </li>
                <li>
                  <Link
                    to="/log"
                    className="hover:text-white transition-colors"
                  >
                    Log Analyzer
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link
                    to="/compare"
                    className="hover:text-white transition-colors"
                  >
                    JSON Compare
                  </Link>
                </li>
                <li>
                  <Link
                    to="/pieces"
                    className="hover:text-white transition-colors"
                  >
                    Code Pieces
                  </Link>
                </li>
                <li>
                  <Link
                    to="/sfdc"
                    className="hover:text-white transition-colors"
                  >
                    SFDC Tools
                  </Link>
                </li>
                <li>
                  <Link
                    to="/turbo"
                    className="hover:text-white transition-colors"
                  >
                    Turbo Tools
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>
              &copy; 2025 <span className="text-red-400">Conga</span> Bug Analyzer. Built for debugging excellence.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

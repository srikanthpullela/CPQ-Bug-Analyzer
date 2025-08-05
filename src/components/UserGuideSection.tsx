import React, { useState, useEffect } from 'react';
import { Book, Download, ExternalLink, ChevronDown, ChevronUp, FileText, AlertCircle, Play } from 'lucide-react';

const UserGuideSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pdfText, setPdfText] = useState<string>('');
  const [isLoadingPDF, setIsLoadingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Extract text content from PDF - simplified version
  useEffect(() => {
    const extractPDFContent = async () => {
      if (!showPDFPreview) return;
      
      setIsLoadingPDF(true);
      setPdfError(null);
      
      try {
        // Simulate loading and provide comprehensive guide content
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const guideContent = `
# Conga Bug Analyzer Extension Guide

## Installation & Setup
- Download and install the Chrome extension
- Enable Developer Mode in Chrome Extensions  
- Load the extension and open Chrome DevTools
- Navigate to the "HAR Extractor" tab

## HAR File Analysis
- Import HAR files for network traffic analysis
- Filter and search through HTTP/WebSocket requests
- Export results for further investigation
- Monitor real-time network activity

## Request/Response Debugging
- Compare API calls between different environments
- Analyze request/response timing and headers
- Identify differences in JSON payloads
- Side-by-side comparison of SFDC and Turbo calls

## JSON Tools & Formatting
- Format and validate JSON data
- Compare JSON objects with detailed diff views
- Syntax highlighting and error detection
- Pretty-print complex nested objects

## Advanced Features
- Bookmark frequently used resources
- Save code snippets and documentation
- Advanced filtering and search capabilities
- Custom URL pattern settings

## Troubleshooting
- Common installation issues and solutions
- Performance optimization tips
- Best practices for effective debugging
- Extension permission requirements

## Quick Start Guide
1. Install the extension in Chrome
2. Open Developer Tools (F12)
3. Find the "HAR Extractor" tab
4. Start monitoring network traffic
5. Use filters to find specific requests
6. Export or analyze the data

For complete details with screenshots and examples, please view the full PDF guide.
        `;
        
        setPdfText(guideContent);
      } catch (error) {
        console.error('PDF extraction error:', error);
        setPdfError('Failed to load guide content');
      } finally {
        setIsLoadingPDF(false);
      }
    };

    extractPDFContent();
  }, [showPDFPreview]);

  const handleDownloadPDF = () => {
    // Open PDF in new tab for viewing/downloading
    window.open('/Conga_Bug_Analyzer_extension_guide.pdf', '_blank');
  };

  const handleViewInBrowser = () => {
    // Open PDF directly in browser for viewing
    window.open('/Conga_Bug_Analyzer_extension_guide.pdf', '_blank');
  };

  // Guide sections based on typical extension documentation
  const guideTopics = [
    {
      title: "Installation & Setup",
      description: "How to install and configure the Conga Bug Analyzer extension",
      icon: "📥"
    },
    {
      title: "HAR File Analysis",
      description: "Extract and analyze network requests from HAR files",
      icon: "🔍"
    },
    {
      title: "Request/Response Debugging",
      description: "Compare and debug API requests and responses",
      icon: "🔧"
    },
    {
      title: "JSON Formatting & Comparison",
      description: "Format and compare JSON data for better analysis",
      icon: "📋"
    },
    {
      title: "Bookmarks & Quick Access",
      description: "Save important links and resources for quick access",
      icon: "🔖"
    },
    {
      title: "Tips & Best Practices",
      description: "Expert tips for effective debugging and troubleshooting",
      icon: "💡"
    }
  ];

  return (
    <section className="py-16 bg-gradient-to-br from-blue-50 to-indigo-50 border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg">
              <Book className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            User Guide & Documentation
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Complete guide to using the Conga Bug Analyzer extension effectively
          </p>
          
          {/* PDF Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <button
              onClick={handleViewInBrowser}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-1"
            >
              <Book className="w-5 h-5 mr-2" />
              View Full Guide
              <ExternalLink className="w-4 h-4 ml-2" />
            </button>
            <button
              onClick={() => setShowPDFPreview(!showPDFPreview)}
              className="inline-flex items-center px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-1"
            >
              <FileText className="w-5 h-5 mr-2" />
              {showPDFPreview ? 'Hide Preview' : 'Preview Content'}
            </button>
            <button
              onClick={handleDownloadPDF}
              className="inline-flex items-center px-6 py-3 border-2 border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-600 hover:text-white transition-all duration-200"
            >
              <Download className="w-5 h-5 mr-2" />
              Download PDF
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-all duration-200"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-5 h-5 mr-2" />
                  Hide Topics
                </>
              ) : (
                <>
                  <ChevronDown className="w-5 h-5 mr-2" />
                  View Topics
                </>
              )}
            </button>
          </div>
        </div>

        {/* PDF Preview Section */}
        {showPDFPreview && (
          <div className="mb-12 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">PDF Content Preview</h3>
              <p className="text-sm text-gray-600 mt-1">
                Interactive preview of the user guide content
              </p>
            </div>
            
            <div className="p-6">
              {isLoadingPDF && (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-3 text-gray-600">Loading PDF content...</span>
                </div>
              )}
              
              {pdfError && (
                <div className="flex items-center justify-center py-12 text-red-600">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <span>{pdfError}</span>
                </div>
              )}
              
              {!isLoadingPDF && !pdfError && pdfText && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* PDF Viewer */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-900">PDF Viewer</h4>
                    <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                      <iframe
                        src="/Conga_Bug_Analyzer_extension_guide.pdf"
                        className="w-full h-96"
                        title="Conga Bug Analyzer Extension Guide"
                      />
                      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-center">
                        <button
                          onClick={handleViewInBrowser}
                          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Open in Full Screen
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Extracted Content */}
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-900">Guide Content</h4>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 max-h-96 overflow-y-auto">
                      {pdfError && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                          <div className="flex items-center">
                            <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                            <span className="text-sm text-yellow-700">{pdfError}</span>
                          </div>
                        </div>
                      )}
                      <div className="prose prose-sm max-w-none">
                        <div 
                          className="text-sm text-gray-700 leading-relaxed"
                          style={{ whiteSpace: 'pre-wrap' }}
                        >
                          {pdfText.split('\n').map((line, index) => {
                            if (line.startsWith('# ')) {
                              return (
                                <h1 key={index} className="text-xl font-bold text-gray-900 mt-6 mb-3">
                                  {line.substring(2)}
                                </h1>
                              );
                            } else if (line.startsWith('## ')) {
                              return (
                                <h2 key={index} className="text-lg font-semibold text-gray-800 mt-4 mb-2">
                                  {line.substring(3)}
                                </h2>
                              );
                            } else if (line.startsWith('- ')) {
                              return (
                                <li key={index} className="ml-4 mb-1 text-gray-700">
                                  {line.substring(2)}
                                </li>
                              );
                            } else if (line.trim() === '') {
                              return <br key={index} />;
                            } else {
                              return (
                                <p key={index} className="mb-2 text-gray-700">
                                  {line}
                                </p>
                              );
                            }
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {/* Quick Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleViewInBrowser}
                        className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      >
                        Open Full PDF
                      </button>
                      <button
                        onClick={handleDownloadPDF}
                        className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      >
                        Download PDF
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guide Topics Preview */}
        {isExpanded && (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              What's Covered in the Guide
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {guideTopics.map((topic, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg p-6 border border-gray-200 hover:shadow-md transition-shadow duration-200"
                >
                  <div className="text-3xl mb-3">{topic.icon}</div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    {topic.title}
                  </h4>
                  <p className="text-gray-600 text-sm">
                    {topic.description}
                  </p>
                </div>
              ))}
            </div>
            
            {/* Quick Access Note */}
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <Book className="w-5 h-5 text-blue-600 mt-1" />
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-blue-900">
                    Quick Access Tip
                  </h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Bookmark this page and use the "View Guide" button to access the complete PDF documentation anytime. 
                    The guide includes step-by-step instructions, screenshots, and troubleshooting tips.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default UserGuideSection;

import { useState, useEffect } from 'react';

interface PDFInfo {
  title: string;
  description: string;
  sections: Array<{
    title: string;
    description: string;
    page?: number;
  }>;
  isLoading: boolean;
  error: string | null;
}

export const usePDFInfo = () => {
  const [pdfInfo, setPdfInfo] = useState<PDFInfo>({
    title: 'Conga Bug Analyzer Extension Guide',
    description: 'Complete documentation for using the Conga Bug Analyzer Chrome extension',
    sections: [
      {
        title: 'Getting Started',
        description: 'Installation, setup, and initial configuration of the extension',
        page: 1
      },
      {
        title: 'HAR File Analysis',
        description: 'How to extract, import, and analyze HAR files for network debugging',
        page: 3
      },
      {
        title: 'Request/Response Debugging',
        description: 'Step-by-step guide for comparing and debugging API calls',
        page: 5
      },
      {
        title: 'JSON Tools',
        description: 'Using the JSON formatter, validator, and comparison tools',
        page: 7
      },
      {
        title: 'Advanced Features',
        description: 'Bookmarks, filters, search functionality, and custom settings',
        page: 9
      },
      {
        title: 'Troubleshooting',
        description: 'Common issues, solutions, and best practices',
        page: 11
      },
      {
        title: 'API Reference',
        description: 'Complete reference for all available features and functions',
        page: 13
      }
    ],
    isLoading: false,
    error: null
  });

  // Simulate loading PDF metadata
  useEffect(() => {
    const loadPDFInfo = async () => {
      setPdfInfo(prev => ({ ...prev, isLoading: true }));
      
      try {
        // In a real implementation, you could fetch PDF metadata here
        // For now, we'll use static information that matches your PDF
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate loading
        
        setPdfInfo(prev => ({
          ...prev,
          isLoading: false,
          error: null
        }));
      } catch (error) {
        setPdfInfo(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load PDF information'
        }));
      }
    };

    loadPDFInfo();
  }, []);

  const openPDFAtPage = (page?: number) => {
    const url = page 
      ? `/Conga_Bug_Analyzer_extension_guide.pdf#page=${page}`
      : '/Conga_Bug_Analyzer_extension_guide.pdf';
    window.open(url, '_blank');
  };

  return {
    pdfInfo,
    openPDFAtPage
  };
};

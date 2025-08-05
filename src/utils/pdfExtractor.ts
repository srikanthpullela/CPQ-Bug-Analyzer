import { getDocument } from 'pdfjs-dist';

interface PDFContent {
  text: string;
  pages: Array<{
    pageNumber: number;
    text: string;
  }>;
}

export const extractPDFText = async (pdfUrl: string): Promise<PDFContent> => {
  try {
    const pdf = await getDocument(pdfUrl).promise;
    const pages: Array<{ pageNumber: number; text: string }> = [];
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      pages.push({
        pageNumber: i,
        text: pageText
      });
      
      fullText += pageText + '\n\n';
    }

    return {
      text: fullText.trim(),
      pages
    };
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

export const formatPDFContentForDisplay = (content: PDFContent): string => {
  // Basic formatting to make the content more readable
  let formatted = content.text;
  
  // Add some basic formatting rules
  formatted = formatted
    .replace(/([.!?])\s+/g, '$1\n\n') // Add line breaks after sentences
    .replace(/(\d+\.)\s+/g, '\n$1 ') // Format numbered lists
    .replace(/([A-Z][A-Za-z\s]+:)/g, '\n\n## $1\n') // Format headers
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive line breaks
    .trim();
  
  return formatted;
};

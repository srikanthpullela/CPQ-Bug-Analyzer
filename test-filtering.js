// Test script to verify URL pattern filtering
console.log('🧪 Testing URL pattern filtering...');

// Mock localStorage for testing
const mockStorage = {};
const localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: (key) => { delete mockStorage[key]; }
};

// Copy the filtering functions from devtools.ts for testing
function getDefaultUrlPatterns() {
  return [
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
}

function saveUrlPatternsToStorage(patterns) {
  try {
    localStorage.setItem('har_extractor_url_patterns', JSON.stringify(patterns));
  } catch (error) {
    console.error('Error saving URL patterns to localStorage:', error);
  }
}

function getUrlPatternsFromStorage() {
  try {
    const stored = localStorage.getItem('har_extractor_url_patterns');
    if (stored) {
      const patterns = JSON.parse(stored);
      
      // STRICT FILTERING: Only allow ApexRemote and CongaCloud patterns
      const allowedPatterns = ['apexremote', 'congacloud'];
      const filteredPatterns = patterns.filter((p) => {
        return allowedPatterns.includes(p.pattern.toLowerCase()) && 
               (p.name.toLowerCase() === 'apexremote' || p.name.toLowerCase() === 'congacloud');
      });
      
      // If we filtered out patterns or have no valid patterns, reset to defaults
      if (filteredPatterns.length !== patterns.length || filteredPatterns.length === 0) {
        console.log('Filtering out invalid patterns or resetting to defaults - only ApexRemote and CongaCloud allowed');
        const defaults = getDefaultUrlPatterns();
        saveUrlPatternsToStorage(defaults);
        return defaults;
      }
      
      return filteredPatterns;
    }
  } catch (error) {
    console.warn('Error reading URL patterns from localStorage:', error);
  }
  
  // First time or error - set defaults
  const defaults = getDefaultUrlPatterns();
  saveUrlPatternsToStorage(defaults);
  return defaults;
}

function shouldProcessUrl(url) {
  const patterns = getUrlPatternsFromStorage();
  
  // Filter out static assets with comprehensive patterns
  const staticAssetExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', 
    '.ttf', '.woff', '.woff2', '.eot', '.map', '.json', '.xml',
    'favicon', '.webp', '.bmp', '.tiff', '.scss', '.less', '.ts.map',
    '.min.js', '.min.css', '.chunk.js', '.bundle.js', '.vendor.js',
    '.fonts', '.font', '.otf', '.woff2', '/assets/', '/static/',
    'googletagmanager', 'google-analytics', 'analytics.js',
    'gtag/js', 'doubleclick', 'googleadservices', 'facebook.net',
    'hotjar', 'intercom', 'zendesk', '/images/', '/img/', '/icons/'
  ];
  
  const isStaticAsset = staticAssetExtensions.some(ext => 
    url.toLowerCase().includes(ext.toLowerCase())
  );
  
  if (isStaticAsset) {
    return null;
  }
  
  // STRICT FILTERING: Only process ApexRemote and CongaCloud URLs
  const allowedPatterns = ['apexremote', 'congacloud'];
  const matchedPattern = patterns.find(p => p.enabled && url.includes(p.pattern));
  
  if (matchedPattern && allowedPatterns.includes(matchedPattern.pattern.toLowerCase())) {
    return matchedPattern;
  }
  
  return null;
}

// Test cases
const testUrls = [
  'https://example.com/apex/apexremote',
  'https://example.com/api/congacloud/v1',
  'https://force.com/services/apexrest',
  'https://salesforce.com/services/apexrest',
  'https://lightning.force.com/services/apexrest',
  'https://my.salesforce.com/services/apexrest',
  'https://example.com/static/app.js',
  'https://example.com/favicon.ico',
  'https://example.com/api/congacloud/endpoint',
  'https://other.domain.com/apexremote/test'
];

console.log('\n🔍 Testing with fresh localStorage (should only show ApexRemote and CongaCloud):');
testUrls.forEach(url => {
  const result = shouldProcessUrl(url);
  console.log(`${url}: ${result ? result.name : 'FILTERED OUT'}`);
});

// Test with some malicious localStorage data
console.log('\n🦹 Testing with malicious localStorage patterns:');
const maliciousPatterns = [
  { name: "ApexRemote", pattern: "apexremote", type: "apex", enabled: true },
  { name: "CongaCloud", pattern: "congacloud", type: "http", enabled: true },
  { name: "Force.com", pattern: "force.com", type: "apex", enabled: true },
  { name: "Salesforce", pattern: "salesforce.com", type: "apex", enabled: true },
  { name: "Lightning", pattern: "lightning.force.com", type: "apex", enabled: true }
];

localStorage.setItem('har_extractor_url_patterns', JSON.stringify(maliciousPatterns));

console.log('After setting malicious patterns in localStorage:');
testUrls.forEach(url => {
  const result = shouldProcessUrl(url);
  console.log(`${url}: ${result ? result.name : 'FILTERED OUT'}`);
});

console.log('\n✅ Test completed. Only ApexRemote and CongaCloud should be processed.');

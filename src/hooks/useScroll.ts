import { useState, useEffect } from 'react';

export const useScroll = () => {
  const [scrollY, setScrollY] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up');
  const [isScrolled, setIsScrolled] = useState(false);
  const [visibleSections, setVisibleSections] = useState<string[]>([]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;
    let sectionCleanup: (() => void) | null = null;
    const SCROLL_THRESHOLD = 10; // Minimum scroll distance to trigger direction change

    const updateScrollData = () => {
      const currentScrollY = window.scrollY;
      const scrollDifference = Math.abs(currentScrollY - lastScrollY);
      
      setScrollY(currentScrollY);
      setIsScrolled(currentScrollY > 100);
      
      // Only update direction if scroll difference is significant
      if (scrollDifference > SCROLL_THRESHOLD) {
        if (currentScrollY > lastScrollY && currentScrollY > 100) {
          setScrollDirection('down');
        } else if (currentScrollY < lastScrollY) {
          setScrollDirection('up');
        }
        lastScrollY = currentScrollY;
      }
      
      ticking = false;
    };

    const requestScrollUpdate = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollData);
        ticking = true;
      }
    };

    // Section intersection observer
    const observeSections = () => {
      const updateVisibleSections = () => {
        const newVisible: string[] = [];
        const currentScrollY = window.scrollY;
        
        // Get actual section positions
        const featuresGrid = document.querySelector('[data-section="features-grid"]');
        const bookmarks = document.querySelector('[data-section="bookmarks"]');
        const keyFeatures = document.querySelector('[data-section="key-features"]');
        const quickStart = document.querySelector('[data-section="quick-start"]');
        
        // Only add sections if we've scrolled past their actual start position
        if (featuresGrid) {
          const featuresRect = featuresGrid.getBoundingClientRect();
          const featuresTop = featuresRect.top + currentScrollY;
          if (currentScrollY >= featuresTop - 100) { // 100px buffer before section
            newVisible.push('features-grid');
          }
        }
        
        if (bookmarks) {
          const bookmarksRect = bookmarks.getBoundingClientRect();
          const bookmarksTop = bookmarksRect.top + currentScrollY;
          if (currentScrollY >= bookmarksTop - 100) {
            newVisible.push('bookmarks');
          }
        }
        
        if (keyFeatures) {
          const keyFeaturesRect = keyFeatures.getBoundingClientRect();
          const keyFeaturesTop = keyFeaturesRect.top + currentScrollY;
          if (currentScrollY >= keyFeaturesTop - 100) {
            newVisible.push('key-features');
          }
        }
        
        if (quickStart) {
          const quickStartRect = quickStart.getBoundingClientRect();
          const quickStartTop = quickStartRect.top + currentScrollY;
          if (currentScrollY >= quickStartTop - 100) {
            newVisible.push('quick-start');
          }
        }
        
        setVisibleSections(newVisible);
      };

      // Update on scroll only
      const scrollHandler = () => {
        updateVisibleSections();
      };

      window.addEventListener('scroll', scrollHandler, { passive: true });

      return () => {
        window.removeEventListener('scroll', scrollHandler);
      };
    };

    window.addEventListener('scroll', requestScrollUpdate, { passive: true });
    
    // Delay section observation to ensure DOM is ready
    const timer = setTimeout(() => {
      sectionCleanup = observeSections();
    }, 500); // Increased delay

    return () => {
      window.removeEventListener('scroll', requestScrollUpdate);
      clearTimeout(timer);
      if (sectionCleanup) {
        sectionCleanup();
      }
    };
  }, []);

  return {
    scrollY,
    scrollDirection,
    isScrolled,
    visibleSections
  };
};

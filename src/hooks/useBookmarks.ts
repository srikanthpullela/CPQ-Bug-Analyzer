import { useState, useEffect } from 'react';

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description?: string;
  createdAt: Date;
}

export const useBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load bookmarks from Chrome storage on component mount
  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    try {
      const chromeStorage = (window as any)?.chrome?.storage;
      if (chromeStorage) {
        chromeStorage.local.get(['bookmarks'], (result: any) => {
          const savedBookmarks = result.bookmarks || [];
          setBookmarks(savedBookmarks);
          setIsLoading(false);
        });
      } else {
        // Fallback for development environment
        const savedBookmarks = localStorage.getItem('bookmarks');
        if (savedBookmarks) {
          setBookmarks(JSON.parse(savedBookmarks));
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error);
      setIsLoading(false);
    }
  };

  const saveBookmarks = async (newBookmarks: Bookmark[]) => {
    try {
      const chromeStorage = (window as any)?.chrome?.storage;
      if (chromeStorage) {
        chromeStorage.local.set({ bookmarks: newBookmarks }, () => {
          setBookmarks(newBookmarks);
        });
      } else {
        // Fallback for development environment
        localStorage.setItem('bookmarks', JSON.stringify(newBookmarks));
        setBookmarks(newBookmarks);
      }
    } catch (error) {
      console.error('Error saving bookmarks:', error);
    }
  };

  const addBookmark = async (title: string, url: string, description?: string) => {
    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      title,
      url,
      description,
      createdAt: new Date()
    };

    const updatedBookmarks = [...bookmarks, newBookmark];
    await saveBookmarks(updatedBookmarks);
  };

  const removeBookmark = async (id: string) => {
    const updatedBookmarks = bookmarks.filter(bookmark => bookmark.id !== id);
    await saveBookmarks(updatedBookmarks);
  };

  const updateBookmark = async (id: string, updates: Partial<Bookmark>) => {
    const updatedBookmarks = bookmarks.map(bookmark =>
      bookmark.id === id ? { ...bookmark, ...updates } : bookmark
    );
    await saveBookmarks(updatedBookmarks);
  };

  return {
    bookmarks,
    isLoading,
    addBookmark,
    removeBookmark,
    updateBookmark,
    loadBookmarks
  };
};

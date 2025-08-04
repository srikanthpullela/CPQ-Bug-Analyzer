import React, { useState, useRef, useEffect } from 'react';
import { Bookmark, ChevronDown, ChevronUp, Plus, Trash2, ExternalLink, X } from 'lucide-react';
import { useBookmarks, Bookmark as BookmarkType } from '../hooks/useBookmarks';

const BookmarksSection: React.FC = () => {
  const { bookmarks, addBookmark, removeBookmark, isLoading } = useBookmarks();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [newBookmark, setNewBookmark] = useState({
    title: '',
    url: '',
    description: ''
  });

  // Handle click outside modal to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowModal(false);
        setNewBookmark({ title: '', url: '', description: '' });
      }
    };

    if (showModal) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [showModal]);

  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newBookmark.title && newBookmark.url) {
      await addBookmark(newBookmark.title, newBookmark.url, newBookmark.description);
      setNewBookmark({ title: '', url: '', description: '' });
      setShowModal(false);
    }
  };

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getInitials = (title: string) => {
    return title.charAt(0).toUpperCase();
  };

  const getAvatarColor = (title: string) => {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-yellow-500',
      'bg-indigo-500',
      'bg-pink-500',
      'bg-teal-500'
    ];
    const index = title.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <>
      {/* Bookmarks Section */}
      <section className="py-16 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <div className="flex items-center justify-center w-12 h-12 bg-red-100 text-red-600 rounded-full mr-4">
                <Bookmark className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Quick Bookmarks</h2>
                <p className="text-gray-600 mt-1">Save important links and resources</p>
              </div>
              <span className="ml-4 bg-red-500 text-white text-xs px-3 py-1 rounded-full font-medium">
                {bookmarks.length}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Bookmark
              </button>
              
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    Expand
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Bookmarks Content */}
          {isExpanded && (
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                  <p className="mt-2 text-gray-500">Loading bookmarks...</p>
                </div>
              ) : bookmarks.length === 0 ? (
                <div className="text-center py-12">
                  <Bookmark className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No bookmarks yet</h3>
                  <p className="text-gray-500 mb-4">Start building your collection of important links</p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Bookmark
                  </button>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {bookmarks.map((bookmark) => (
                      <div
                        key={bookmark.id}
                        className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${getAvatarColor(bookmark.title)}`}>
                              {getInitials(bookmark.title)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-gray-900 truncate group-hover:text-red-600 transition-colors">
                                {bookmark.title}
                              </h4>
                              {bookmark.description && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                  {bookmark.description}
                                </p>
                              )}
                              <button
                                onClick={() => handleOpenLink(bookmark.url)}
                                className="text-xs text-blue-600 hover:text-blue-800 mt-2 flex items-center group/link"
                              >
                                Open link
                                <ExternalLink className="w-3 h-3 ml-1 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => removeBookmark(bookmark.id)}
                            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Add Bookmark Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div ref={modalRef} className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Add New Bookmark</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setNewBookmark({ title: '', url: '', description: '' });
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddBookmark} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  placeholder="Enter bookmark title"
                  value={newBookmark.title}
                  onChange={(e) => setNewBookmark({ ...newBookmark, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL *
                </label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={newBookmark.url}
                  onChange={(e) => setNewBookmark({ ...newBookmark, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  placeholder="Optional description"
                  value={newBookmark.description}
                  onChange={(e) => setNewBookmark({ ...newBookmark, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Add Bookmark
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setNewBookmark({ title: '', url: '', description: '' });
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default BookmarksSection;

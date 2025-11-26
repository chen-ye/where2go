import { Search, RefreshCw } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  const handleRecomputeAll = async () => {
    setRecomputing(true);
    setMenuOpen(false);

    try {
      const response = await fetch('/api/routes/recompute', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Recompute complete!\nSuccess: ${result.successCount}\nErrors: ${result.errorCount}\nTotal: ${result.total}`);
        // Optionally reload the page or refresh route data
        window.location.reload();
      } else {
        alert('Failed to recompute routes');
      }
    } catch (error) {
      console.error('Error recomputing routes:', error);
      alert('Error recomputing routes');
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div className="top-bar">
      <div className="logo-container-wrapper" ref={menuRef}>
        <div
          className="logo-container"
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ cursor: 'pointer' }}
        >
          where2go
        </div>
        {menuOpen && (
          <div className="app-menu">
            <button
              type="button"
              className="menu-item"
              onClick={handleRecomputeAll}
              disabled={recomputing}
            >
              <RefreshCw size={16} />
              {recomputing ? 'Recomputing...' : 'Recompute All Routes'}
            </button>
          </div>
        )}
      </div>
      <div className="search-container">
        <input type="text" className="search-input" placeholder="search" />
        <Search className="search-icon" size={18} />
      </div>
    </div>
  );
}

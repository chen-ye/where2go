import { Search, RefreshCw } from 'lucide-react';
import './TopBar.css';
import { useState, forwardRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/DropdownMenu';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TopBar = forwardRef<HTMLDivElement, TopBarProps>(
  ({ searchQuery, onSearchChange }, ref) => {
    const [recomputing, setRecomputing] = useState(false);

    const handleRecomputeAll = async () => {
      setRecomputing(true);

      try {
        const response = await fetch('/api/routes/recompute', {
          method: 'POST',
        });

        if (response.ok) {
          const result = await response.json();
          alert(
            `Recompute complete!\nSuccess: ${result.successCount}\nErrors: ${result.errorCount}\nTotal: ${result.total}`
          );
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
      <div className="top-bar" ref={ref}>
        <div className="logo-container-wrapper">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="logo-container" style={{ cursor: 'pointer' }}>
                where2go
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onSelect={handleRecomputeAll}
                disabled={recomputing}
              >
                <RefreshCw size={16} style={{ marginRight: 8 }} />
                {recomputing ? 'Recomputing...' : 'Recompute All Routes'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <Search className="search-icon" size={18} />
        </div>
      </div>
    );
  }
);

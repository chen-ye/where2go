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
  onRecomputeAll: () => void;
  recomputing: boolean;
}

export const TopBar = forwardRef<HTMLDivElement, TopBarProps>(
  ({ searchQuery, onSearchChange, onRecomputeAll, recomputing }, ref) => {

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
                onSelect={onRecomputeAll}
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

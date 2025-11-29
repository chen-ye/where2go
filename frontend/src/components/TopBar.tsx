import { Search, RefreshCw, Loader2 } from 'lucide-react';
import './TopBar.css';
import { forwardRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/DropdownMenu';
import { FilterPanel } from './FilterPanel';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRecomputeAll: () => void;
  recomputing: boolean;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  availableDomains: string[];
  selectedDomains: string[];
  onToggleDomain: (domain: string) => void;
  onClearDomains: () => void;
  minDistance: number;
  maxDistance: number;
  distanceRange: [number, number] | null;
  onDistanceChange: (range: [number, number]) => void;
  onClearDistance: () => void;
  fetchingRoutes: boolean;
}

export const TopBar = forwardRef<HTMLDivElement, TopBarProps>(
  ({ searchQuery, onSearchChange, onRecomputeAll, recomputing, availableTags, selectedTags, onToggleTag, onClearTags, availableDomains, selectedDomains, onToggleDomain, onClearDomains, minDistance, maxDistance, distanceRange, onDistanceChange, onClearDistance, fetchingRoutes }, ref) => {

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
          <div className="search-icon-container">
            {fetchingRoutes ? (
              <Loader2 className="search-icon search-spinner" size={18} />
            ) : (
              <Search className="search-icon" size={18} />
            )}
          </div>
        </div>
        <FilterPanel
          availableTags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={onToggleTag}
          onClearTags={onClearTags}
          availableDomains={availableDomains}
          selectedDomains={selectedDomains}
          onToggleDomain={onToggleDomain}
          onClearDomains={onClearDomains}
          minDistance={minDistance}
          maxDistance={maxDistance}
          distanceRange={distanceRange}
          onDistanceChange={onDistanceChange}
          onClearDistance={onClearDistance}
        />
      </div>
    );
  }
);

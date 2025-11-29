import type { Route } from "../types";
import { METERS_TO_MILES, METERS_TO_FEET } from "../utils/geo";
import "./SearchResultsView.css";
import { Check, X } from "lucide-react";
import { RouteStat } from "./RouteStat";
import { Tag } from "./ui/Tag.tsx";

interface SearchResultsViewProps {
  results: Route[];
  searchQuery: string;
  onSelectRoute: (id: number, source: 'search') => void;
  onClose: () => void;
  onHoverRoute: (id: number | null) => void;
  selectedTags?: string[];
  selectedDomains?: string[];
}

export function SearchResultsView({
  results,
  searchQuery,
  onSelectRoute,
  onClose,
  onHoverRoute,
  selectedTags = [],
  selectedDomains = [],
}: SearchResultsViewProps) {
  return (
    <div className="search-results-view">
      <div className="search-results-header">
        <div className="search-results-title-row">
          <h3><span className="search-results-query">
            {searchQuery}
            {selectedDomains.map(domain => (
              <Tag key={domain} className="filter-badge domain-badge">
                {domain}
              </Tag>
            ))}
            {selectedTags.map(tag => (
              <Tag key={tag} className="filter-badge tag-badge">
                #{tag}
              </Tag>
            ))}
          </span> · <span className="search-results-count">{results.length}</span> Routes</h3>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="search-results-list"
        onPointerLeave={() => {
          onHoverRoute(null);
        }}
      >
        {results.map((route) => (
          <div
            className="search-result-row"
            key={route.id}
            data-id={route.id}
            onClick={() => onSelectRoute(route.id, 'search')}
            onPointerEnter={() => {
              onHoverRoute(route.id);
            }}
          >
            <div className="col-title" title={route.title} data-completed={route.is_completed}>
              {route.title} {route.is_completed && <Check size={16}/>}
            </div>
            <RouteStat
              value={
                route.distance
                  ? route.distance * METERS_TO_MILES
                  : route.distance
              }
              units="mi"
              decimals={1}
              className="col-stat"
            />
            <RouteStat
              value={
                route.total_ascent
                  ? route.total_ascent * METERS_TO_FEET
                  : route.total_ascent
              }
              units="ft"
              className="col-stat"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

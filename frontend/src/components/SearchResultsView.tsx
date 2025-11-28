import type { Route } from "../types";
import { METERS_TO_MILES, METERS_TO_FEET } from "../utils/geo";
import "./SearchResultsView.css";
import { X } from "lucide-react";
import { RouteStat } from "./RouteStat";

interface SearchResultsViewProps {
  results: Route[];
  onSelectRoute: (id: number, source?: 'map' | 'search') => void;
  onClose: () => void;
}

export function SearchResultsView({
  results,
  onSelectRoute,
  onClose,
}: SearchResultsViewProps) {
  return (
    <div className="search-results-view">
      <div className="search-results-header">
        <h3>Search Results · {results.length} Routes</h3>
        <button type="button" className="icon-button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="search-results-list">
        {results.map((route) => (
          <div
            key={route.id}
            className="search-result-row"
            onClick={() => onSelectRoute(route.id, 'search')}
          >
            <div className="col-title" title={route.title}>
              {route.title}
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

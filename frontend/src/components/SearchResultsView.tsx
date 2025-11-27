import type { Route } from "../types";
import { METERS_TO_MILES, METERS_TO_FEET } from "../utils/geo";
import "./SearchResultsView.css";
import { X } from "lucide-react";

interface SearchResultsViewProps {
  results: Route[];
  onSelectRoute: (id: number) => void;
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
        <h3>Search Results · <span className="search-results-count">{results.length} Routes</span></h3>
        <button type="button" className="icon-button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="search-results-list">
        {results.map((route) => (
          <div
            key={route.id}
            className="search-result-row"
            onClick={() => onSelectRoute(route.id)}
          >
            <div className="col-title" title={route.title}>
              {route.title}
            </div>
            <div className="col-stat">
              {route.distance
                ? (route.distance * METERS_TO_MILES).toFixed(1)
                : "--"}{" "}
              mi
            </div>
            <div className="col-stat">
              {route.total_ascent
                ? Math.round(route.total_ascent * METERS_TO_FEET)
                : "--"}{" "}
              ft
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

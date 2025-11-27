import { useEffect, useState, useMemo, useRef } from "react";
import { useDebounce } from "use-debounce";
import "./App.css";
import { TopBar } from "./components/TopBar.tsx";
import { MapView } from "./components/MapView.tsx";
import { BottomPanel } from "./components/BottomPanel.tsx";
import type { Route, RouteDataPoint } from "./types.ts";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import {
  getDistanceFromLatLonInMeters,
  calculateGrade,
} from "./utils/geo";
import { SearchResultsView } from "./components/SearchResultsView.tsx";
import { RouteDetailsView } from "./components/RouteDetailsView.tsx";

const SEARCH_PARAM_ROUTE = "route";
const SEARCH_PARAM_QUERY = "q";
const SEARCH_PARAM_SHOW_GRADE = "show-grade";

function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [initialSearchParams] = useState(() => new URLSearchParams(window.location.search));
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(initialSearchParams.get(SEARCH_PARAM_ROUTE) ? parseInt(initialSearchParams.get(SEARCH_PARAM_ROUTE) || "") : null);
  const [searchQuery, setSearchQuery] = useState(initialSearchParams.get(SEARCH_PARAM_QUERY) || "");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);
  const [displayGradeOnMap, setDisplayGradeOnMap] = useState(initialSearchParams.get(SEARCH_PARAM_SHOW_GRADE) === "true");
  const [viewState, setViewState] = useState({
    longitude: -122.2, // Default to Bellevue area based on image
    latitude: 47.61,
    zoom: 11,
  });

  const [hoveredLocation, setHoveredLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  // Update URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (searchQuery) {
      params.set(SEARCH_PARAM_QUERY, searchQuery);
    } else {
      params.delete(SEARCH_PARAM_QUERY);
    }
    if (selectedRouteId) {
      params.set(SEARCH_PARAM_ROUTE, selectedRouteId.toString());
    } else {
      params.delete(SEARCH_PARAM_ROUTE);
    }
    if (displayGradeOnMap) {
      params.set(SEARCH_PARAM_SHOW_GRADE, "true");
    } else {
      params.delete(SEARCH_PARAM_SHOW_GRADE);
    }
    const newUrl =
      window.location.pathname +
      (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", newUrl);
  }, [searchQuery, selectedRouteId, displayGradeOnMap]);

  useEffect(() => {
    fetchRoutes();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [debouncedSearchQuery]); // Refetch when query changes

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchRoutes = async () => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const url = new URL("/api/routes", window.location.origin);
      // Use the current value of debouncedSearchQuery (or pass it as arg if needed, but here it's fine)
      // Note: If called from outside useEffect, we might want to use the latest state.
      // However, searchQuery updates before debouncedSearchQuery.
      // If we use searchQuery here, we might fetch based on non-debounced value if called directly.
      // But fetchRoutes is mainly called by useEffect on debounced change.
      // When called by handleUpdateCompleted, we probably want the current debounced search query context?
      // Actually, if we use searchQuery here, and fetchRoutes is called by useEffect(debouncedSearchQuery),
      // it works because by the time debouncedSearchQuery updates, searchQuery is already updated.
      if (searchQuery) {
        url.searchParams.set("search-regex", searchQuery);
      }

      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      setRoutes(data);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // Request was aborted, ignore
        return;
      }
      console.error("Failed to fetch routes", e);
    }
  };

  const handleUpdateCompleted = async (id: number, isCompleted: boolean) => {
    try {
      const response = await fetch(`/api/routes/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_completed: isCompleted }),
      });
      if (response.ok) {
        await fetchRoutes();
      } else {
        console.error("Failed to update completed status");
      }
    } catch (error) {
      console.error("Error updating completed status:", error);
    }
  };

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  const routeData = useMemo(() => {
    if (!selectedRoute || !selectedRoute.geojson) return [];

    const geojson = selectedRoute.geojson;
    const coords =
      geojson.type === "LineString"
        ? geojson.coordinates
        : geojson.coordinates[0];

    if (!coords || coords.length === 0) return [];

    const points: RouteDataPoint[] = [];
    let totalDist = 0;

    for (let i = 0; i < coords.length; i++) {
      const [lon, lat, ele] = coords[i];
      let grade = 0;

      if (i > 0) {
        const [prevLon, prevLat] = coords[i - 1];
        const distMeters = getDistanceFromLatLonInMeters(
          prevLat,
          prevLon,
          lat,
          lon
        );
        totalDist += distMeters;
        grade = calculateGrade(coords[i - 1], coords[i]);
      }

      points.push({
        distance: totalDist,
        elevation: ele || 0,
        lat,
        lon,
        grade,
      });
    }
    return points;
  }, [selectedRoute]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<number | null>(null);

  const handleConfirmDelete = async () => {
    if (routeToDelete !== null) {
      await fetch(`/api/routes/${routeToDelete}`, { method: "DELETE" });
      setSelectedRouteId(null);
      fetchRoutes();
      setRouteToDelete(null);
    }
    setDeleteConfirmOpen(false);
  };

  const handleUpdateTags = async (id: number, newTags: string[]) => {
    await fetch(`/api/routes/${id}`, {
      method: "PUT",
      body: JSON.stringify({ tags: newTags }),
      headers: { "Content-Type": "application/json" },
    });
    fetchRoutes();
  };

  const handleSelectRoute = (id: number | null) => {
    setSelectedRouteId(id);
  };

  return (
    <>
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <MapView
        routes={routes}
        selectedRouteId={selectedRouteId}
        onSelectRoute={handleSelectRoute}
        viewState={viewState}
        onMove={setViewState}
        hoveredLocation={hoveredLocation}
        onHover={setHoveredLocation}
        displayGradeOnMap={displayGradeOnMap}
        routeData={routeData}
      />
      {(selectedRoute || searchQuery) && (
        <BottomPanel>
          {selectedRoute ? (
            <RouteDetailsView
              route={selectedRoute}
              routeData={routeData}
              onClose={() => setSelectedRouteId(null)}
              onDelete={(id) => {
                setRouteToDelete(id);
                setDeleteConfirmOpen(true);
              }}
              onUpdateTags={handleUpdateTags}
              onUpdateCompleted={handleUpdateCompleted}
              hoveredLocation={hoveredLocation}
              onHover={setHoveredLocation}
              displayGradeOnMap={displayGradeOnMap}
              onToggleDisplayGradeOnMap={setDisplayGradeOnMap}
            />
          ) : (
            <SearchResultsView
              results={routes}
              onSelectRoute={handleSelectRoute}
              onClose={() => setSearchQuery("")}
            />
          )}
        </BottomPanel>
      )}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Route"
        description="Are you sure you want to delete this route? This action cannot be undone."
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

export default App;

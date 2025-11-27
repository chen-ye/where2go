import { useEffect, useState, useMemo } from "react";
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
  }, [searchQuery]); // Refetch when query changes

  // TODO: this should be debounced, and use an abort signal to cancel previous requests
  const fetchRoutes = async () => {
    try {
      const url = new URL("/api/routes", window.location.origin);
      if (searchQuery) {
        url.searchParams.set("search-regex", searchQuery);
      }
      const res = await fetch(url);
      const data = await res.json();
      setRoutes(data);
    } catch (e) {
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

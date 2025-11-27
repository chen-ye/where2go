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
function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -122.2, // Default to Bellevue area based on image
    latitude: 47.61,
    zoom: 11,
  });

  const [hoveredLocation, setHoveredLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const res = await fetch("/api/routes");
      const data = await res.json();
      setRoutes(data);
    } catch (e) {
      console.error("Failed to fetch routes", e);
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
  const [displayGradeOnMap, setDisplayGradeOnMap] = useState(false);

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
      <TopBar />
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
      {selectedRoute && (
        <BottomPanel
          route={selectedRoute}
          routeData={routeData}
          onClose={() => setSelectedRouteId(null)}
          onDelete={(id) => {
            setRouteToDelete(id);
            setDeleteConfirmOpen(true);
          }}
          onUpdateTags={handleUpdateTags}
          hoveredLocation={hoveredLocation}
          onHover={setHoveredLocation}
          displayGradeOnMap={displayGradeOnMap}
          onToggleDisplayGradeOnMap={setDisplayGradeOnMap}
        />
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

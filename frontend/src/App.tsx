import { useEffect, useState, useMemo } from 'react';
import './App.css';
import { TopBar } from './components/TopBar.tsx';
import { MapView } from './components/MapView.tsx';
import { BottomPanel } from './components/BottomPanel.tsx';
import type { Route } from './types.ts';

function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -122.20, // Default to Bellevue area based on image
    latitude: 47.61,
    zoom: 11
  });

  const [hoveredLocation, setHoveredLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      setRoutes(data);
      if (data.length > 0 && !selectedRouteId) {
        // Center on the first route just to have a starting point if needed
        // But better to use fitBounds later
        const coords = data[0].geojson.coordinates[0];
        setViewState({
           longitude: coords[0],
           latitude: coords[1],
           zoom: 10
        });
      }
    } catch (e) {
      console.error("Failed to fetch routes", e);
    }
  };

  const selectedRoute = useMemo(() =>
    routes.find(r => r.id === selectedRouteId),
  [routes, selectedRouteId]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this route?")) return;
    await fetch(`/api/routes/${id}`, { method: 'DELETE' });
    setSelectedRouteId(null);
    fetchRoutes();
  };

  const handleUpdateTags = async (id: number, newTags: string[]) => {
      await fetch(`/api/routes/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ tags: newTags }),
          headers: { 'Content-Type': 'application/json'}
      });
      fetchRoutes();
  };

  return (
    <>
      <TopBar />
      <MapView
        routes={routes}
        selectedRouteId={selectedRouteId}
        onSelectRoute={setSelectedRouteId}
        viewState={viewState}
        onMove={setViewState}
        hoveredLocation={hoveredLocation}
        onHover={setHoveredLocation}
      />
      {selectedRoute && (
        <BottomPanel
          route={selectedRoute}
          onClose={() => setSelectedRouteId(null)}
          onDelete={handleDelete}
          onUpdateTags={handleUpdateTags}
          hoveredLocation={hoveredLocation}
          onHover={setHoveredLocation}
        />
      )}
    </>
  );
}

export default App;

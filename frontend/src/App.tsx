import { useEffect, useState, useMemo } from 'react';
import Map, { Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Trash2, ExternalLink, Download, X } from 'lucide-react';

interface Route {
  id: number;
  source_url: string;
  title: string;
  tags: string[];
  geojson: any;
}

function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [viewState, setViewState] = useState({
    longitude: -122.4,
    latitude: 37.8,
    zoom: 8
  });

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const res = await fetch('/api/routes');
      const data = await res.json();
      setRoutes(data);
      if (data.length > 0) {
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

  const layerStyle = {
    id: 'route-line',
    type: 'line',
    paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ff0000', '#0000ff'],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 6, 3],
      'line-opacity': 0.8
    }
  };

  // Convert routes to a FeatureCollection
  const routesGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: routes.map(r => ({
        type: "Feature",
        geometry: r.geojson,
        properties: { id: r.id, title: r.title },
        id: r.id 
      }))
    };
  }, [routes]);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          onClick={(e) => {
             const feature = e.features?.[0];
             if (feature) {
                 setSelectedRouteId(feature.id as number);
             } else {
                 setSelectedRouteId(null);
             }
          }}
          interactiveLayerIds={['route-line']}
        >
          <NavigationControl position="top-right" />
          <Source id="routes-data" type="geojson" data={routesGeoJson as any}>
            <Layer {...layerStyle as any} />
          </Source>
        </Map>
      </div>

      {selectedRoute && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          padding: '20px',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
          maxHeight: '40vh',
          overflowY: 'auto',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={{ margin: '0 0 10px 0' }}>{selectedRoute.title}</h2>
            <button onClick={() => setSelectedRouteId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
               <X />
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <a href={selectedRoute.source_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none', color: '#007bff' }}>
              <ExternalLink size={16} /> Source
            </a>
            <a href={`/api/routes/${selectedRoute.id}/download`} download style={{ display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'none', color: '#007bff' }}>
              <Download size={16} /> Download
            </a>
            <button onClick={() => handleDelete(selectedRoute.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer' }}>
              <Trash2 size={16} /> Delete
            </button>
          </div>

          <div>
             <strong>Tags: </strong>
             {selectedRoute.tags?.map(tag => (
                 <span key={tag} style={{ background: '#eee', padding: '2px 8px', borderRadius: '4px', marginRight: '5px', fontSize: '0.9em' }}>{tag}</span>
             ))}
             <button 
                onClick={() => {
                    const newTag = prompt("Add tag:");
                    if (newTag) handleUpdateTags(selectedRoute.id, [...(selectedRoute.tags || []), newTag]);
                }}
                style={{ background: 'none', border: '1px dashed #ccc', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}
             >
                 + Add Tag
             </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

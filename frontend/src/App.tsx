import { useEffect, useState, useMemo } from "react";
import { useMeasure, useDebounce } from "@uidotdev/usehooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Toaster } from "./components/ui/Toaster";
import { toast } from "./components/ui/use-toast";

const SEARCH_PARAM_ROUTE = "route";
const SEARCH_PARAM_QUERY = "q";
const SEARCH_PARAM_SHOW_GRADE = "grade";
const SEARCH_PARAM_LAT = "lat";
const SEARCH_PARAM_LNG = "lng";
const SEARCH_PARAM_ZOOM = "z";
const SEARCH_PARAM_BASEMAP = "base";
const SEARCH_PARAM_OVERLAY = "overlay";
const SEARCH_PARAM_OPACITY_SELECTED = "opa-selected";
const SEARCH_PARAM_OPACITY_COMPLETED = "opa-complete";
const SEARCH_PARAM_OPACITY_INCOMPLETE = "opa-incomplete";

function App() {
  const queryClient = useQueryClient();
  const [initialSearchParams] = useState(() => new URLSearchParams(window.location.search));
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(initialSearchParams.get(SEARCH_PARAM_ROUTE) ? parseInt(initialSearchParams.get(SEARCH_PARAM_ROUTE) || "") : null);
  const [selectionSource, setSelectionSource] = useState<'map' | 'search' | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearchParams.get(SEARCH_PARAM_QUERY) || "");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [displayGradeOnMap, setDisplayGradeOnMap] = useState(initialSearchParams.get(SEARCH_PARAM_SHOW_GRADE) === "true");
  const [viewState, setViewState] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get(SEARCH_PARAM_LAT);
    const lng = params.get(SEARCH_PARAM_LNG);
    const zoom = params.get(SEARCH_PARAM_ZOOM);
    // Default to Bellevue, WA
    return {
      longitude: lng ? parseFloat(lng) : -122.2,
      latitude: lat ? parseFloat(lat) : 47.61,
      zoom: zoom ? parseFloat(zoom) : 11,
    };
  });
  const debouncedViewState = useDebounce(viewState, 500);

  const [baseStyle, setBaseStyle] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get(SEARCH_PARAM_BASEMAP) ?? "carto-dark";
  });
  const [customStyleUrl, setCustomStyleUrl] = useState("");
  const [activeOverlayIds, setActiveOverlayIds] = useState<Set<string>>(() => {
    const params = new URLSearchParams(window.location.search);
    const overlays = params.getAll(SEARCH_PARAM_OVERLAY);
    return new Set(overlays);
  });

  const [routeOpacity, setRouteOpacity] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      selected: params.has(SEARCH_PARAM_OPACITY_SELECTED) ? parseInt(params.get(SEARCH_PARAM_OPACITY_SELECTED) as string) : 100,
      completed: params.has(SEARCH_PARAM_OPACITY_COMPLETED) ? parseInt(params.get(SEARCH_PARAM_OPACITY_COMPLETED) as string) : 40,
      incomplete: params.has(SEARCH_PARAM_OPACITY_INCOMPLETE) ? parseInt(params.get(SEARCH_PARAM_OPACITY_INCOMPLETE) as string) : 60,
    };
  });

  const [hoveredLocation, setHoveredLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const [hoveredSearchRouteId, setHoveredSearchRouteId] = useState<number | null>(null);

  const [updatingRouteId, setUpdatingRouteId] = useState<number | null>(null);

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [distanceRange, setDistanceRange] = useState<[number, number] | null>(null);
  const debouncedDistanceRange = useDebounce(distanceRange, 300);

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearchQuery) params.set("search-regex", debouncedSearchQuery);
    if (selectedDomains.length > 0) params.set("sources", selectedDomains.join(','));
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(','));
    if (debouncedDistanceRange) {
      params.set("minDistance", debouncedDistanceRange[0].toString());
      params.set("maxDistance", debouncedDistanceRange[1].toString());
    }
    return params.toString();
  }, [debouncedSearchQuery, selectedDomains, selectedTags, debouncedDistanceRange]);

  const { data: routes = [], isFetching: fetchingRoutes } = useQuery({
    queryKey: ['routes', filterParams],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/routes?${filterParams}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch routes');
      return res.json() as Promise<Route[]>;
    },
    placeholderData: (prev) => prev
  });

  const { data: selectedRouteFull } = useQuery({
    queryKey: ['route', selectedRouteId],
    queryFn: async ({ signal }) => {
      if (!selectedRouteId) return null;
      const res = await fetch(`/api/routes/${selectedRouteId}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch route details');
      return res.json() as Promise<Route>;
    },
    enabled: !!selectedRouteId
  });

  // Fetch available tags and sources (Keeping this simple for now, could be useQuery too)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tagsRes, sourcesRes] = await Promise.all([
          fetch("/api/tags"),
          fetch("/api/sources")
        ]);

        if (tagsRes.ok) {
          const tags = await tagsRes.json();
          setAvailableTags(tags);
        }
        if (sourcesRes.ok) {
          const sources = await sourcesRes.json();
          setAvailableDomains(sources);
        }
      } catch (error) {
        console.error("Error fetching tags/sources:", error);
      }
    };
    fetchData();
  }, [routes]); // Re-fetch when routes change (e.g. after add/delete/update)

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

    // Add camera position (debounced to avoid overload during panning)
    params.set(SEARCH_PARAM_LAT, debouncedViewState.latitude.toFixed(4));
    params.set(SEARCH_PARAM_LNG, debouncedViewState.longitude.toFixed(4));
    params.set(SEARCH_PARAM_ZOOM, debouncedViewState.zoom.toFixed(2));

    // Add basemap and overlays
    params.set(SEARCH_PARAM_BASEMAP, baseStyle);

    for (const overlay of params.getAll(SEARCH_PARAM_OVERLAY)) {
      params.delete(SEARCH_PARAM_OVERLAY, overlay);
    }
    for (const overlay of activeOverlayIds) {
      params.append(SEARCH_PARAM_OVERLAY, overlay);
    }

    // Add route opacity
    params.set(SEARCH_PARAM_OPACITY_SELECTED, routeOpacity.selected.toString());
    params.set(SEARCH_PARAM_OPACITY_COMPLETED, routeOpacity.completed.toString());
    params.set(SEARCH_PARAM_OPACITY_INCOMPLETE, routeOpacity.incomplete.toString());

    const newUrl =
      window.location.pathname +
      (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", newUrl);
  }, [searchQuery, selectedRouteId, displayGradeOnMap, debouncedViewState, baseStyle, activeOverlayIds, routeOpacity]);

  const handleUpdateCompleted = async (id: number, isCompleted: boolean) => {
    setUpdatingRouteId(id);
    try {
      const response = await fetch(`/api/routes/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_completed: isCompleted }),
      });
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['routes'] });
        queryClient.invalidateQueries({ queryKey: ['route', id] });
      } else {
        console.error("Failed to update completed status");
      }
    } catch (error) {
      console.error("Error updating completed status:", error);
    } finally {
      setUpdatingRouteId(null);
    }
  };

  const handleUpdateTags = async (id: number, newTags: string[]) => {
    setUpdatingRouteId(id);
    try {
      const response = await fetch(`/api/routes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ tags: newTags }),
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: ['routes'] });
        queryClient.invalidateQueries({ queryKey: ['route', id] });
      } else {
        console.error("Failed to update tags");
      }
    } catch (error) {
      console.error("Error updating tags:", error);
    } finally {
      setUpdatingRouteId(null);
    }
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<number | null>(null);

  const handleConfirmDelete = async () => {
    if (routeToDelete !== null) {
      await fetch(`/api/routes/${routeToDelete}`, { method: "DELETE" });
      setSelectedRouteId(null);
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      setRouteToDelete(null);
    }
    setDeleteConfirmOpen(false);
  };

  const [recomputing, setRecomputing] = useState(false);

  interface RecomputeResponse {
    successCount: number;
    errorCount: number;
    total: number;
  }

  const handleRecomputeAll = async () => {
    setRecomputing(true);

    try {
      const response = await fetch('/api/routes/recompute', {
        method: 'POST',
      });

      if (response.ok) {
        const result: RecomputeResponse = await response.json();
        toast({
          title: "Recompute Complete",
          description: `Successfully recomputed ${result.successCount} out of ${result.total} routes. ${result.errorCount > 0 ? `(${result.errorCount} errors)` : ''}`,
        });
        queryClient.invalidateQueries({ queryKey: ['routes'] });
      } else {
        toast({
          title: "Error",
          description: "Failed to recompute routes",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error recomputing routes:', error);
      toast({
        title: "Error",
        description: "Error recomputing routes",
        variant: "destructive",
      });
    } finally {
      setRecomputing(false);
    }
  };

  const handleRecompute = async (id: number) => {
    setRecomputing(true);
    try {
      const response = await fetch(`/api/routes/${id}/recompute`, {
        method: 'POST',
      });

      if (response.ok) {
        const result: RecomputeResponse = await response.json();
        toast({
          title: "Recompute Complete",
          description: `Successfully recomputed route. (Success: ${result.successCount}, Errors: ${result.errorCount})`,
        });
        queryClient.invalidateQueries({ queryKey: ['routes'] });
        queryClient.invalidateQueries({ queryKey: ['route', id] });
      } else {
        toast({
          title: "Error",
          description: "Failed to recompute route",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error recomputing route:', error);
      toast({
        title: "Error",
        description: "Error recomputing route",
        variant: "destructive",
      });
    } finally {
      setRecomputing(false);
    }
  }

  const handleSelectRoute = (id: number | null, source?: 'map' | 'search') => {
    setSelectionSource(source ?? null);
    setSelectedRouteId(id);
  };

  const handleToggleDomain = (domain: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domain)
        ? prev.filter((d) => d !== domain)
        : [...prev, domain]
    );
  };

  const handleClearDomains = () => {
    setSelectedDomains([]);
  };

  const distanceExtent = useMemo(() => [0, 804672], [routes]);

  const handleDistanceChange = (range: [number, number]) => {
    setDistanceRange(range);
  };

  const handleClearDistance = () => {
    setDistanceRange(null);
  };

  const selectedRoute = useMemo(() => {
    if (selectedRouteFull && selectedRouteFull.id === selectedRouteId) {
      return selectedRouteFull;
    }
    return routes.find((r) => r.id === selectedRouteId);
  }, [selectedRouteFull, routes, selectedRouteId]);

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

    // Use precomputed grades if available
    const precomputedGrades = selectedRoute.grades;

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

        if (precomputedGrades && precomputedGrades.length > 0) {
          if (i - 1 < precomputedGrades.length) {
            grade = precomputedGrades[i - 1];
          }
        } else {
          grade = calculateGrade(coords[i - 1], coords[i]);
        }
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

  const [topBarRef, { height: topBarHeight }] = useMeasure();
  const [bottomPanelRef, { height: bottomPanelHeight }] = useMeasure();

  const mapPadding = useMemo(
    () => ({
      top: topBarHeight ?? 0,
      bottom: bottomPanelHeight ?? 0,
      left: 0,
      right: 0,
    }),
    [topBarHeight, bottomPanelHeight]
  );

  return (
    <>
      <TopBar
        ref={topBarRef}
        recomputing={recomputing}
        onRecomputeAll={handleRecomputeAll}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onToggleTag={handleToggleTag}
        onClearTags={handleClearTags}
        availableDomains={availableDomains}
        selectedDomains={selectedDomains}
        onToggleDomain={handleToggleDomain}
        onClearDomains={handleClearDomains}
        minDistance={distanceExtent[0]}
        maxDistance={distanceExtent[1]}
        distanceRange={distanceRange}
        onDistanceChange={handleDistanceChange}
        onClearDistance={handleClearDistance}
        fetchingRoutes={fetchingRoutes}
      />
      <MapView
        routes={routes}
        selectedRouteId={selectedRouteId}
        selectionSource={selectionSource}
        onSelectRoute={handleSelectRoute}
        viewState={viewState}
        onMove={setViewState}
        hoveredLocation={hoveredLocation}
        onHover={setHoveredLocation}
        displayGradeOnMap={displayGradeOnMap}
        routeData={routeData}
        baseStyle={baseStyle}
        onBaseStyleChange={setBaseStyle}
        customStyleUrl={customStyleUrl}
        onCustomStyleUrlChange={setCustomStyleUrl}
        activeOverlayIds={activeOverlayIds}
        onToggleOverlay={(id, active) => {
          setActiveOverlayIds((prev) => {
            const next = new Set(prev);
            if (active) {
              next.add(id);
            } else {
              next.delete(id);
            }
            return next;
          });
        }}
        routeOpacity={routeOpacity}
        onOpacityChange={setRouteOpacity}
        hoveredSearchRouteId={hoveredSearchRouteId}
        padding={mapPadding}
        filterParams={filterParams}
        selectedRoute={selectedRoute}
      />
      <BottomPanel ref={bottomPanelRef}>
        {selectedRoute ? (
          <RouteDetailsView
            route={selectedRoute}
            routeData={routeData}
            recomputing={recomputing}
            onClose={() => setSelectedRouteId(null)}
            onDelete={(id) => {
              setRouteToDelete(id);
              setDeleteConfirmOpen(true);
            }}
            onRecompute={handleRecompute}
            onUpdateTags={handleUpdateTags}
            onUpdateCompleted={handleUpdateCompleted}
            updatingRouteId={updatingRouteId}
            hoveredLocation={hoveredLocation}
            onHover={setHoveredLocation}
            displayGradeOnMap={displayGradeOnMap}
            onToggleDisplayGradeOnMap={setDisplayGradeOnMap}
          />
        ) : searchQuery || selectedTags.length > 0 || selectedDomains.length > 0 || distanceRange !== null ? (
          <SearchResultsView
            searchQuery={debouncedSearchQuery}
            selectedTags={selectedTags}
            selectedDomains={selectedDomains}
            distanceRange={debouncedDistanceRange}
            fetchingRoutes={fetchingRoutes}
            results={routes}
            onSelectRoute={handleSelectRoute}
            onClose={() => {
              setSearchQuery("");
              setSelectedTags([]);
              setSelectedDomains([]);
              setDistanceRange(null);
            }}
            onHoverRoute={setHoveredSearchRouteId}
          />
        ) : null}
      </BottomPanel>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Route"
        description="Are you sure you want to delete this route? This action cannot be undone."
        onConfirm={handleConfirmDelete}
      />
      <Toaster />
    </>
  );
}

export default App;

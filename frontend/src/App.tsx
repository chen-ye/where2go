import { useEffect, useState, useMemo, useRef } from "react";
import { useMeasure, useDebounce } from "@uidotdev/usehooks";
import { useQuery } from "@tanstack/react-query";
import "./App.css";
import { TopBar } from "./components/TopBar.tsx";
import { MapView } from "./components/MapView.tsx";
import { BottomPanel } from "./components/BottomPanel.tsx";
import type { Route, RouteDataPoint } from "./types.ts";
import type { MapRef } from "react-map-gl/maplibre";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import {
  getDistanceFromLatLonInMeters,
  calculateGrade,
} from "./utils/geo";
import { SearchResultsView } from "./components/SearchResultsView.tsx";
import { RouteDetailsView } from "./components/RouteDetailsView.tsx";
import { Toaster } from "./components/ui/Toaster";
import {
  useUpdateRouteTags,
  useUpdateRouteCompletion,
  useDeleteRoute,
  useRecomputeRoute,
  useRecomputeAllRoutes,
} from "./hooks/useMutations";
import {
  API_PARAM_SEARCH_REGEX,
  API_PARAM_SOURCES,
  API_PARAM_TAGS,
  API_PARAM_MIN_DISTANCE,
  API_PARAM_MAX_DISTANCE,
} from "@shared/api-constants";


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
  const mapRef = useRef<MapRef>(null);

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

  const [hoveredRouteId, setHoveredRouteId] = useState<number | null>(null);

  const [updatingRouteId, setUpdatingRouteId] = useState<number | null>(null);

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [distanceRange, setDistanceRange] = useState<[number, number] | null>(null);
  const debouncedDistanceRange = useDebounce(distanceRange, 300);

  // Derived filter params for queries
  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearchQuery) params.set(API_PARAM_SEARCH_REGEX, debouncedSearchQuery);
    if (selectedDomains.length > 0) params.set(API_PARAM_SOURCES, selectedDomains.join(','));
    if (selectedTags.length > 0) params.set(API_PARAM_TAGS, selectedTags.join(','));
    if (debouncedDistanceRange) {
      params.set(API_PARAM_MIN_DISTANCE, debouncedDistanceRange[0].toString());
      params.set(API_PARAM_MAX_DISTANCE, debouncedDistanceRange[1].toString());
    }
    return params.toString();
  }, [debouncedSearchQuery, selectedDomains, selectedTags, debouncedDistanceRange]);

  // Fetch routes list
  const { data: routes = [], isFetching: fetchingRoutes } = useQuery({
    queryKey: ['routes', filterParams],
    queryFn: async () => {
      const res = await fetch(`/api/routes?${filterParams}`);
      if (!res.ok) throw new Error('Failed to fetch routes');
      return res.json();
    },
    placeholderData: (previousData) => previousData,
  });

  // Fetch selected route details
  const { data: selectedRouteDetails } = useQuery({
    queryKey: ['route', selectedRouteId],
    queryFn: async () => {
      if (!selectedRouteId) return null;
      const res = await fetch(`/api/routes/${selectedRouteId}`);
      if (!res.ok) throw new Error('Failed to fetch route details');
      return res.json();
    },
    enabled: !!selectedRouteId,
  });

  // Fetch available tags and sources
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
  }, [routes]); // Re-fetch when routes change

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

  const updateRouteTags = useUpdateRouteTags();
  const updateRouteCompletion = useUpdateRouteCompletion();
  const deleteRoute = useDeleteRoute();
  const recomputeRoute = useRecomputeRoute();
  const recomputeAllRoutes = useRecomputeAllRoutes();

  const handleUpdateCompleted = (id: number, isCompleted: boolean) => {
    setUpdatingRouteId(id);
    updateRouteCompletion.mutate(
      { id, is_completed: isCompleted },
      {
        onSettled: () => setUpdatingRouteId(null),
      }
    );
  };

  const handleUpdateTags = (id: number, newTags: string[]) => {
    setUpdatingRouteId(id);
    updateRouteTags.mutate(
      { id, tags: newTags },
      {
        onSettled: () => setUpdatingRouteId(null),
      }
    );
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

  const handleConfirmDelete = () => {
    if (routeToDelete !== null) {
      deleteRoute.mutate(routeToDelete, {
        onSuccess: () => {
          setSelectedRouteId(null);
          setRouteToDelete(null);
        }
      });
    }
    setDeleteConfirmOpen(false);
  };

  const [recomputing, setRecomputing] = useState(false);

  const handleRecomputeAll = () => {
    setRecomputing(true);
    recomputeAllRoutes.mutate(undefined, {
      onSettled: () => setRecomputing(false),
    });
  };

  const handleRecompute = (id: number) => {
    setRecomputing(true);
    recomputeRoute.mutate(id, {
      onSettled: () => setRecomputing(false),
    });
  };

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

  const handleClickLocation = (location: { lat: number; lon: number }) => {
    console.log('handleClickLocation called', { location, hasMapRef: !!mapRef.current });
    if (!mapRef.current) {
      console.error('mapRef.current is null');
      return;
    }

    // Calculate viewport bounds with some buffer (20%)
    const buffer = 0.2;
    const lonRange = (180 / Math.pow(2, viewState.zoom)) * (1 + buffer);
    const latRange = (85 / Math.pow(2, viewState.zoom)) * (1 + buffer);

    const minLat = viewState.latitude - latRange;
    const maxLat = viewState.latitude + latRange;
    const minLon = viewState.longitude - lonRange;
    const maxLon = viewState.longitude + lonRange;

    // Check if location is within viewport
    const isInView =
      location.lat >= minLat &&
      location.lat <= maxLat &&
      location.lon >= minLon &&
      location.lon <= maxLon;

    console.log('isInView check', { isInView, viewState, location });

    // Only fly if not in view
    if (!isInView) {
      console.log('Calling flyTo');
      mapRef.current.flyTo({
        center: [location.lon, location.lat],
        zoom: Math.max(viewState.zoom, 12),
        duration: 1000, // 1 second smooth transition
      });
    } else {
      console.log('Location already in view, not flying');
    }
  };

  const handleClearDistance = () => {
    setDistanceRange(null);
  };

  const selectedRoute = useMemo(
    () => {
      if (selectedRouteDetails) return selectedRouteDetails;
      return routes.find((r: Route) => r.id === selectedRouteId);
    },
    [routes, selectedRouteId, selectedRouteDetails]
  );

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

        // If precomputed grades exist, use them.
        // Note: precomputedGrades[i-1] corresponds to the segment from point i-1 to i.
        // The array calculated in backend has N-1 elements for N points.
        if (precomputedGrades && precomputedGrades.length > 0) {
          // Check bounds just in case
          if (i - 1 < precomputedGrades.length) {
            grade = precomputedGrades[i - 1];
          }
        } else {
          // Fallback to on-the-fly calculation
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

  // Track previous padding to detect changes
  // const prevPaddingRef = useRef(mapPadding);

  // // Adjust map center when padding changes to prevent camera jump
  // useEffect(() => {
  //   const prevPadding = prevPaddingRef.current;
  //   const paddingChanged =
  //     prevPadding.top !== mapPadding.top ||
  //     prevPadding.bottom !== mapPadding.bottom ||
  //     prevPadding.left !== mapPadding.left ||
  //     prevPadding.right !== mapPadding.right;

  //   if (paddingChanged) {
  //     // Calculate the offset needed to keep the visual center in place
  //     const deltaY = (mapPadding.bottom - prevPadding.bottom - (mapPadding.top - prevPadding.top)) / 2;
  //     const deltaX = (mapPadding.right - prevPadding.right - (mapPadding.left - prevPadding.left)) / 2;

  //     if (deltaY !== 0 || deltaX !== 0) {
  //       // Get current map container size
  //       const mapContainer = document.querySelector('.map-container') as HTMLElement;
  //       if (mapContainer) {

  //         // Convert pixel offset to lat/lng offset
  //         // This is an approximation; exact conversion depends on zoom level
  //         const metersPerPixel = (40075016.686 * Math.abs(Math.cos(viewState.latitude * Math.PI / 180))) / (256 * Math.pow(2, viewState.zoom));
  //         const latOffset = -(deltaY * metersPerPixel) / 111320; // 1 degree latitude ≈ 111320 meters
  //         const lngOffset = (deltaX * metersPerPixel) / (111320 * Math.cos(viewState.latitude * Math.PI / 180));

  //         setViewState(prev => ({
  //           ...prev,
  //           latitude: prev.latitude + latOffset,
  //           longitude: prev.longitude + lngOffset,
  //         }));
  //       }
  //     }

  //     prevPaddingRef.current = mapPadding;
  //   }
  // }, [mapPadding, viewState.latitude, viewState.zoom]);

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
        ref={mapRef}
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
        hoveredRouteId={hoveredRouteId}
        onHoverRoute={setHoveredRouteId}
        padding={mapPadding}
        filterParams={filterParams}
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
            onClickLocation={handleClickLocation}
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
            onHoverRoute={setHoveredRouteId}
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

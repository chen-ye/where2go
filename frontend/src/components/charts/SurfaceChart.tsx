import { useMemo, useId, useCallback, memo } from "react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { useTooltip, Tooltip } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { METERS_TO_MILES } from "../../utils/geo";
import type { RouteDataPoint, ValhallaSegment } from "../../types";
import { Bike, Kanban, Milestone } from "lucide-react";
import "./charts.css";

interface SurfaceChartProps {
  data: RouteDataPoint[];
  segments: ValhallaSegment[];
  width: number;
  height?: number;
  hoveredLocation: { lat: number; lon: number } | null;
  onHover: (location: { lat: number; lon: number } | null) => void;
  onClickLocation: (location: { lat: number; lon: number }) => void;
}

// Accessors
const getX = (d: RouteDataPoint) => d.distance * METERS_TO_MILES;

const margin = { top: 0, right: 20, bottom: 0, left: 50 };

const SURFACE_COLORS: Record<string, string> = {
  paved: "var(--gray-9)",
  paved_smooth: "var(--gray-9)",
  paved_rough: "var(--gray-9)",
  compacted: "var(--sand-5)",
  dirt: "var(--brown-8)",
  gravel: "var(--gray-6)",
  path: "var(--brown-6)",
  impassable: "var(--red-8)",
  unknown: "var(--surface-3-translucent)",
};

const getSurfaceColor = (surface: string) => {
  return SURFACE_COLORS[surface] || SURFACE_COLORS.unknown;
};

// Static chart content - memoized separately to avoid re-renders
const StaticSurfaceChart = memo(({
  chartSegments,
  xScale,
}: {
  chartSegments: any[];
  xScale: any;
}) => {
  return (
    <Group left={margin.left} top={margin.top}>
      {chartSegments.map((seg, i) => {
        const x = xScale(seg.x);
        const w = xScale(seg.width + seg.x) - x; // Calculate width in pixels based on scale

        // Comfort Indicator
        let bottomBorderFill = "transparent";

        // Priority 1: Dedicated Cycleway
        if (seg.cycle_lane && seg.cycle_lane !== "none" && seg.cycle_lane !== "shared") {
           bottomBorderFill = "var(--teal-8)";
        }
        // Priority 2: Marked Bicycle Network
        else if (seg.cycle_lane === "shared" || seg.bicycle_network && seg.bicycle_network !== "0") {
           bottomBorderFill = "url(#shared-bicycle-pattern)";
        }
        // Priority 3: Major Roads
        else if (
          ["motorway", "trunk", "primary", "secondary"].includes(
            seg.road_class || ""
          )
        ) {
          bottomBorderFill = "var(--yellow-8)";
        } else {
            // Fallback to surface color if no priority
            bottomBorderFill = getSurfaceColor(seg.surface);
        }

        return (
          <g key={i}>
            {/* Main Surface Bar (Top 12px) */}
            <Bar
              x={x}
              y={0}
              width={w}
              height={12}
              fill={getSurfaceColor(seg.surface)}
            />
            {/* Bottom Border (Bottom 4px) */}
            <Bar
              x={x}
              y={12}
              width={w}
              height={4}
              fill={bottomBorderFill}
            />
          </g>
        );
      })}
    </Group>
  );
});

export function SurfaceChart({
  data,
  segments,
  width,
  height = 16,
  hoveredLocation,
  onHover,
  onClickLocation,
}: SurfaceChartProps) {
  const anchorId = useId();
  const anchorName = `--surface-cursor-datum-${anchorId.replace(/:/g, "")}`;

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<ValhallaSegment>();

  const xMax = Math.max(width - margin.left - margin.right, 0);

  // Memoize scales
  const xScale = useMemo(
    () =>
      scaleLinear({
        range: [0, xMax],
        domain: [0, Math.max(...data.map(getX)) || 1], // Avoid 0 domain
      }),
    [data, xMax]
  );

  // Map segments to chart data
  const chartSegments = useMemo(() => {
    if (!segments || segments.length === 0 || data.length === 0) return [];

    return segments.map((seg) => {
      // Ensure indices are within bounds
      const startIndex = Math.min(seg.start, data.length - 1);
      const endIndex = Math.min(seg.end, data.length - 1);

      if (seg.start >= data.length || seg.end >= data.length) {
        console.warn('SurfaceChart: segment indices out of bounds', {
          seg,
          dataLength: data.length,
          startIndex,
          endIndex
        });
      }

      const startDist = getX(data[startIndex]);
      const endDist = getX(data[endIndex]);

      return {
        ...seg,
        x: startDist,
        width: Math.max(endDist - startDist, 0), // Ensure non-negative width
      };
    });
  }, [segments, data]);

  // Handle external hover
  const externalTooltipData = useMemo(() => {
    if (!hoveredLocation) return null;

    // Find closest point in data
    let minDist = Infinity;
    let closestIndex = -1;

    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      const d = Math.sqrt(
        Math.pow(p.lat - hoveredLocation.lat, 2) +
          Math.pow(p.lon - hoveredLocation.lon, 2)
      );
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    }

    if (closestIndex === -1) return null;

    // Find segment containing this index
    const segment = segments.find(
      (s) => s.start <= closestIndex && s.end >= closestIndex
    );

    if (!segment) return null;

    const distance = getX(data[closestIndex]);
    const left = xScale(distance) + margin.left;

    return {
      data: segment,
      left,
      top: height / 2,
      point: data[closestIndex],
    };
  }, [hoveredLocation, data, segments, xScale, height]);

  const activeTooltipData = tooltipOpen
    ? { data: tooltipData, left: tooltipLeft, top: tooltipTop, point: null }
    : externalTooltipData;

  const showActiveTooltip = tooltipOpen || !!externalTooltipData;

  if (data.length === 0) return null;

  return (
    <div className="chart-container" style={{ height }}>
      <svg width={width} height={height}>
        <defs>
          <pattern
            id="shared-bicycle-pattern"
            width="8"
            height="4"
            patternUnits="userSpaceOnUse"
          >
            <rect width="4" height="4" fill="var(--teal-8)" />
          </pattern>
        </defs>

        <StaticSurfaceChart
          chartSegments={chartSegments}
          xScale={xScale}
        />

        <Group left={margin.left} top={margin.top}>
          <Bar
            width={xMax}
            height={height}
            fill="transparent"
            onMouseMove={useCallback((event: React.MouseEvent | React.TouchEvent) => {
              const { x: mouseX } = localPoint(event) || { x: 0 };

              // Find approximate location for map hover
              const x0 = xScale.invert(mouseX - margin.left);

              // Find closest data point
              const closest = data.reduce((prev, curr) =>
                  Math.abs(getX(curr) - x0) < Math.abs(getX(prev) - x0) ? curr : prev
              );

              // Find segment for tooltip
              const closestIndex = data.indexOf(closest);
              const segment = segments.find(
                (s) => s.start <= closestIndex && s.end >= closestIndex
              );

              if (segment) {
                showTooltip({
                  tooltipData: segment,
                  tooltipLeft: mouseX,
                  tooltipTop: 0,
                });
              }

              onHover({ lat: closest.lat, lon: closest.lon });
            }, [xScale, data, segments, showTooltip, onHover])}
            onMouseLeave={useCallback(() => {
              hideTooltip();
              onHover(null);
            }, [hideTooltip, onHover])}
            onClick={useCallback(() => {
              if (hoveredLocation) {
                onClickLocation(hoveredLocation);
              }
            }, [hoveredLocation, onClickLocation])}
          />
        </Group>
      </svg>

      {/* HTML Cursor */}
      {showActiveTooltip && activeTooltipData && (
        <>
          {/* Vertical Line */}
          <div
            className="chart-cursor-line"
            style={{
              top: margin.top,
              left: activeTooltipData.left,
              anchorName,
              height,
            }}
          />
        </>
      )}

      {/* Tooltip */}
      {showActiveTooltip && activeTooltipData && activeTooltipData.data && (
        <Tooltip
          key={Math.random()}
          className="chart-tooltip"
          style={{
            positionAnchor: anchorName,
            positionArea: "right",
            positionTryFallbacks: "flip-block, flip-inline, flip-block flip-inline",
          }}
        >
          <div className="chart-tooltip-stat primary">
            {activeTooltipData.data.surface}
          </div>
          {!!activeTooltipData.data.road_class && (
            <div className="chart-tooltip-stat">
              <Kanban size={16}/> {activeTooltipData.data.road_class}
            </div>
          )}
          {!!activeTooltipData.data.bicycle_network && (
            <div className="chart-tooltip-stat" style={{ color: "var(--teal-6)"}}>
              <Milestone size={16}/> {activeTooltipData.data.bicycle_network}
            </div>
          )}
          {!!activeTooltipData.data.cycle_lane && (
            <div className="chart-tooltip-stat" style={{ color: "var(--teal-6)"}}>
              <Bike size={16}/> {activeTooltipData.data.cycle_lane}
            </div>
          )}
        </Tooltip>
      )}
    </div>
  );
}

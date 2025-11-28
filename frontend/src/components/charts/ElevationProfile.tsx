import { memo, useMemo, useId } from "react";
import { Group } from "@visx/group";
import { AreaClosed, LinePath } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { ParentSize } from "@visx/responsive";
import { localPoint } from "@visx/event";
import { useTooltip, Tooltip } from "@visx/tooltip";
import { bisector } from "d3-array";
import { getGradeColor, METERS_TO_MILES, METERS_TO_FEET } from "../../utils/geo";
import type { RouteDataPoint } from "../../types";
import "./charts.css";

interface ElevationProfileProps {
  data: RouteDataPoint[];
  height?: number;
  hoveredLocation: { lat: number; lon: number } | null;
  onHover: (location: { lat: number; lon: number } | null) => void;
}

// Accessors
const getX = (d: RouteDataPoint) => d.distance * METERS_TO_MILES;
const getY = (d: RouteDataPoint) => d.elevation * METERS_TO_FEET;
const bisectDistance = bisector<RouteDataPoint, number>(
  (d) => d.distance * METERS_TO_MILES
).left;

const margin = { top: 20, right: 20, bottom: 30, left: 50 };

const ElevationChart = memo(
  ({
    data,
    width,
    height,
    hoveredLocation,
    onHover,
    tooltipOpen,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  }: {
    data: RouteDataPoint[];
    width: number;
    height: number;
    hoveredLocation: { lat: number; lon: number } | null;
    onHover: (location: { lat: number; lon: number } | null) => void;
    tooltipOpen: boolean;
    tooltipData: RouteDataPoint | undefined;
    tooltipLeft: number | undefined;
    tooltipTop: number | undefined;
    showTooltip: (args: any) => void;
    hideTooltip: () => void;
  }) => {
    const anchorId = useId();
    const anchorName = `--elevation-cursor-datum-${anchorId.replace(/:/g, "")}`;
    const xMax = width - margin.left - margin.right;
    const yMax = height - margin.top - margin.bottom;

    // Memoize scales
    const xScale = useMemo(
      () =>
        scaleLinear({
          range: [0, xMax],
          domain: [0, Math.max(...data.map(getX))],
        }),
      [data, xMax]
    );

    const yScale = useMemo(
      () =>
        scaleLinear({
          range: [yMax, 0],
          domain: [
            Math.min(...data.map(getY)) * 0.9,
            Math.max(...data.map(getY)) * 1.1,
          ],
        }),
      [data, yMax]
    );

    const gradientId = useMemo(
      () => `grade-gradient-${Math.random().toString(36).substr(2, 9)}`,
      []
    );

    const maxDist = data[data.length - 1].distance;

    // Handle external hover
    const externalTooltipData = useMemo(() => {
      if (!hoveredLocation) return null;
      let minDist = Infinity;
      let closestPoint = null;

      for (const p of data) {
        const d = Math.sqrt(
          Math.pow(p.lat - hoveredLocation.lat, 2) +
            Math.pow(p.lon - hoveredLocation.lon, 2)
        );
        if (d < minDist) {
          minDist = d;
          closestPoint = p;
        }
      }
      return closestPoint;
    }, [data, hoveredLocation]);

    const activeTooltipData = tooltipOpen ? tooltipData : externalTooltipData;
    const showActiveTooltip = tooltipOpen || !!externalTooltipData;

    // Calculate tooltip position for external hover
    let activeTooltipLeft = tooltipLeft;
    let activeTooltipTop = tooltipTop;

    if (!tooltipOpen && externalTooltipData) {
      activeTooltipLeft = xScale(getX(externalTooltipData)) + margin.left;
      activeTooltipTop = yScale(getY(externalTooltipData)) + margin.top;
    }

    return (
      <>
        <svg width={width} height={height}>
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              {data.map((d, i) => (
                <stop
                  key={i}
                  offset={`${
                    ((d.distance * METERS_TO_MILES) /
                      (maxDist * METERS_TO_MILES)) *
                    100
                  }%`}
                  stopColor={getGradeColor(d.grade)}
                />
              ))}
            </linearGradient>
          </defs>

          <Group left={margin.left} top={margin.top}>
            <AreaClosed<RouteDataPoint>
              data={data}
              x={(d: RouteDataPoint) => xScale(getX(d)) ?? 0}
              y={(d: RouteDataPoint) => yScale(getY(d)) ?? 0}
              yScale={yScale}
              strokeWidth={2}
              stroke="transparent"
              fill={`url(#${gradientId})`}
              curve={curveMonotoneX}
            />
            <LinePath
              data={data}
              x={(d: RouteDataPoint) => xScale(getX(d)) ?? 0}
              y={(d: RouteDataPoint) => yScale(getY(d)) ?? 0}
              strokeWidth={2}
              stroke="#cdcdcdff"
              curve={curveMonotoneX}
            />

            <AxisBottom
              scale={xScale}
              top={yMax}
              stroke="#444"
              tickStroke="#444"
              tickLabelProps={() => ({
                fill: "#888",
                fontSize: 10,
                textAnchor: "middle",
              })}
            />

            <AxisLeft
              scale={yScale}
              stroke="#444"
              tickStroke="#444"
              tickLabelProps={() => ({
                fill: "#888",
                fontSize: 10,
                textAnchor: "end",
                dx: -5,
                dy: 2.5,
              })}
              numTicks={5}
            />

            <rect
              width={xMax}
              height={yMax}
              fill="transparent"
              onMouseMove={(event) => {
                const { x } = localPoint(event) || { x: 0 };
                const x0 = xScale.invert(x - margin.left);
                const index = bisectDistance(data, x0, 1);
                const d0 = data[index - 1];
                const d1 = data[index];
                let d = d0;
                if (d1 && d0) {
                  d = x0 - getX(d0) > getX(d1) - x0 ? d1 : d0;
                }

                if (d) {
                  showTooltip({
                    tooltipData: d,
                    tooltipLeft: xScale(getX(d)) + margin.left,
                    tooltipTop: yScale(getY(d)) + margin.top,
                  });
                  onHover({ lat: d.lat, lon: d.lon });
                }
              }}
              onMouseLeave={() => {
                hideTooltip();
                onHover(null);
              }}
            />

            {showActiveTooltip && activeTooltipData && (
              <g>
                {/* SVG cursor removed, replaced by HTML elements below */}
              </g>
            )}
          </Group>
        </svg>
        {showActiveTooltip && activeTooltipData && (
          <>
            {/* Vertical Line */}
            <div
              className="chart-cursor-line"
              style={{
                top: margin.top,
                left: xScale(getX(activeTooltipData)) + margin.left,
                height: yMax,
              }}
            />
            {/* Datum Point (Anchor) */}
            <div
              className="chart-cursor-datum"
              style={{
                '--offset-x': `${xScale(getX(activeTooltipData)) + margin.left}px`,
                '--offset-y': `${yScale(getY(activeTooltipData)) + margin.top}px`,
                backgroundColor: getGradeColor(activeTooltipData.grade),
                anchorName,
              } as React.CSSProperties}
            />
          </>
        )}
        {showActiveTooltip && activeTooltipData && (
          <Tooltip
            key={Math.random()}
            className="chart-tooltip"
            style={{
              positionAnchor: anchorName,
            }}
          >
            <div className="chart-tooltip-stat primary">
              {(activeTooltipData.elevation * METERS_TO_FEET).toFixed(0)} ft
            </div>
            <div className="chart-tooltip-stat" style={{
                color: getGradeColor(activeTooltipData.grade),
              }}
            >
                {activeTooltipData.grade.toLocaleString("en-US", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                  signDisplay: "always",
                })}
                %
            </div>
            <div className="chart-tooltip-stat secondary">
                {(activeTooltipData.distance * METERS_TO_MILES).toFixed(2)} mi
            </div>
          </Tooltip>
        )}
      </>
    );
  }
);

export function ElevationProfile({
  data,
  height = 200,
  hoveredLocation,
  onHover,
}: ElevationProfileProps) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<RouteDataPoint>();

  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
        }}
      >
        No elevation data available
      </div>
    );
  }

  return (
    <div className="chart-container" style={{ height }}>
      <ParentSize>
        {({ width, height }) =>
          width < 10 ? null : (
            <ElevationChart
              data={data}
              width={width}
              height={height}
              hoveredLocation={hoveredLocation}
              onHover={onHover}
              tooltipOpen={tooltipOpen}
              tooltipData={tooltipData}
              tooltipLeft={tooltipLeft}
              tooltipTop={tooltipTop}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
            />
          )
        }
      </ParentSize>
    </div>
  );
}

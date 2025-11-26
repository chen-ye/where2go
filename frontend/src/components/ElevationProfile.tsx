import { useMemo } from 'react';
import { Group } from '@visx/group';
import { AreaClosed, Line, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import { useTooltip, useTooltipInPortal, defaultStyles } from '@visx/tooltip';
import { bisector } from 'd3-array';

interface ElevationProfileProps {
  coordinates: number[][]; // [lon, lat, ele]
  height?: number;
  hoveredLocation: { lat: number; lon: number } | null;
  onHover: (location: { lat: number; lon: number } | null) => void;
}

interface DataPoint {
  distance: number; // miles
  elevation: number; // feet
  lat: number;
  lon: number;
  grade: number; // percentage
}

// Helper to calculate distance between two points in miles
function getDistanceFromLatLonInMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // Radius of the earth in miles
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in miles
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

const METERS_TO_FEET = 3.28084;
const MILES_TO_FEET = 5280;

function getGradeColor(grade: number) {
  if (grade < 0) return '#10B981'; // Green (Descent)
  if (grade < 3) return '#9ca3af88'; // Gray (Flat)
  if (grade < 6) return '#FCD34D'; // Yellow
  if (grade < 9) return '#F59E0B'; // Orange
  if (grade < 12) return '#EF4444'; // Red
  return '#7F1D1D'; // Dark Red
}

export function ElevationProfile({ coordinates, height = 200, hoveredLocation, onHover }: ElevationProfileProps) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<DataPoint>();

  const { containerRef, TooltipInPortal } = useTooltipInPortal({
    scroll: true,
  });

  const data = useMemo(() => {
    if (!coordinates || coordinates.length === 0) return [];

    const points: DataPoint[] = [];
    let totalDist = 0;

    for (let i = 0; i < coordinates.length; i++) {
      const [lon, lat, ele] = coordinates[i];
      let grade = 0;

      if (i > 0) {
        const [prevLon, prevLat, prevEle] = coordinates[i - 1];
        const distMiles = getDistanceFromLatLonInMiles(prevLat, prevLon, lat, lon);
        totalDist += distMiles;

        const distFeet = distMiles * MILES_TO_FEET;
        const eleDiff = ((ele || 0) - (prevEle || 0)) * METERS_TO_FEET;

        if (distFeet > 0) {
            grade = (eleDiff / distFeet) * 100;
        }
      }

      points.push({
        distance: totalDist,
        elevation: (ele || 0) * METERS_TO_FEET,
        lat,
        lon,
        grade
      });
    }

    return points;
  }, [coordinates]);

  // Accessors
  const getX = (d: DataPoint) => d.distance;
  const getY = (d: DataPoint) => d.elevation;
  const bisectDistance = bisector<DataPoint, number>((d) => d.distance).left;

  // Scales
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };

  // Memoize scales to use them outside of ParentSize if needed (though ParentSize provides width/height)
  // We'll calculate them inside ParentSize for rendering, but we might need logic for external hover.
  // Actually, we can just handle external hover inside ParentSize or use a separate effect if we had fixed dimensions.
  // Since width is dynamic, we need to handle it carefully.

  // Effect to handle external hover
  // We can't easily trigger showTooltip from outside ParentSize because we need the scales.
  // So we will handle it inside the render function of ParentSize.

  if (data.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>No elevation data available</div>;
  }

  const maxDist = data[data.length - 1].distance;
  const gradientId = `grade-gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div style={{ height, width: '100%', position: 'relative' }} ref={containerRef}>
      <ParentSize>
        {({ width, height }: { width: number; height: number }) => {
          if (width < 10) return null;

          const xMax = width - margin.left - margin.right;
          const yMax = height - margin.top - margin.bottom;

          // Scales
          const xScale = scaleLinear({
            range: [0, xMax],
            domain: [0, Math.max(...data.map(getX))],
          });

          const yScale = scaleLinear({
            range: [yMax, 0],
            domain: [
              Math.min(...data.map(getY)) * 0.9, // Add some padding at bottom
              Math.max(...data.map(getY)) * 1.1  // Add some padding at top
            ],
          });

          // Handle external hover
          // If hoveredLocation is provided, find the closest point in data
          let externalTooltipData: DataPoint | null = null;
          if (hoveredLocation) {
             // Find closest point by distance (naive approach: iterate all)
             // Optimization: could use a spatial index but for <10k points iteration is fine
             let minDist = Infinity;
             let closestPoint = null;

             for (const p of data) {
                 const d = Math.sqrt(Math.pow(p.lat - hoveredLocation.lat, 2) + Math.pow(p.lon - hoveredLocation.lon, 2));
                 if (d < minDist) {
                     minDist = d;
                     closestPoint = p;
                 }
             }

             if (closestPoint) {
                 externalTooltipData = closestPoint;
             }
          }

          const activeTooltipData = tooltipOpen ? tooltipData : externalTooltipData;
          const showActiveTooltip = tooltipOpen || !!externalTooltipData;

          return (
            <svg width={width} height={height}>
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                    {data.map((d, i) => (
                        <stop
                            key={i}
                            offset={`${(d.distance / maxDist) * 100}%`}
                            stopColor={getGradeColor(d.grade)}
                        />
                    ))}
                </linearGradient>
              </defs>

              <Group left={margin.left} top={margin.top}>
                <AreaClosed<DataPoint>
                  data={data}
                  x={(d: DataPoint) => xScale(getX(d)) ?? 0}
                  y={(d: DataPoint) => yScale(getY(d)) ?? 0}
                  yScale={yScale}
                  strokeWidth={2}
                  stroke="transparent"
                  fill={`url(#${gradientId})`}
                  curve={curveMonotoneX}
                />
                <LinePath
                  data={data}
                  x={(d: DataPoint) => xScale(getX(d)) ?? 0}
                  y={(d: DataPoint) => yScale(getY(d)) ?? 0}
                  yScale={yScale}
                  strokeWidth={2}
                  stroke="#cdcdcdff"
                  curve={curveMonotoneX}
                />

                {/* Stroke line on top of area to have a clean edge, also colored by grade?
                    Or just a single color? Usually profile lines are single color or also gradient.
                    Let's use the same gradient for stroke but maybe darker or just keep it simple with a solid line for now,
                    or use the gradient.
                */}
                {/* Re-drawing the line with gradient stroke */}
                {/* Actually AreaClosed stroke prop takes a color string. */}

                <AxisBottom
                  scale={xScale}
                  top={yMax}
                  stroke="#444"
                  tickStroke="#444"
                  tickLabelProps={() => ({
                    fill: '#888',
                    fontSize: 10,
                    textAnchor: 'middle',
                  })}
                />

                <AxisLeft
                  scale={yScale}
                  stroke="#444"
                  tickStroke="#444"
                  tickLabelProps={() => ({
                    fill: '#888',
                    fontSize: 10,
                    textAnchor: 'end',
                    dx: -5,
                    dy: 2.5,
                  })}
                  numTicks={5}
                />

                {/* Interaction Overlay */}
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
                     <Line
                       from={{ x: xScale(getX(activeTooltipData)), y: 0 }}
                       to={{ x: xScale(getX(activeTooltipData)), y: yMax }}
                       stroke="#666"
                       strokeWidth={1}
                       pointerEvents="none"
                       strokeDasharray="5,5"
                     />
                     <circle
                       cx={xScale(getX(activeTooltipData))}
                       cy={yScale(getY(activeTooltipData))}
                       r={4}
                       fill={getGradeColor(activeTooltipData.grade)}
                       stroke="#fff"
                       strokeWidth={2}
                       pointerEvents="none"
                     />
                   </g>
                )}
              </Group>
            </svg>
          );
        }}
      </ParentSize>

      {/* We need to render tooltip outside of SVG for HTML content */}
      {/* Re-implement tooltip logic to handle both internal and external sources */}
      {/* Since useTooltip state is local, we can't easily force it from outside ParentSize render prop without refactoring. */}
      {/* But we calculated activeTooltipData inside render prop. We can't easily pass it out to TooltipInPortal which is outside. */}
      {/* Actually, TooltipInPortal is outside ParentSize. We need to know if we should show it. */}

      {/* Simplified approach: Only show internal tooltip via TooltipInPortal. External hover only shows the circle on the chart. */}
      {/* If user wants to see values on map hover, we can add that, but "indicator of that position" usually means the dot. */}

      {tooltipOpen && tooltipData && (
        <TooltipInPortal
          key={Math.random()} // Force re-render to update position
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            background: 'rgba(0, 0, 0, 0.9)',
            color: '#fff',
            border: '1px solid #444',
            boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
            fontSize: '12px',
            padding: '8px 12px',
            borderRadius: '4px',
            lineHeight: '1.4',
            zIndex: 1000,
            fontFamily: 'JetBrains Mono, monospace',
            willChange: 'transform',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>
            {tooltipData.elevation.toFixed(0)} ft
          </div>
          <div style={{ color: getGradeColor(tooltipData.grade), fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
            <strong>{tooltipData.grade.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'always' })}%</strong>
          </div>
          <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '2px' }}>
            <strong>{tooltipData.distance.toFixed(2)} mi</strong>
          </div>
        </TooltipInPortal>
      )}
    </div>
  );
}

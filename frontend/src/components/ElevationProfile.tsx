import { useMemo } from 'react';
import { Group } from '@visx/group';
import { AreaClosed } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { LinearGradient } from '@visx/gradient';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import { useTooltip, useTooltipInPortal, defaultStyles } from '@visx/tooltip';
import { bisector } from 'd3-array';

interface ElevationProfileProps {
  coordinates: number[][]; // [lon, lat, ele]
  height?: number;
}

interface DataPoint {
  distance: number; // miles
  elevation: number; // feet
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

export function ElevationProfile({ coordinates, height = 200 }: ElevationProfileProps) {
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

      if (i > 0) {
        const [prevLon, prevLat] = coordinates[i - 1];
        const dist = getDistanceFromLatLonInMiles(prevLat, prevLon, lat, lon);
        totalDist += dist;
      }

      points.push({
        distance: totalDist,
        elevation: (ele || 0) * METERS_TO_FEET
      });
    }

    return points;
  }, [coordinates]);

  if (data.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>No elevation data available</div>;
  }

  // Accessors
  const getX = (d: DataPoint) => d.distance;
  const getY = (d: DataPoint) => d.elevation;
  const bisectDistance = bisector<DataPoint, number>((d) => d.distance).left;

  return (
    <div style={{ height, width: '100%', position: 'relative' }} ref={containerRef}>
      <ParentSize>
        {({ width, height }: { width: number; height: number }) => {
          if (width < 10) return null;

          const margin = { top: 20, right: 20, bottom: 30, left: 50 };
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

          return (
            <svg width={width} height={height}>
              <LinearGradient id="area-gradient" from="#D97706" to="#D97706" fromOpacity={0.4} toOpacity={0} />

              <Group left={margin.left} top={margin.top}>
                <AreaClosed<DataPoint>
                  data={data}
                  x={(d: DataPoint) => xScale(getX(d)) ?? 0}
                  y={(d: DataPoint) => yScale(getY(d)) ?? 0}
                  yScale={yScale}
                  strokeWidth={2}
                  stroke="#D97706"
                  fill="url(#area-gradient)"
                  curve={curveMonotoneX}
                />

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
                    }
                  }}
                  onMouseLeave={() => hideTooltip()}
                />

                {tooltipOpen && tooltipData && (
                   <circle
                     cx={xScale(getX(tooltipData))}
                     cy={yScale(getY(tooltipData))}
                     r={4}
                     fill="#D97706"
                     stroke="#fff"
                     strokeWidth={2}
                     pointerEvents="none"
                   />
                )}
              </Group>
            </svg>
          );
        }}
      </ParentSize>

      {tooltipOpen && tooltipData && (
        <TooltipInPortal
          key={Math.random()} // Force re-render to update position
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            background: '#222',
            color: '#eee',
            border: '1px solid #444',
            boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
            fontSize: '12px',
            padding: '8px',
          }}
        >
          <div><strong>{tooltipData.elevation.toFixed(0)} ft</strong></div>
          <div>{tooltipData.distance.toFixed(2)} mi</div>
        </TooltipInPortal>
      )}
    </div>
  );
}

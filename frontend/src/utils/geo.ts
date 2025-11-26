import { scaleThreshold } from '@visx/scale';

export const METERS_TO_FEET = 3.28084;
export const MILES_TO_FEET = 5280;

export function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// Helper to calculate distance between two points in miles
export function getDistanceFromLatLonInMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
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

export function calculateGrade(start: number[], end: number[]) {
  const [lon1, lat1, ele1] = start;
  const [lon2, lat2, ele2] = end;

  if (ele1 === undefined || ele2 === undefined) return 0;

  const distMiles = getDistanceFromLatLonInMiles(lat1, lon1, lat2, lon2);
  const distFeet = distMiles * MILES_TO_FEET;
  const eleDiff = (ele2 - ele1) * METERS_TO_FEET;

  if (distFeet > 0) {
    return (eleDiff / distFeet) * 100;
  }
  return 0;
}

export const gradeColorScale = scaleThreshold<number, string>({
  domain: [0, 3, 6, 9, 12],
  range: [
    '#10B981', // < 0 (Green)
    '#9ca3af', // 0-3 (Gray)
    '#FCD34D', // 3-6 (Yellow)
    '#F59E0B', // 6-9 (Orange)
    '#EF4444', // 9-12 (Red)
    '#7F1D1D', // >= 12 (Dark Red)
  ],
});

export function getGradeColor(grade: number) {
  return gradeColorScale(grade);
}

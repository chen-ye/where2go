import { describe, it, expect } from 'vitest';
import {
  deg2rad,
  getDistanceFromLatLonInMiles,
  getDistanceFromLatLonInMeters,
  calculateGrade,
  getGradeColor,
  METERS_TO_FEET,
} from '../geo';

describe('geo utils', () => {
  describe('deg2rad', () => {
    it('should convert degrees to radians', () => {
      expect(deg2rad(180)).toBeCloseTo(Math.PI);
      expect(deg2rad(90)).toBeCloseTo(Math.PI / 2);
      expect(deg2rad(0)).toBe(0);
    });
  });

  describe('getDistanceFromLatLonInMiles', () => {
    it('should calculate distance correctly', () => {
      // Distance between New York (40.7128, -74.0060) and Los Angeles (34.0522, -118.2437)
      // Approx 2446 miles
      const dist = getDistanceFromLatLonInMiles(40.7128, -74.0060, 34.0522, -118.2437);
      expect(dist).toBeCloseTo(2445, -1); // Within 10 miles precision
    });

    it('should return 0 for same point', () => {
      expect(getDistanceFromLatLonInMiles(0, 0, 0, 0)).toBe(0);
    });
  });

  describe('getDistanceFromLatLonInMeters', () => {
    it('should calculate distance correctly', () => {
      // 1 degree of latitude is approx 111,139 meters
      const dist = getDistanceFromLatLonInMeters(0, 0, 1, 0);
      expect(dist).toBeCloseTo(111139, -3); // Within 1000 meters precision
    });
  });

  describe('calculateGrade', () => {
    it('should calculate grade correctly', () => {
      // 100ft rise over 1000ft run = 10% grade
      const start = [0, 0, 0]; // lon, lat, ele (meters)

      // We need to find a point that is 1000ft away.
      // 1000ft = 0.189394 miles
      // 1 degree lat approx 69 miles
      // 0.189394 / 69 = 0.0027448 degrees

      const endLat = 0.0027448;
      const ele2Meters = 100 / METERS_TO_FEET; // 100ft in meters

      const end = [0, endLat, ele2Meters];

      const grade = calculateGrade(start, end);
      expect(grade).toBeCloseTo(10, 0);
    });

    it('should return 0 if elevation is missing', () => {
      expect(calculateGrade([0,0], [0,0])).toBe(0);
    });
  });

  describe('getGradeColor', () => {
    it('should return correct colors for grades', () => {
      expect(getGradeColor(-1)).toBe('#10B981'); // Green
      expect(getGradeColor(1)).toBe('#9ca3af'); // Gray
      expect(getGradeColor(4)).toBe('#FCD34D'); // Yellow
      expect(getGradeColor(7)).toBe('#F59E0B'); // Orange
      expect(getGradeColor(10)).toBe('#EF4444'); // Red
      expect(getGradeColor(15)).toBe('#7F1D1D'); // Dark Red
    });
  });
});

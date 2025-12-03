import { describe, it, expect } from 'vitest';
import { hexToRgb, hslToRgb, getOpenPropsRgb } from '../colors';

describe('colors utils', () => {
  describe('hexToRgb', () => {
    it('should convert hex to rgb', () => {
      expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
      expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
      expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
      expect(hexToRgb('00ff00')).toEqual([0, 255, 0]); // Without hash
    });
  });

  describe('hslToRgb', () => {
    it('should convert hsl to rgb', () => {
      expect(hslToRgb(0, 0, 0)).toEqual([0, 0, 0]); // Black
      expect(hslToRgb(0, 0, 100)).toEqual([255, 255, 255]); // White
      expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]); // Red
      expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0]); // Green
      expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255]); // Blue
    });
  });

  describe('getOpenPropsRgb', () => {
    it('should get color from css variable (hsl)', () => {
      document.documentElement.style.setProperty('--test-color-hsl', 'hsl(0 100% 50%)');
      expect(getOpenPropsRgb('--test-color-hsl')).toEqual([255, 0, 0]);
    });

    it('should get color from css variable (rgb)', () => {
      document.documentElement.style.setProperty('--test-color-rgb', 'rgb(0, 255, 0)');
      expect(getOpenPropsRgb('--test-color-rgb')).toEqual([0, 255, 0]);
    });

    it('should get color from css variable (hex)', () => {
      document.documentElement.style.setProperty('--test-color-hex', '#0000ff');
      expect(getOpenPropsRgb('--test-color-hex')).toEqual([0, 0, 255]);
    });

    it('should return fallback for missing variable', () => {
      expect(getOpenPropsRgb('--non-existent')).toEqual([128, 128, 128]);
    });
  });
});

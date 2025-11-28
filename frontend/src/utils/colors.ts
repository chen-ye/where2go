/**
 * Utility to get Open Props color as RGB array for Deck.gl
 * Reads computed CSS custom properties from the document
 */

export function getOpenPropsRgb(colorVar: string): [number, number, number] {
  const rgb = getComputedStyle(document.documentElement)
    .getPropertyValue(colorVar)
    .trim();

  // Parse hsl() format from Open Props
  const hslMatch = rgb.match(/hsl\(([^)]+)\)/);
  if (hslMatch) {
    const [h, s, l] = hslMatch[1].split(/\s+/).map(v => parseFloat(v));
    return hslToRgb(h, s, l);
  }

  // Parse rgb() format
  const rgbMatch = rgb.match(/rgb\(([^)]+)\)/);
  if (rgbMatch) {
    const values = rgbMatch[1].split(',').map(v => parseInt(v.trim()));
    return [values[0], values[1], values[2]];
  }

  // Parse hex format
  const hexMatch = rgb.match(/#([a-fA-F0-9]{6})/);
  if (hexMatch) {
    return hexToRgb(hexMatch[1]);
  }

  // Fallback
  return [128, 128, 128];
}

/**
 * Convert hex color to RGBA array for Deck.gl
 */
export function hexToRgb(hex: string): [number, number, number] {
  // Remove # if present
  const h = hex.replace('#', '');

  // Parse hex values
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);

  return [r, g, b];
}


/**
 * Convert HSL to RGB
 * H: 0-360, S: 0-100, L: 0-100
 * Returns: [R, G, B, A] where each is 0-255
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s = s / 100;
  l = l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

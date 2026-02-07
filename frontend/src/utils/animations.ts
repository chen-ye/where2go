export function getMapPaddingDuration(element: Element = document.documentElement): number {
  const duration = getComputedStyle(element)
    .getPropertyValue('--duration-map-padding')
    .trim();

  // Remove 'ms' or 's' and parse
  const ms = parseFloat(duration);

  if (duration.endsWith('s') && !duration.endsWith('ms')) {
      return ms * 1000;
  }

  return isNaN(ms) ? 0 : ms;
}

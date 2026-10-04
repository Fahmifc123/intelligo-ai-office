/** Tile footprint at scale 1 (SPEC section 12.2): 64 x 32 px. */
export const TILE_W = 64;
export const TILE_H = 32;

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Isometric projection of grid coordinates (tiles) to world pixels at scale 1.
 * z is a vertical offset in pixels.
 */
export function iso(x: number, y: number, z = 0): ScreenPoint {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) - z };
}

/** Inverse of iso() on the floor plane (z = 0). */
export function screenToGrid(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Painter's order key (SPEC: depth sorting by x + y). */
export const depthKey = (x: number, y: number): number => x + y;

/** Depth of an axis-aligned box [x, y, w, d], sorted by its footprint center. */
export const boxDepth = (x: number, y: number, w: number, d: number): number =>
  x + w / 2 + (y + d / 2);

export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** World extents of the 22 x 16 office including wall height and bubbles above heads. */
export const WORLD = {
  width: 1270,
  height: 770,
  originX: 3 * 32,
  originTop: 118,
  contentHeight: 740,
};

/** Fits the office into a canvas of the given size (port of the prototype's resize()). */
export function fitViewport(width: number, height: number): Viewport {
  const scale = Math.min(width / WORLD.width, height / WORLD.height);
  return {
    scale,
    offsetX: width / 2 - WORLD.originX * scale,
    offsetY: (height - WORLD.contentHeight * scale) / 2 + WORLD.originTop * scale,
  };
}

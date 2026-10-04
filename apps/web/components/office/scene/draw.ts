import type { Graphics } from 'pixi.js';
import { iso } from './iso';

type Color = string;

export function quad(g: Graphics, pts: readonly { x: number; y: number }[], fill: Color): void {
  g.poly(pts.flatMap((p) => [p.x, p.y])).fill(fill);
}

/** Isometric prism [x, y, w, d] with height h starting at z0 (port of the prototype's box()). */
export function box(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  z0: number,
  top: Color,
  left: Color,
  right: Color,
): void {
  quad(
    g,
    [iso(x, y + d, z0), iso(x + w, y + d, z0), iso(x + w, y + d, z0 + h), iso(x, y + d, z0 + h)],
    left,
  );
  quad(
    g,
    [iso(x + w, y, z0), iso(x + w, y + d, z0), iso(x + w, y + d, z0 + h), iso(x + w, y, z0 + h)],
    right,
  );
  quad(
    g,
    [iso(x, y, z0 + h), iso(x + w, y, z0 + h), iso(x + w, y + d, z0 + h), iso(x, y + d, z0 + h)],
    top,
  );
}

/** Vertical glass pane between two floor points. */
export function glassPane(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  fill: Color,
  edge: Color,
): void {
  const h = 52;
  const a = iso(ax, ay);
  const b = iso(bx, by);
  g.poly([a.x, a.y, b.x, b.y, b.x, b.y - h, a.x, a.y - h]).fill(fill);
  g.moveTo(a.x, a.y - h)
    .lineTo(b.x, b.y - h)
    .moveTo(a.x, a.y)
    .lineTo(a.x, a.y - h)
    .stroke({ width: 1, color: edge });
}

export function plant(g: Graphics, x: number, y: number, pot: Color, potSide: Color): void {
  box(g, x - 0.2, y - 0.2, 0.4, 0.4, 12, 0, pot, potSide, potSide);
  const p = iso(x, y, 24);
  g.circle(p.x, p.y, 11).fill('#3f9a5a');
  g.circle(p.x - 4, p.y - 5, 7).fill('#5cb874');
}

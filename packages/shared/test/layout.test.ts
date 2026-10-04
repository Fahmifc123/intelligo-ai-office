import { describe, expect, it } from 'vitest';
import { officeLayout, seatOf } from '../src/layout';
import { OfficeLayout, type Point, type Rect } from '../src/schemas';

const inRect = ([x, y]: Point, [rx, ry, rw, rd]: Rect): boolean =>
  x >= rx && x <= rx + rw && y >= ry && y <= ry + rd;

const insideGrid = ([x, y]: Point): boolean =>
  x >= 0 && y >= 0 && x <= officeLayout.grid.w && y <= officeLayout.grid.h;

describe('officeLayout', () => {
  it('uses a 22 x 16 grid', () => {
    expect(officeLayout.grid).toEqual({ w: 22, h: 16 });
  });

  it('has 12 desks with unique ids', () => {
    const ids = officeLayout.desks.map((d) => d.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it('keeps every seat and spot inside the grid', () => {
    const points = [
      ...officeLayout.desks.map((d) => d.seat),
      ...Object.values(officeLayout.spots).flat(),
    ];
    for (const point of points) expect(insideGrid(point), String(point)).toBe(true);
  });

  it('keeps spots out of furniture and walls', () => {
    const obstacles = [
      ...officeLayout.furniture.map((f) => f.rect),
      ...officeLayout.walls.map((w) => w.rect),
      ...officeLayout.desks.map((d): Rect => [d.x - d.w / 2, d.y, d.w, d.d]),
    ];
    for (const point of Object.values(officeLayout.spots).flat()) {
      for (const rect of obstacles) expect(inRect(point, rect), `${point} in ${rect}`).toBe(false);
    }
  });

  it('places meeting spots in the meeting zone and pantry spots in the pantry zone', () => {
    const zone = (id: string): Rect => {
      const found = officeLayout.zones.find((z) => z.id === id);
      if (!found) throw new Error(id);
      return found.rect;
    };
    for (const p of officeLayout.spots.meeting) expect(inRect(p, zone('meeting'))).toBe(true);
    for (const p of officeLayout.spots.pantry) expect(inRect(p, zone('pantry'))).toBe(true);
  });

  it('resolves seats and rejects unknown desks', () => {
    expect(seatOf(officeLayout, 'd-0-0')).toEqual([1.8, 3.25]);
    expect(() => seatOf(officeLayout, 'd-9-9')).toThrow();
  });

  it('rejects an invalid layout', () => {
    expect(OfficeLayout.safeParse({ grid: { w: 22, h: 16 } }).success).toBe(false);
  });
});

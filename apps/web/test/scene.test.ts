import { agentsConfig, officeLayout, type Point } from '@intelligo/shared';
import { describe, expect, it } from 'vitest';
import { boxDepth, depthKey, fitViewport, iso, screenToGrid } from '../components/office/scene/iso';
import {
  buildNavGrid,
  findPath,
  hasLineOfSight,
  isBlockedPoint,
  pathLength,
} from '../components/office/scene/pathfinding';
import { assignSpots, besideDesk, type SpotRequest } from '../components/office/scene/spots';

describe('iso projection', () => {
  it('maps tiles to a 64 x 32 diamond', () => {
    expect(iso(0, 0)).toEqual({ x: 0, y: 0 });
    expect(iso(1, 0)).toEqual({ x: 32, y: 16 });
    expect(iso(0, 1)).toEqual({ x: -32, y: 16 });
    expect(iso(1, 1, 10)).toEqual({ x: 0, y: 22 });
  });

  it('round-trips through screenToGrid', () => {
    const p = iso(7.25, 3.5);
    const g = screenToGrid(p.x, p.y);
    expect(g.x).toBeCloseTo(7.25);
    expect(g.y).toBeCloseTo(3.5);
  });

  it('sorts by x + y', () => {
    expect(depthKey(2, 3)).toBe(5);
    expect(boxDepth(16.6, 3, 2.8, 2)).toBeCloseTo(22);
  });

  it('fits the office into the canvas', () => {
    expect(fitViewport(1270, 770).scale).toBeCloseTo(1);
    expect(fitViewport(635, 770).scale).toBeCloseTo(0.5);
  });
});

describe('pathfinding', () => {
  const grid = buildNavGrid(officeLayout);

  const crossesObstacle = (from: Point, path: Point[]): boolean => {
    let prev = from;
    for (const point of path) {
      if (!hasLineOfSight(grid, prev, point)) return true;
      prev = point;
    }
    return false;
  };

  it('uses a 0.5 tile grid', () => {
    expect(grid.cols).toBe(44);
    expect(grid.rows).toBe(32);
  });

  it('blocks desks and furniture but not seats', () => {
    expect(isBlockedPoint(grid, 1.8, 2.4)).toBe(true);
    expect(isBlockedPoint(grid, 18, 4)).toBe(true);
    for (const desk of officeLayout.desks)
      expect(isBlockedPoint(grid, desk.seat[0], desk.seat[1])).toBe(false);
  });

  it('walks from every seat to every spot without crossing an obstacle', () => {
    const spots = Object.values(officeLayout.spots).flat();
    for (const desk of officeLayout.desks) {
      for (const spot of spots) {
        const path = findPath(grid, desk.seat, spot);
        expect(path.at(-1)).toEqual(spot);
        expect(crossesObstacle(desk.seat, path), `${desk.id} -> ${spot}`).toBe(false);
      }
    }
  });

  it('enters the meeting room through the door, not through the glass', () => {
    const from: Point = [10.8, 3.25];
    const to: Point = [16.1, 3.5];
    const path = findPath(grid, from, to);
    expect(crossesObstacle(from, path)).toBe(false);
    // Must pass the door gap (y between 3.5 and 4.5 at x = 15).
    const passes = path.some(([x, y]) => x > 14 && x < 16 && y > 3.3 && y < 4.7);
    expect(passes).toBe(true);
  });

  it('reaches the side of another desk for review', () => {
    for (const desk of officeLayout.desks) {
      const target = besideDesk(officeLayout, desk.id);
      const path = findPath(grid, [12.3, 3.25], target);
      expect(crossesObstacle([12.3, 3.25], path)).toBe(false);
      expect(pathLength([12.3, 3.25], path)).toBeLessThan(40);
    }
  });

  it('goes straight when nothing is in the way', () => {
    expect(findPath(grid, [13.5, 2], [13.5, 14])).toEqual([[13.5, 14]]);
  });
});

describe('assignSpots', () => {
  const request = (
    agentId: string,
    activity: SpotRequest['activity'],
    targetSpot: string | null,
  ): SpotRequest => {
    const agent = agentsConfig.find((a) => a.id === agentId);
    return { agentId, deskId: agent?.deskId ?? 'd-0-0', activity, targetSpot };
  };

  it('seats working agents at their own desk', () => {
    const spots = assignSpots(officeLayout, [request('writer', 'working', 'desk')]);
    expect(spots.get('writer')).toMatchObject({ point: [4.8, 3.25], seated: true });
  });

  it('gives 11 meeting agents 11 different meeting seats', () => {
    const ids = agentsConfig.map((a) => a.id).filter((id) => id !== 'writer');
    const spots = assignSpots(
      officeLayout,
      ids.map((id) => request(id, 'meeting', 'meeting')),
    );
    const keys = new Set([...spots.values()].map((s) => s.key));
    expect(keys.size).toBe(11);
    for (const s of spots.values()) expect(s.key.startsWith('meeting:')).toBe(true);
  });

  it('overflows the 4 pantry spots into the lounge', () => {
    const ids = agentsConfig.map((a) => a.id).slice(0, 8);
    const spots = assignSpots(
      officeLayout,
      ids.map((id) => request(id, 'break', 'pantry')),
    );
    const groups = [...spots.values()].map((s) => s.key.split(':')[0]);
    expect(groups.filter((g) => g === 'pantry')).toHaveLength(4);
    expect(groups.filter((g) => g === 'lounge')).toHaveLength(4);
  });

  it('is deterministic and keeps previous spots', () => {
    const reqs = [request('cs', 'break', 'pantry'), request('ads', 'break', 'pantry')];
    const a = assignSpots(officeLayout, reqs);
    const b = assignSpots(officeLayout, reqs);
    expect([...a.entries()]).toEqual([...b.entries()]);
    const withNewcomer = assignSpots(
      officeLayout,
      [...reqs, request('analyst', 'break', 'pantry')],
      a,
    );
    expect(withNewcomer.get('cs')).toEqual(a.get('cs'));
    expect(withNewcomer.get('ads')).toEqual(a.get('ads'));
  });

  it('puts the reviewer beside the reviewed desk and hides offline agents', () => {
    const spots = assignSpots(officeLayout, [
      request('manager', 'reviewing', 'desk:writer'),
      request('writer', 'working', 'desk'),
      request('cs', 'offline', null),
    ]);
    expect(spots.get('manager')?.point).toEqual([5.55, 3.4]);
    expect(spots.has('cs')).toBe(false);
  });
});

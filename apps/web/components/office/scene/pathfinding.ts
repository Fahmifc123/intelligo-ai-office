import type { OfficeLayout, Point, Rect } from '@intelligo/shared';

/** Grid resolution in tiles (SPEC: A* on a 0.5 tile grid). */
export const CELL = 0.5;
/** Clearance kept around obstacles, roughly a character's radius. */
export const CLEARANCE = 0.2;

export interface NavGrid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
  obstacles: Rect[];
}

const inflate = ([x, y, w, d]: Rect, by: number): Rect => [x - by, y - by, w + by * 2, d + by * 2];

const inside = (px: number, py: number, [x, y, w, d]: Rect): boolean =>
  px >= x && px <= x + w && py >= y && py <= y + d;

/** Obstacles from desks, walls, and furniture (inflated by the clearance). */
export function collectObstacles(layout: OfficeLayout): Rect[] {
  const raw: Rect[] = [
    ...layout.desks.map((desk): Rect => [desk.x - desk.w / 2, desk.y, desk.w, desk.d]),
    ...layout.walls.map((wall) => wall.rect),
    ...layout.furniture.map((item) => item.rect),
  ];
  return raw.map((rect) => inflate(rect, CLEARANCE));
}

export function buildNavGrid(layout: OfficeLayout): NavGrid {
  const cols = Math.round(layout.grid.w / CELL);
  const rows = Math.round(layout.grid.h / CELL);
  const obstacles = collectObstacles(layout);
  const blocked = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5) * CELL;
      const cy = (j + 0.5) * CELL;
      if (obstacles.some((rect) => inside(cx, cy, rect))) blocked[j * cols + i] = 1;
    }
  }
  return { cols, rows, blocked, obstacles };
}

const cellOf = (grid: NavGrid, [x, y]: Point): [number, number] => [
  Math.min(grid.cols - 1, Math.max(0, Math.floor(x / CELL))),
  Math.min(grid.rows - 1, Math.max(0, Math.floor(y / CELL))),
];

const centerOf = (i: number, j: number): Point => [(i + 0.5) * CELL, (j + 0.5) * CELL];

export function isBlockedPoint(grid: NavGrid, x: number, y: number): boolean {
  return grid.obstacles.some((rect) => inside(x, y, rect));
}

/** True if the straight segment a-b stays clear of all obstacles. */
export function hasLineOfSight(grid: NavGrid, a: Point, b: Point): boolean {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(dist / 0.1));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (isBlockedPoint(grid, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Binary min-heap of node indices keyed by f-score. */
class OpenSet {
  private readonly items: number[] = [];
  constructor(private readonly score: Float64Array) {}

  get size(): number {
    return this.items.length;
  }

  private key(position: number): number {
    return this.score[this.items[position] ?? 0] ?? Infinity;
  }

  private swap(a: number, b: number): void {
    const items = this.items;
    const tmp = items[a] ?? 0;
    items[a] = items[b] ?? 0;
    items[b] = tmp;
  }

  push(node: number): void {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.key(parent) <= this.key(i)) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0] ?? -1;
    const last = items.pop() ?? -1;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.key(l) < this.key(m)) m = l;
        if (r < items.length && this.key(r) < this.key(m)) m = r;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* from `from` to `to` on the nav grid with 8-way moves (no corner cutting), followed by
 * line-of-sight smoothing. Returns waypoints ending exactly at `to`, excluding `from`.
 * Start and goal cells are always treated as walkable so seats next to desks are reachable.
 */
export function findPath(grid: NavGrid, from: Point, to: Point): Point[] {
  if (hasLineOfSight(grid, from, to)) return [to];
  const { cols, rows, blocked } = grid;
  const [si, sj] = cellOf(grid, from);
  const [gi, gj] = cellOf(grid, to);
  const start = sj * cols + si;
  const goal = gj * cols + gi;
  const walkable = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return false;
    const n = j * cols + i;
    return n === start || n === goal || blocked[n] === 0;
  };

  const total = cols * rows;
  const g = new Float64Array(total).fill(Infinity);
  const f = new Float64Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const h = (n: number): number => {
    const dx = Math.abs((n % cols) - gi);
    const dy = Math.abs(Math.floor(n / cols) - gj);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  g[start] = 0;
  f[start] = h(start);
  const open = new OpenSet(f);
  open.push(start);

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const ci = current % cols;
    const cj = Math.floor(current / cols);
    for (const [di, dj, cost] of NEIGHBORS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!walkable(ni, nj)) continue;
      if (di !== 0 && dj !== 0 && (!walkable(ci + di, cj) || !walkable(ci, cj + dj))) continue;
      const n = nj * cols + ni;
      const tentative = (g[current] ?? Infinity) + cost;
      if (tentative < (g[n] ?? Infinity)) {
        g[n] = tentative;
        f[n] = tentative + h(n);
        came[n] = current;
        open.push(n);
      }
    }
  }

  if (came[goal] === -1 && goal !== start) return [to];

  const cells: Point[] = [];
  for (let n = goal; n !== start && n !== -1; n = came[n] ?? -1) {
    cells.push(centerOf(n % cols, Math.floor(n / cols)));
  }
  cells.reverse();
  // Keep the goal cell center as a safe approach point, then step onto the exact target.
  const last = cells.at(-1);
  if (!last || last[0] !== to[0] || last[1] !== to[1]) cells.push(to);
  return smooth(grid, from, cells);
}

/** Greedy string pulling: skip waypoints that are directly visible. */
export function smooth(grid: NavGrid, from: Point, waypoints: Point[]): Point[] {
  const result: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < waypoints.length) {
    let furthest = i;
    for (let k = waypoints.length - 1; k > i; k--) {
      const candidate = waypoints[k];
      if (candidate && hasLineOfSight(grid, anchor, candidate)) {
        furthest = k;
        break;
      }
    }
    const next = waypoints[furthest];
    if (!next) break;
    result.push(next);
    anchor = next;
    i = furthest + 1;
  }
  return result;
}

export function pathLength(from: Point, path: readonly Point[]): number {
  let total = 0;
  let prev = from;
  for (const point of path) {
    total += Math.hypot(point[0] - prev[0], point[1] - prev[1]);
    prev = point;
  }
  return total;
}

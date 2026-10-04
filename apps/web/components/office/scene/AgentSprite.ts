import type { AgentActivity, Appearance, Point } from '@intelligo/shared';
import { Circle, Container, Graphics } from 'pixi.js';
import { iso } from './iso';
import { findPath, type NavGrid } from './pathfinding';
import type { SpotAssignment } from './spots';
import type { Theme } from './theme';

/** Walking speed in tiles per second (prototype: 2.3). */
export const WALK_SPEED = 2.3;
const LEG_COLOR = '#273352';

export interface AgentVisual {
  id: string;
  name: string;
  role: string;
  deskId: string;
  appearance: Appearance;
}

/** One office character: follows A* paths, sits, and shows activity props. */
export class AgentSprite extends Container {
  readonly agent: AgentVisual;
  private readonly body = new Graphics();
  private pos: Point;
  private path: Point[] = [];
  private step = Math.random() * 6;
  private seated: boolean;
  private assignmentKey: string | null = null;
  private targetSeated = false;
  private activity: AgentActivity = 'working';
  private highlighted = false;
  private dirty = true;
  private theme: Theme;

  constructor(agent: AgentVisual, start: Point, theme: Theme) {
    super();
    this.agent = agent;
    this.pos = [...start];
    this.seated = true;
    this.theme = theme;
    this.addChild(this.body);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Circle(0, -20, 18);
    this.syncPosition();
  }

  get point(): Point {
    return this.pos;
  }

  get isWalking(): boolean {
    return this.path.length > 0;
  }

  get isSeated(): boolean {
    return this.seated;
  }

  get currentActivity(): AgentActivity {
    return this.activity;
  }

  /** Head position relative to the sprite, for placing the status bubble. */
  get headOffset(): number {
    return this.seated ? -35 : -40;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.dirty = true;
  }

  setHighlighted(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    this.dirty = true;
  }

  setActivity(activity: AgentActivity): void {
    if (activity === this.activity) return;
    this.activity = activity;
    this.dirty = true;
  }

  /** Walks to a new spot; ignored if the spot did not change. */
  moveTo(grid: NavGrid, assignment: SpotAssignment): void {
    const end = this.path.at(-1) ?? this.pos;
    const samePoint = end[0] === assignment.point[0] && end[1] === assignment.point[1];
    this.targetSeated = assignment.seated;
    if (assignment.key === this.assignmentKey && samePoint) {
      if (!this.isWalking && this.seated !== assignment.seated) {
        this.seated = assignment.seated;
        this.dirty = true;
      }
      return;
    }
    this.assignmentKey = assignment.key;
    const atTarget =
      Math.hypot(this.pos[0] - assignment.point[0], this.pos[1] - assignment.point[1]) < 0.01;
    if (atTarget) {
      this.path = [];
      this.seated = assignment.seated;
    } else {
      this.path = findPath(grid, this.pos, assignment.point);
      this.seated = false;
    }
    this.dirty = true;
  }

  /** Places the character without walking (first render). */
  teleport(assignment: SpotAssignment): void {
    this.assignmentKey = assignment.key;
    this.pos = [...assignment.point];
    this.path = [];
    this.seated = assignment.seated;
    this.targetSeated = assignment.seated;
    this.syncPosition();
    this.dirty = true;
  }

  update(dt: number): void {
    if (this.path.length > 0) {
      let budget = WALK_SPEED * dt;
      this.step += dt * 6;
      while (budget > 0) {
        const target = this.path[0];
        if (!target) break;
        const dx = target[0] - this.pos[0];
        const dy = target[1] - this.pos[1];
        const dist = Math.hypot(dx, dy);
        if (dist <= budget) {
          this.pos = [target[0], target[1]];
          this.path.shift();
          budget -= dist;
        } else {
          this.pos = [this.pos[0] + (dx / dist) * budget, this.pos[1] + (dy / dist) * budget];
          budget = 0;
        }
      }
      if (this.path.length === 0) this.seated = this.targetSeated;
      this.syncPosition();
      this.dirty = true;
    }
    if (this.dirty) {
      this.draw();
      this.dirty = false;
    }
  }

  private syncPosition(): void {
    const p = iso(this.pos[0], this.pos[1]);
    this.position.set(p.x, p.y);
    this.zIndex = this.pos[0] + this.pos[1] + 0.01;
  }

  private draw(): void {
    const g = this.body;
    const theme = this.theme;
    const { shirt, hair, skin } = this.agent.appearance;
    const walking = this.path.length > 0;
    const bob = walking ? Math.abs(Math.sin(this.step * 2)) * 2.2 : 0;
    const sit = this.seated ? 5 : 0;
    const base = -bob + sit;
    g.clear();
    g.ellipse(0, 0, 10, 4.5).fill(theme.shadow);
    if (this.highlighted) g.ellipse(0, 0, 14, 6.5).stroke({ width: 2, color: theme.accent });
    if (!this.seated) {
      const swing = walking ? Math.sin(this.step * 2) * 2.5 : 0;
      g.rect(-5 + swing, base - 10, 4, 10).fill(LEG_COLOR);
      g.rect(1 - swing, base - 10, 4, 10).fill(LEG_COLOR);
    }
    g.roundRect(-8, base - 25, 16, 16, 5).fill(shirt);
    g.circle(0, base - 31, 6.5).fill(skin);
    g.arc(0, base - 32.5, 6.8, Math.PI * 1.05, Math.PI * 1.95).fill(hair);

    const arrived = !walking;
    if (arrived && this.activity === 'break') {
      // Coffee cup in hand.
      g.roundRect(7, base - 19, 5, 6, 1)
        .fill(theme.surface)
        .stroke({ width: 1, color: theme.ink });
    }
    if (arrived && this.activity === 'reviewing') {
      // Magnifying glass.
      g.circle(12, base - 33, 4).stroke({ width: 1.6, color: theme.accent });
      g.moveTo(9.5, base - 30)
        .lineTo(6.5, base - 26)
        .stroke({ width: 2, color: theme.accent });
    }
  }
}

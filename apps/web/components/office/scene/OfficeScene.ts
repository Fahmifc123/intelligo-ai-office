import type { AgentActivity, OfficeLayout } from '@intelligo/shared';
import { Application, Container, Graphics, Matrix, Text } from 'pixi.js';
import { AgentSprite, type AgentVisual } from './AgentSprite';
import { box, glassPane, plant, quad } from './draw';
import { boxDepth, fitViewport, iso } from './iso';
import { buildNavGrid, type NavGrid } from './pathfinding';
import { assignSpots, type SpotAssignment } from './spots';
import { StatusBubble } from './StatusBubble';
import { readTheme, type Theme } from './theme';

/** True when WebGL runs on the CPU (SwiftShader, llvmpipe), e.g. machines without a usable GPU. */
export function isSoftwareRenderer(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software/i.test(renderer);
  } catch {
    return false;
  }
}

export interface AgentLiveState {
  agentId: string;
  activity: AgentActivity;
  statusText: string;
  targetSpot: string | null;
}

export interface OfficeSceneOptions {
  layout: OfficeLayout;
  agents: readonly AgentVisual[];
  onSelect(agentId: string): void;
}

interface DeskView {
  graphics: Graphics;
  deskId: string;
  ownerId: string | undefined;
  on: boolean;
}

/**
 * PixiJS office: static floor and walls, depth-sorted furniture and characters,
 * and screen-space status bubbles. Positions are computed here from agent_states,
 * never read from or written to the database.
 */
export class OfficeScene {
  private readonly app: Application;
  private readonly layout: OfficeLayout;
  private readonly grid: NavGrid;
  private readonly world = new Container();
  private readonly staticLayer = new Container();
  private readonly objects = new Container();
  private readonly bubbles = new Container();
  private readonly sprites = new Map<string, AgentSprite>();
  private readonly bubbleViews = new Map<string, StatusBubble>();
  private readonly desks: DeskView[] = [];
  private readonly furniture: { graphics: Graphics; draw: (g: Graphics, theme: Theme) => void }[] =
    [];
  private states = new Map<string, AgentLiveState>();
  private assignments = new Map<string, SpotAssignment>();
  private theme: Theme;
  private labelsVisible = true;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private scale = 1;
  private placed = false;
  private readonly onSelect: (agentId: string) => void;
  private readonly resizeObserver: ResizeObserver;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.app.ticker.stop();
    else this.app.ticker.start();
  };

  private constructor(app: Application, host: HTMLElement, options: OfficeSceneOptions) {
    this.app = app;
    this.layout = options.layout;
    this.grid = buildNavGrid(options.layout);
    this.onSelect = options.onSelect;
    this.theme = readTheme();

    this.objects.sortableChildren = true;
    this.bubbles.sortableChildren = true;
    this.world.addChild(this.staticLayer, this.objects);
    app.stage.addChild(this.world, this.bubbles);

    this.drawStatic();
    this.createFurniture();
    for (const agent of options.agents) this.createAgent(agent);

    // Movement is time-based; a generous clamp keeps walking speed right on slow devices.
    app.ticker.add((ticker) => this.tick(Math.min(0.25, ticker.deltaMS / 1000)));
    this.resizeObserver = new ResizeObserver(() => this.resize(host));
    this.resizeObserver.observe(host);
    this.resize(host);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  static async create(host: HTMLElement, options: OfficeSceneOptions): Promise<OfficeScene> {
    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      // MSAA is cheap on a GPU but halves the frame rate on CPU (software) WebGL.
      antialias: !isSoftwareRenderer(),
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      width: Math.max(200, host.clientWidth),
      height: Math.max(200, host.clientHeight),
    });
    app.canvas.style.display = 'block';
    app.canvas.setAttribute('aria-label', 'Denah kantor isometrik');
    app.canvas.setAttribute('role', 'img');
    host.appendChild(app.canvas);
    return new OfficeScene(app, host, options);
  }

  /** Applies agent_states rows. New targets start walking on the next frame. */
  setStates(states: readonly AgentLiveState[]): void {
    this.states = new Map(states.map((s) => [s.agentId, s]));
    const requests = [...this.sprites.values()].map((sprite) => {
      const state = this.states.get(sprite.agent.id);
      return {
        agentId: sprite.agent.id,
        deskId: sprite.agent.deskId,
        activity: state?.activity ?? 'working',
        targetSpot: state?.targetSpot ?? 'desk',
      };
    });
    this.assignments = assignSpots(this.layout, requests, this.assignments);
    for (const sprite of this.sprites.values()) {
      const state = this.states.get(sprite.agent.id);
      const assignment = this.assignments.get(sprite.agent.id);
      const visible = Boolean(assignment) && state?.activity !== 'offline';
      sprite.visible = visible;
      if (!assignment) continue;
      sprite.setActivity(state?.activity ?? 'working');
      if (this.placed) sprite.moveTo(this.grid, assignment);
      else sprite.teleport(assignment);
    }
    this.placed = true;
    this.refreshBubbles();
  }

  setSelected(agentId: string | null): void {
    this.selectedId = agentId;
    this.refreshHighlights();
    this.refreshBubbles();
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    this.refreshBubbles();
  }

  /** Re-reads CSS variables (light / dark) and repaints everything. */
  refreshTheme(): void {
    this.theme = readTheme();
    this.drawStatic();
    this.cacheStaticLayer();
    for (const item of this.furniture) {
      item.graphics.clear();
      item.draw(item.graphics, this.theme);
    }
    for (const desk of this.desks) this.drawDesk(desk);
    for (const sprite of this.sprites.values()) sprite.setTheme(this.theme);
    for (const bubble of this.bubbleViews.values()) bubble.setTheme(this.theme);
  }

  /** Screen position (CSS px, relative to the canvas) of an agent's feet. For tests and overlays. */
  agentScreenPosition(agentId: string): { x: number; y: number; walking: boolean } | null {
    const sprite = this.sprites.get(agentId);
    if (!sprite || !sprite.visible) return null;
    return {
      x: this.world.position.x + sprite.position.x * this.scale,
      y: this.world.position.y + sprite.position.y * this.scale,
      walking: sprite.isWalking,
    };
  }

  agentGridPosition(agentId: string): { x: number; y: number; walking: boolean } | null {
    const sprite = this.sprites.get(agentId);
    if (!sprite) return null;
    return { x: sprite.point[0], y: sprite.point[1], walking: sprite.isWalking };
  }

  get fps(): number {
    return this.app.ticker.FPS;
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver.disconnect();
    this.app.destroy({ removeView: true }, { children: true });
  }

  private resize(host: HTMLElement): void {
    const width = Math.max(200, host.clientWidth);
    const height = Math.max(200, host.clientHeight);
    this.app.renderer.resize(width, height);
    const viewport = fitViewport(width, height);
    this.scale = viewport.scale;
    this.world.scale.set(viewport.scale);
    this.world.position.set(viewport.offsetX, viewport.offsetY);
    this.cacheStaticLayer();
    this.positionBubbles();
  }

  /** Floor, walls, and signage never move: render them once into a texture at screen resolution. */
  private cacheStaticLayer(): void {
    this.staticLayer.cacheAsTexture(false);
    this.staticLayer.cacheAsTexture({
      resolution: Math.min(window.devicePixelRatio || 1, 2) * Math.max(0.5, this.scale),
      antialias: true,
    });
  }

  private tick(dt: number): void {
    let deskChanged = false;
    for (const sprite of this.sprites.values()) {
      sprite.update(dt);
    }
    for (const desk of this.desks) {
      const owner = desk.ownerId ? this.sprites.get(desk.ownerId) : undefined;
      const on = Boolean(
        owner?.visible && owner.isSeated && !owner.isWalking && owner.currentActivity === 'working',
      );
      if (on !== desk.on) {
        desk.on = on;
        this.drawDesk(desk);
        deskChanged = true;
      }
    }
    if (deskChanged) this.objects.sortDirty = true;
    this.positionBubbles();
  }

  private positionBubbles(): void {
    // Bubbles stay readable on desktop and shrink on small screens so they do not pile up.
    const bubbleScale = Math.min(1, Math.max(0.6, this.scale * 1.15));
    for (const [agentId, bubble] of this.bubbleViews) {
      const sprite = this.sprites.get(agentId);
      if (!sprite || !bubble.visible) continue;
      bubble.position.set(
        this.world.position.x + sprite.position.x * this.scale,
        this.world.position.y + (sprite.position.y + sprite.headOffset) * this.scale - 2,
      );
      bubble.zIndex = sprite.zIndex;
      bubble.scale.set(bubbleScale);
    }
  }

  private refreshHighlights(): void {
    for (const sprite of this.sprites.values()) {
      sprite.setHighlighted(
        sprite.agent.id === this.selectedId || sprite.agent.id === this.hoverId,
      );
    }
  }

  private refreshBubbles(): void {
    for (const [agentId, bubble] of this.bubbleViews) {
      const sprite = this.sprites.get(agentId);
      const state = this.states.get(agentId);
      const focus = agentId === this.selectedId || agentId === this.hoverId;
      bubble.visible = Boolean(sprite?.visible) && (this.labelsVisible || focus);
      bubble.update(
        state?.activity ?? 'working',
        state?.statusText ?? '',
        agentId === this.selectedId,
      );
    }
    this.positionBubbles();
  }

  private createAgent(agent: AgentVisual): void {
    const desk = this.layout.desks.find((d) => d.id === agent.deskId);
    const sprite = new AgentSprite(agent, desk ? desk.seat : [13.5, 8], this.theme);
    sprite.on('pointertap', () => this.onSelect(agent.id));
    sprite.on('pointerover', () => {
      this.hoverId = agent.id;
      this.refreshHighlights();
      this.refreshBubbles();
    });
    sprite.on('pointerout', () => {
      if (this.hoverId === agent.id) this.hoverId = null;
      this.refreshHighlights();
      this.refreshBubbles();
    });
    this.sprites.set(agent.id, sprite);
    this.objects.addChild(sprite);

    const bubble = new StatusBubble(agent.role, this.theme);
    this.bubbleViews.set(agent.id, bubble);
    this.bubbles.addChild(bubble);

    if (desk) {
      const view: DeskView = {
        graphics: new Graphics(),
        deskId: desk.id,
        ownerId: agent.id,
        on: false,
      };
      view.graphics.zIndex = boxDepth(desk.x - desk.w / 2, desk.y, desk.w, desk.d);
      this.desks.push(view);
      this.objects.addChild(view.graphics);
      this.drawDesk(view);

      const chair = new Graphics();
      chair.zIndex = desk.seat[0] + desk.seat[1] - 0.05;
      const drawChair = (g: Graphics, theme: Theme): void =>
        box(
          g,
          desk.seat[0] - 0.22,
          desk.seat[1] - 0.12,
          0.44,
          0.38,
          9,
          0,
          theme.chair,
          theme.chair,
          theme.chair,
        );
      drawChair(chair, this.theme);
      this.furniture.push({ graphics: chair, draw: drawChair });
      this.objects.addChild(chair);
    }
  }

  private drawDesk(view: DeskView): void {
    const desk = this.layout.desks.find((d) => d.id === view.deskId);
    if (!desk) return;
    const theme = this.theme;
    const g = view.graphics;
    const x0 = desk.x - desk.w / 2;
    const y0 = desk.y;
    g.clear();
    box(g, x0, y0, desk.w, desk.d, 18, 0, theme['desk-top'], theme['desk-l'], theme['desk-r']);
    const m0 = iso(desk.x - 0.35, y0 + 0.18, 20);
    const m1 = iso(desk.x + 0.35, y0 + 0.18, 20);
    const h = 17;
    g.poly([m0.x, m0.y, m1.x, m1.y, m1.x, m1.y - h, m0.x, m0.y - h]).fill(
      view.on ? theme.screen : theme.chair,
    );
    if (view.on) {
      for (let i = 0; i < 3; i++) {
        const t = 0.25 + i * 0.22;
        const len = 0.3 + ((i * 37 + desk.x * 10) % 5) / 10;
        const ax = m0.x + (m1.x - m0.x) * 0.15;
        const ay = m0.y + (m1.y - m0.y) * 0.15 - h * (1 - t);
        g.moveTo(ax, ay).lineTo(ax + (m1.x - m0.x) * len, ay + (m1.y - m0.y) * len);
      }
      g.stroke({ width: 1.2, color: theme.accent });
    }
    box(g, desk.x - 0.05, y0 + 0.2, 0.1, 0.06, 2, 18, theme.chair, theme.chair, theme.chair);
    box(g, desk.x - 0.25, y0 + 0.45, 0.5, 0.15, 1.5, 18, theme.line, theme.line, theme.line);
  }

  private addFurniture(depth: number, draw: (g: Graphics, theme: Theme) => void): void {
    const graphics = new Graphics();
    graphics.zIndex = depth;
    draw(graphics, this.theme);
    this.furniture.push({ graphics, draw });
    this.objects.addChild(graphics);
  }

  private createFurniture(): void {
    for (const item of this.layout.furniture) {
      const [x, y, w, d] = item.rect;
      const depth = boxDepth(x, y, w, d);
      switch (item.kind) {
        case 'meeting_table':
        case 'coffee_table':
          this.addFurniture(depth, (g, t) =>
            box(g, x, y, w, d, item.height, 0, t['desk-top'], t['desk-l'], t['desk-r']),
          );
          break;
        case 'pantry_counter':
          this.addFurniture(depth, (g, t) => {
            box(g, x, y, w, d, item.height, 0, t['desk-top'], t['desk-l'], t['desk-r']);
            box(g, x + 0.15, y + 0.5, 0.45, 0.5, 15, item.height, t.ink, t.chair, t.chair);
            box(g, x + 0.2, y + 2, 0.35, 0.35, 6, item.height, t.accent, t.accent, t.accent);
          });
          break;
        case 'sofa':
          this.addFurniture(depth, (g, t) => {
            box(g, x, y + d - 0.3, w, 0.3, item.height, 0, t.navy, t.navy, t.navy);
            box(g, x, y, w, Math.min(0.8, d), 10, 0, t.meet, t.navy, t.navy);
          });
          break;
        case 'plant':
          this.addFurniture(x + w / 2 + y + d / 2 + 0.4, (g, t) =>
            plant(g, x + w / 2, y + d / 2, t['desk-l'], t['desk-r']),
          );
          break;
      }
    }
    // Glass walls are split into short panes so characters sort correctly around them.
    for (const wall of this.layout.walls.filter((w) => w.kind === 'glass')) {
      const [x, y, w, d] = wall.rect;
      const vertical = d > w;
      const length = vertical ? d : w;
      const steps = Math.max(1, Math.round(length));
      for (let i = 0; i < steps; i++) {
        const a = (length / steps) * i;
        const b = (length / steps) * (i + 1);
        if (vertical) {
          const cx = x + w / 2;
          this.addFurniture(cx + y + (a + b) / 2, (g, t) =>
            glassPane(g, cx, y + a, cx, y + b, t.glass, t['glass-edge']),
          );
        } else {
          const cy = y + d / 2;
          this.addFurniture(x + (a + b) / 2 + cy, (g, t) =>
            glassPane(g, x + a, cy, x + b, cy, t.glass, t['glass-edge']),
          );
        }
      }
    }
  }

  private drawStatic(): void {
    for (const child of this.staticLayer.removeChildren()) child.destroy({ children: true });
    const theme = this.theme;
    const g = new Graphics();
    const zoneOf = (gx: number, gy: number): string | undefined =>
      this.layout.zones.find(
        ({ rect: [x, y, w, d] }) => gx >= x && gx < x + w && gy >= y && gy < y + d,
      )?.id;

    for (let gx = 0; gx < this.layout.grid.w; gx++) {
      for (let gy = 0; gy < this.layout.grid.h; gy++) {
        const odd = (gx + gy) % 2 === 1;
        const zone = zoneOf(gx, gy);
        let color = odd ? theme['floor-a'] : theme['floor-b'];
        if (zone === 'meeting') color = odd ? theme['floor-meet'] : theme['floor-a'];
        if (zone === 'pantry') color = odd ? theme['floor-pantry'] : theme['floor-b'];
        quad(g, [iso(gx, gy), iso(gx + 1, gy), iso(gx + 1, gy + 1), iso(gx, gy + 1)], color);
      }
    }
    quad(g, [iso(13, 0.2), iso(14, 0.2), iso(14, 16), iso(13, 16)], theme.line);

    for (const wall of this.layout.walls.filter((w) => w.kind === 'solid')) {
      const [x, y, w, d] = wall.rect;
      box(g, x, y, w, d, 74, 0, theme['wall-top'], theme['wall-l'], theme['wall-r']);
    }
    for (const win of this.layout.windows) {
      const pts =
        win.wall === 'back'
          ? [
              iso(win.at, 0, 24),
              iso(win.at + win.len, 0, 24),
              iso(win.at + win.len, 0, 60),
              iso(win.at, 0, 60),
            ]
          : [
              iso(0, win.at, 24),
              iso(0, win.at + win.len, 24),
              iso(0, win.at + win.len, 60),
              iso(0, win.at, 60),
            ];
      quad(g, pts, theme.window);
    }
    this.staticLayer.addChild(g);

    this.addFloorText('AREA KERJA', 2.2, 15.2);
    this.addFloorText('RUANG RAPAT', 15.3, 6.6);
    this.addFloorText('PANTRY & LOUNGE', 15.3, 9.6);
    this.addSign();
    this.addTv();
  }

  private addFloorText(label: string, x: number, y: number): void {
    const origin = iso(x, y);
    const text = new Text({
      text: label,
      style: {
        fontFamily: this.theme.fontBody,
        fontSize: 13,
        fontWeight: '700',
        fill: this.theme.muted,
      },
      resolution: 2,
    });
    text.alpha = 0.55;
    text.anchor.set(0, 1);
    text.setFromMatrix(new Matrix(32 / 40, 16 / 40, -32 / 40, 16 / 40, origin.x, origin.y));
    this.staticLayer.addChild(text);
  }

  /** Wall-mounted panel skewed onto the back wall. */
  private wallPanel(x: number, z: number): Container {
    const origin = iso(x, 0, z);
    const panel = new Container();
    panel.setFromMatrix(new Matrix(1, 0.5, 0, 1, origin.x, origin.y));
    this.staticLayer.addChild(panel);
    return panel;
  }

  private addSign(): void {
    const theme = this.theme;
    const panel = this.wallPanel(1.2, 62);
    const width = 6.2 * 32;
    const bg = new Graphics();
    bg.roundRect(0, 0, width, 40, 5).fill(theme.surface).stroke({ width: 2, color: theme.accent });
    const brand = new Text({
      text: 'Intelligo',
      style: { fontFamily: theme.fontDisplay, fontSize: 21, fontWeight: '800', fill: theme.navy },
      resolution: 2,
    });
    brand.position.set(12, 6);
    const suffix = new Text({
      text: ' AI Office',
      style: { fontFamily: theme.fontDisplay, fontSize: 21, fontWeight: '800', fill: theme.accent },
      resolution: 2,
    });
    suffix.position.set(12 + brand.width, 6);
    const sub = new Text({
      text: 'KANTOR AI · BANDUNG',
      style: { fontFamily: theme.fontBody, fontSize: 7.5, fontWeight: '600', fill: theme.muted },
      resolution: 3,
    });
    sub.position.set(12, 29);
    panel.addChild(bg, brand, suffix, sub);
  }

  private addTv(): void {
    const theme = this.theme;
    const panel = this.wallPanel(16.9, 58);
    const width = 3 * 32;
    const height = 32;
    const bg = new Graphics();
    bg.rect(0, 0, width, height).fill(theme.navy);
    const bars = [0.4, 0.55, 0.5, 0.7, 0.65, 0.85];
    bars.forEach((b, i) => {
      bg.rect(6 + i * 14, height - 4 - b * 18, 9, b * 18).fill(
        i === bars.length - 1 ? theme.accent : 'rgba(255,255,255,0.55)',
      );
    });
    const label = new Text({
      text: 'PENDAFTARAN / MINGGU',
      style: { fontFamily: theme.fontBody, fontSize: 6, fontWeight: '600', fill: theme.surface },
      resolution: 3,
    });
    label.position.set(6, 2);
    panel.addChild(bg, label);
  }
}

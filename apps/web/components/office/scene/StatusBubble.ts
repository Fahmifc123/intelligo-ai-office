import type { AgentActivity } from '@intelligo/shared';
import { Container, Graphics, Text } from 'pixi.js';
import { ACTIVITY_TOKEN, truncateStatus } from './colors';
import type { Theme } from './theme';

const FONT_SIZE = 11;
const PAD = 6;
const TEXT_RESOLUTION = (): number => Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

/** Screen-space label above a character: activity dot, role, and truncated status. */
export class StatusBubble extends Container {
  private readonly bg = new Graphics();
  private readonly roleText: Text;
  private readonly statusText: Text;
  private activity: AgentActivity = 'idle';
  private selected = false;
  private theme: Theme;

  constructor(role: string, theme: Theme) {
    super();
    this.theme = theme;
    this.roleText = new Text({
      text: role,
      style: {
        fontFamily: theme.fontBody,
        fontSize: FONT_SIZE,
        fontWeight: '700',
        fill: theme['label-ink'],
      },
      resolution: TEXT_RESOLUTION(),
    });
    this.statusText = new Text({
      text: '',
      style: {
        fontFamily: theme.fontBody,
        fontSize: FONT_SIZE - 1,
        fontWeight: '500',
        fill: theme['label-sub'],
      },
      resolution: TEXT_RESOLUTION(),
    });
    this.addChild(this.bg, this.roleText, this.statusText);
    this.eventMode = 'none';
    // One cached texture per bubble: re-rendered only when its content changes.
    this.cacheAsTexture({ resolution: TEXT_RESOLUTION() });
  }

  update(activity: AgentActivity, status: string, selected: boolean): void {
    const text = truncateStatus(status);
    if (activity === this.activity && text === this.statusText.text && selected === this.selected)
      return;
    this.activity = activity;
    this.statusText.text = text;
    this.selected = selected;
    this.redraw();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.roleText.style.fontFamily = theme.fontBody;
    this.roleText.style.fill = theme['label-ink'];
    this.statusText.style.fontFamily = theme.fontBody;
    this.statusText.style.fill = theme['label-sub'];
    this.redraw();
  }

  private redraw(): void {
    const theme = this.theme;
    const width = Math.max(this.roleText.width + 14, this.statusText.width) + PAD * 2;
    const height = FONT_SIZE * 2 + 9;
    const x = -width / 2;
    const y = -height;
    this.bg.clear();
    this.bg.roundRect(x + 0.5, y + 1.5, width, height, 7).fill(theme.shadow);
    this.bg.roundRect(x, y, width, height, 7).fill(theme['label-bg']);
    if (this.selected)
      this.bg.roundRect(x, y, width, height, 7).stroke({ width: 1.5, color: theme.accent });
    this.bg
      .circle(x + PAD + 3.5, y + 4 + FONT_SIZE * 0.55, 3.5)
      .fill(theme[ACTIVITY_TOKEN[this.activity]]);
    this.roleText.position.set(x + PAD + 11, y + 2);
    this.statusText.position.set(x + PAD, y + 4 + FONT_SIZE);
    this.updateCacheTexture();
  }
}

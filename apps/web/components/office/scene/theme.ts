/** CSS custom properties read by the office renderer (defined in app/globals.css). */
export const THEME_TOKENS = [
  'bg',
  'surface',
  'ink',
  'muted',
  'line',
  'navy',
  'accent',
  'ok',
  'warn',
  'meet',
  'idle',
  'floor-a',
  'floor-b',
  'floor-meet',
  'floor-pantry',
  'wall-top',
  'wall-l',
  'wall-r',
  'window',
  'desk-top',
  'desk-l',
  'desk-r',
  'chair',
  'screen',
  'glass',
  'glass-edge',
  'label-bg',
  'label-ink',
  'label-sub',
  'shadow',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type Theme = Record<ThemeToken, string> & { fontBody: string; fontDisplay: string };

const FALLBACK = '#888888';

export function readTheme(element: HTMLElement = document.documentElement): Theme {
  const styles = getComputedStyle(element);
  const theme = {} as Theme;
  for (const token of THEME_TOKENS) {
    theme[token] = styles.getPropertyValue(`--${token}`).trim() || FALLBACK;
  }
  const bodyStyles = getComputedStyle(document.body);
  theme.fontBody = bodyStyles.fontFamily || 'system-ui, sans-serif';
  theme.fontDisplay = styles.getPropertyValue('--font-display').trim() || theme.fontBody;
  return theme;
}

/** Calls `onChange` when the system color scheme flips. Returns an unsubscribe function. */
export function watchTheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

import type { ThemeTokens, ThemeMode } from '../types/theme.js';

const sharedColors = {
  primary: '#BA7517',
  accent: '#BA7517',
  error: '#EF4444',
  warning: '#F59E0B',
  success: '#22C55E',
};

const sharedTypography = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontFamilyMono:
    "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', 'Consolas', monospace",
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
};

const sharedSpacing: Record<string, string> = {
  '0': '0',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
  '12': '3rem',
  '16': '4rem',
  '20': '5rem',
};

const darkTheme: ThemeTokens = {
  colors: {
    ...sharedColors,
    background: '#0A0A0B',
    surface: '#141416',
    text: '#F0F0F2',
    textSecondary: '#9B9BA4',
    border: '#2A2A2E',
  },
  typography: sharedTypography,
  spacing: sharedSpacing,
};

const lightTheme: ThemeTokens = {
  colors: {
    ...sharedColors,
    background: '#FAFAFA',
    surface: '#FFFFFF',
    text: '#171717',
    textSecondary: '#6B7280',
    border: '#E5E5E5',
  },
  typography: sharedTypography,
  spacing: sharedSpacing,
};

const themes: Record<ThemeMode, ThemeTokens> = {
  dark: darkTheme,
  light: lightTheme,
};

export function getThemeTokens(mode: ThemeMode): ThemeTokens {
  const tokens = themes[mode];
  if (!tokens) {
    throw new Error('Invalid theme mode');
  }
  return tokens;
}

export function applyTheme(mode: ThemeMode): void {
  if (mode !== 'dark' && mode !== 'light') {
    throw new Error('Invalid theme mode');
  }

  if (typeof document === 'undefined') {
    return;
  }

  const tokens = getThemeTokens(mode);
  const root = document.documentElement;

  root.setAttribute('data-theme', mode);

  root.style.setProperty('--color-primary', tokens.colors.primary);
  root.style.setProperty('--color-accent', tokens.colors.accent);
  root.style.setProperty('--color-background', tokens.colors.background);
  root.style.setProperty('--color-surface', tokens.colors.surface);
  root.style.setProperty('--color-text', tokens.colors.text);
  root.style.setProperty('--color-text-secondary', tokens.colors.textSecondary);
  root.style.setProperty('--color-border', tokens.colors.border);
  root.style.setProperty('--color-error', tokens.colors.error);
  root.style.setProperty('--color-warning', tokens.colors.warning);
  root.style.setProperty('--color-success', tokens.colors.success);

  root.style.setProperty('--font-family', tokens.typography.fontFamily);
  root.style.setProperty('--font-mono', tokens.typography.fontFamilyMono);
}

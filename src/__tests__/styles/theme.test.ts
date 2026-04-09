// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getThemeTokens, applyTheme } from '../../lib/theme.js';

describe('getThemeTokens', () => {
  it('returns correct dark theme tokens', () => {
    const tokens = getThemeTokens('dark');

    expect(tokens.colors.accent).toBe('#BA7517');
    expect(tokens.colors.primary).toBe('#BA7517');
    expect(tokens.colors.background).toBe('#0A0A0B');
    expect(tokens.typography.fontFamilyMono).toBeDefined();
    expect(tokens.typography.fontFamilyMono).toContain('monospace');
    expect(tokens.spacing).toBeDefined();
  });

  it('returns correct light theme tokens', () => {
    const tokens = getThemeTokens('light');

    expect(tokens.colors.accent).toBe('#BA7517');
    expect(tokens.colors.background).toBe('#FAFAFA');
    expect(tokens.colors.text).toBe('#171717');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('throws error for invalid theme mode', () => {
    // @ts-expect-error testing invalid input
    expect(() => applyTheme('invalid')).toThrow('Invalid theme mode');
    // @ts-expect-error testing invalid input
    expect(() => applyTheme(undefined)).toThrow('Invalid theme mode');
  });

  it('sets CSS variables on the document element for dark mode', () => {
    applyTheme('dark');

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--color-accent')).toBe('#BA7517');
    expect(root.style.getPropertyValue('--font-mono')).toContain('monospace');
    expect(root.style.getPropertyValue('--color-background')).toBe('#0A0A0B');
  });

  it('sets CSS variables on the document element for light mode', () => {
    applyTheme('light');

    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.style.getPropertyValue('--color-background')).toBe('#FAFAFA');
  });
});

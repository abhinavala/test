export type ThemeMode = 'dark' | 'light' | 'system';

export interface ThemeTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
}

export interface ColorTokens {
  primary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
}

export interface TypographyTokens {
  fontFamily: string;
  monoFontFamily: string;
  baseFontSize: string;
}

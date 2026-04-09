import { FC } from 'react';
import type { ThemeMode } from '../../types/theme.js';

export interface ThemeSelectorProps {
  currentTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'dark', label: 'Dark', description: 'Dark utility aesthetic (recommended)' },
  { value: 'light', label: 'Light', description: 'Light mode for bright environments' },
  { value: 'system', label: 'System', description: 'Follow your operating system setting' },
];

export const ThemeSelector: FC<ThemeSelectorProps> = ({
  currentTheme,
  onThemeChange,
}) => {
  return (
    <section className="settings-section" aria-labelledby="theme-heading">
      <h2 id="theme-heading" className="settings-section__title">
        Theme
      </h2>

      <div className="settings-section__content">
        <div className="theme-options" role="radiogroup" aria-label="Theme selection">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={currentTheme === option.value}
              className={`theme-option ${
                currentTheme === option.value ? 'theme-option--active' : ''
              }`}
              onClick={() => onThemeChange(option.value)}
            >
              <span className="theme-option__label">{option.label}</span>
              <span className="theme-option__description">{option.description}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ThemeSelector;

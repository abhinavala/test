import { FC } from 'react';

export interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
}

export const Toggle: FC<ToggleProps> = ({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  description,
}) => {
  return (
    <div className="toggle-field">
      <div className="toggle-header">
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        <button
          id={id}
          role="switch"
          type="button"
          aria-checked={checked}
          aria-label={label}
          className={`toggle-switch ${checked ? 'toggle-switch--active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(!checked)}
        >
          <span className="toggle-switch__thumb" />
        </button>
      </div>
      {description && (
        <p className="toggle-description">{description}</p>
      )}
    </div>
  );
};

export default Toggle;

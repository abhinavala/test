import { FC } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: string;
}

export const Select: FC<SelectProps> = ({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  description,
}) => {
  return (
    <div className="select-field">
      <label htmlFor={id} className="select-label">
        {label}
      </label>
      {description && (
        <p className="select-description">{description}</p>
      )}
      <select
        id={id}
        className="select-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default Select;

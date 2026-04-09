export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export interface SearchInputState {
  internalValue: string;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function createSearchInputController(
  onChange: (value: string) => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function handleChange(newValue: string): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      onChange(newValue);
      debounceTimer = null;
    }, debounceMs);
  }

  function handleClear(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    onChange("");
  }

  function destroy(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  return { handleChange, handleClear, destroy };
}

export function getSearchInputAttributes(props: SearchInputProps): {
  role: string;
  "aria-label": string;
  placeholder: string;
  value: string;
  className: string;
} {
  return {
    role: "searchbox",
    "aria-label": props.placeholder ?? "Search",
    placeholder: props.placeholder ?? "Search...",
    value: props.value,
    className: ["search-input", props.className].filter(Boolean).join(" "),
  };
}

export function getClearButtonAttributes(value: string): {
  role: string;
  "aria-label": string;
  visible: boolean;
} {
  return {
    role: "button",
    "aria-label": "Clear search",
    visible: value.length > 0,
  };
}

export default createSearchInputController;

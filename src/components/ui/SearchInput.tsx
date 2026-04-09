/**
 * SearchInput component for text search with debounced input.
 *
 * Renders a search input field with an optional clear button.
 * Calls onSearch with the current value as the user types.
 */

export interface SearchInputProps {
  value: string;
  placeholder?: string;
  onSearch: (query: string) => void;
  onClear?: () => void;
  disabled?: boolean;
}

/** Build the HTML attributes for the search input element. */
export function buildSearchInputAttributes(props: SearchInputProps): Record<string, string | boolean> {
  return {
    type: "search",
    role: "searchbox",
    "aria-label": props.placeholder ?? "Search meetings",
    placeholder: props.placeholder ?? "Search meetings...",
    value: props.value,
    disabled: props.disabled ?? false,
    className: "search-input",
  };
}

/** Determine if the clear button should be visible. */
export function shouldShowClearButton(value: string): boolean {
  return value.length > 0;
}

/**
 * Handle search input change events.
 * Extracts the value from the event target and passes to onSearch.
 */
export function handleSearchChange(
  event: { target: { value: string } },
  onSearch: (query: string) => void,
): void {
  onSearch(event.target.value);
}

/**
 * Handle the clear button click.
 * Resets search to empty and calls both onSearch and onClear.
 */
export function handleClearClick(
  onSearch: (query: string) => void,
  onClear?: () => void,
): void {
  onSearch("");
  onClear?.();
}

export default SearchInputProps;

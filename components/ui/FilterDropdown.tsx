export interface FilterOption<T> {
  label: string;
  value: T;
}

export interface FilterDropdownProps<T> {
  options: FilterOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  placeholder?: string;
  multiSelect?: boolean;
}

export interface FilterDropdownState<T> {
  isOpen: boolean;
  focusedIndex: number;
  selected: T[];
}

export function createFilterDropdownController<T>(
  props: FilterDropdownProps<T>,
): {
  getState: () => FilterDropdownState<T>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  handleKeyDown: (key: string) => void;
  selectIndex: (index: number) => void;
  isSelected: (value: T) => boolean;
} {
  const state: FilterDropdownState<T> = {
    isOpen: false,
    focusedIndex: -1,
    selected: [...props.selected],
  };

  function getState(): FilterDropdownState<T> {
    return { ...state };
  }

  function open(): void {
    state.isOpen = true;
    state.focusedIndex = state.selected.length > 0
      ? props.options.findIndex((opt) => opt.value === state.selected[0])
      : 0;
    if (state.focusedIndex === -1) {
      state.focusedIndex = 0;
    }
  }

  function close(): void {
    state.isOpen = false;
    state.focusedIndex = -1;
  }

  function toggle(): void {
    if (state.isOpen) {
      close();
    } else {
      open();
    }
  }

  function selectIndex(index: number): void {
    if (index < 0 || index >= props.options.length) return;

    const option = props.options[index];
    if (!option) return;

    const value = option.value;

    if (props.multiSelect) {
      const selectedIndex = state.selected.indexOf(value);
      if (selectedIndex === -1) {
        state.selected = [...state.selected, value];
      } else {
        state.selected = state.selected.filter((v) => v !== value);
      }
      props.onChange(state.selected);
    } else {
      state.selected = [value];
      props.onChange(state.selected);
      close();
    }
  }

  function isSelected(value: T): boolean {
    return state.selected.includes(value);
  }

  function handleKeyDown(key: string): void {
    if (!state.isOpen) {
      if (key === "Enter" || key === " " || key === "ArrowDown") {
        open();
      }
      return;
    }

    switch (key) {
      case "ArrowDown":
        state.focusedIndex = Math.min(
          state.focusedIndex + 1,
          props.options.length - 1,
        );
        break;
      case "ArrowUp":
        state.focusedIndex = Math.max(state.focusedIndex - 1, 0);
        break;
      case "Enter":
        selectIndex(state.focusedIndex);
        break;
      case "Escape":
        close();
        break;
      case "Home":
        state.focusedIndex = 0;
        break;
      case "End":
        state.focusedIndex = props.options.length - 1;
        break;
    }
  }

  return { getState, open, close, toggle, handleKeyDown, selectIndex, isSelected };
}

export function getDropdownAttributes<T>(
  props: FilterDropdownProps<T>,
  state: FilterDropdownState<T>,
): {
  role: string;
  "aria-expanded": boolean;
  "aria-haspopup": string;
  "aria-label": string;
  className: string;
} {
  return {
    role: "combobox",
    "aria-expanded": state.isOpen,
    "aria-haspopup": "listbox",
    "aria-label": props.placeholder ?? "Filter",
    className: [
      "filter-dropdown",
      state.isOpen ? "filter-dropdown--open" : "",
    ].filter(Boolean).join(" "),
  };
}

export function getOptionAttributes<T>(
  option: FilterOption<T>,
  index: number,
  state: FilterDropdownState<T>,
  isSelected: boolean,
): {
  role: string;
  "aria-selected": boolean;
  className: string;
  tabIndex: number;
} {
  return {
    role: "option",
    "aria-selected": isSelected,
    className: [
      "filter-dropdown__option",
      state.focusedIndex === index ? "filter-dropdown__option--focused" : "",
      isSelected ? "filter-dropdown__option--selected" : "",
    ].filter(Boolean).join(" "),
    tabIndex: state.focusedIndex === index ? 0 : -1,
  };
}

export function getListboxAttributes(): {
  role: string;
} {
  return {
    role: "listbox",
  };
}

export default createFilterDropdownController;

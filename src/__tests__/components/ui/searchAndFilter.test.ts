import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createSearchInputController,
  getSearchInputAttributes,
  getClearButtonAttributes,
} from "../../../../components/ui/SearchInput.tsx";
import type { SearchInputProps } from "../../../../components/ui/SearchInput.tsx";
import {
  createFilterDropdownController,
  getDropdownAttributes,
  getOptionAttributes,
  getListboxAttributes,
} from "../../../../components/ui/FilterDropdown.tsx";
import type {
  FilterDropdownProps,
  FilterOption,
} from "../../../../components/ui/FilterDropdown.tsx";

describe("SearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("debounced onChange", () => {
    it("calls onChange once after 300ms when user types multiple characters quickly", () => {
      const onChange = vi.fn();
      const controller = createSearchInputController(onChange);

      controller.handleChange("h");
      controller.handleChange("he");
      controller.handleChange("hel");
      controller.handleChange("hello");

      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("hello");

      controller.destroy();
    });

    it("does not call onChange before debounce period elapses", () => {
      const onChange = vi.fn();
      const controller = createSearchInputController(onChange);

      controller.handleChange("test");
      vi.advanceTimersByTime(200);

      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(onChange).toHaveBeenCalledTimes(1);

      controller.destroy();
    });

    it("supports custom debounce duration", () => {
      const onChange = vi.fn();
      const controller = createSearchInputController(onChange, 500);

      controller.handleChange("test");
      vi.advanceTimersByTime(300);
      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(onChange).toHaveBeenCalledTimes(1);

      controller.destroy();
    });
  });

  describe("clear button", () => {
    it("resets value and triggers onChange immediately", () => {
      const onChange = vi.fn();
      const controller = createSearchInputController(onChange);

      controller.handleChange("some text");
      controller.handleClear();

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("");

      controller.destroy();
    });

    it("cancels pending debounced call when clearing", () => {
      const onChange = vi.fn();
      const controller = createSearchInputController(onChange);

      controller.handleChange("typing");
      controller.handleClear();

      vi.advanceTimersByTime(300);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("");

      controller.destroy();
    });
  });

  describe("accessibility attributes", () => {
    it("returns correct attributes with defaults", () => {
      const props: SearchInputProps = {
        value: "test",
        onChange: vi.fn(),
      };

      const attrs = getSearchInputAttributes(props);

      expect(attrs.role).toBe("searchbox");
      expect(attrs["aria-label"]).toBe("Search");
      expect(attrs.placeholder).toBe("Search...");
      expect(attrs.value).toBe("test");
      expect(attrs.className).toBe("search-input");
    });

    it("uses custom placeholder as aria-label", () => {
      const props: SearchInputProps = {
        value: "",
        onChange: vi.fn(),
        placeholder: "Search meetings",
      };

      const attrs = getSearchInputAttributes(props);

      expect(attrs["aria-label"]).toBe("Search meetings");
      expect(attrs.placeholder).toBe("Search meetings");
    });

    it("appends custom className", () => {
      const props: SearchInputProps = {
        value: "",
        onChange: vi.fn(),
        className: "custom-class",
      };

      const attrs = getSearchInputAttributes(props);

      expect(attrs.className).toBe("search-input custom-class");
    });
  });

  describe("clear button visibility", () => {
    it("is visible when value is non-empty", () => {
      const attrs = getClearButtonAttributes("hello");
      expect(attrs.visible).toBe(true);
      expect(attrs["aria-label"]).toBe("Clear search");
    });

    it("is hidden when value is empty", () => {
      const attrs = getClearButtonAttributes("");
      expect(attrs.visible).toBe(false);
    });
  });
});

describe("FilterDropdown", () => {
  const stringOptions: FilterOption<string>[] = [
    { label: "Option A", value: "a" },
    { label: "Option B", value: "b" },
    { label: "Option C", value: "c" },
    { label: "Option D", value: "d" },
  ];

  describe("keyboard navigation", () => {
    it("ArrowDown focuses next option", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.open();
      expect(controller.getState().focusedIndex).toBe(0);

      controller.handleKeyDown("ArrowDown");
      expect(controller.getState().focusedIndex).toBe(1);

      controller.handleKeyDown("ArrowDown");
      expect(controller.getState().focusedIndex).toBe(2);
    });

    it("ArrowUp focuses previous option", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.open();
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("ArrowDown");
      expect(controller.getState().focusedIndex).toBe(2);

      controller.handleKeyDown("ArrowUp");
      expect(controller.getState().focusedIndex).toBe(1);
    });

    it("Enter selects focused option", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
        multiSelect: true,
      });

      controller.open();
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("Enter");

      expect(onChange).toHaveBeenCalledWith(["b"]);
    });

    it("Escape closes the dropdown", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.open();
      expect(controller.getState().isOpen).toBe(true);

      controller.handleKeyDown("Escape");
      expect(controller.getState().isOpen).toBe(false);
    });

    it("does not go below last option with ArrowDown", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.open();
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("ArrowDown");

      expect(controller.getState().focusedIndex).toBe(3);
    });

    it("does not go above first option with ArrowUp", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.open();
      controller.handleKeyDown("ArrowUp");

      expect(controller.getState().focusedIndex).toBe(0);
    });

    it("opens dropdown on Enter when closed", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      expect(controller.getState().isOpen).toBe(false);

      controller.handleKeyDown("Enter");
      expect(controller.getState().isOpen).toBe(true);
    });

    it("Home key moves focus to first option", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.open();
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("ArrowDown");
      controller.handleKeyDown("Home");

      expect(controller.getState().focusedIndex).toBe(0);
    });

    it("End key moves focus to last option", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.open();
      controller.handleKeyDown("End");

      expect(controller.getState().focusedIndex).toBe(3);
    });
  });

  describe("single select mode", () => {
    it("selects one option and closes dropdown", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
        multiSelect: false,
      });

      controller.open();
      controller.selectIndex(1);

      expect(onChange).toHaveBeenCalledWith(["b"]);
      expect(controller.getState().isOpen).toBe(false);
    });

    it("replaces previous selection", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: ["a"],
        onChange,
        multiSelect: false,
      });

      controller.open();
      controller.selectIndex(2);

      expect(onChange).toHaveBeenCalledWith(["c"]);
    });
  });

  describe("multi-select mode", () => {
    it("adds to selection when selecting new option", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: ["a"],
        onChange,
        multiSelect: true,
      });

      controller.selectIndex(1);

      expect(onChange).toHaveBeenCalledWith(["a", "b"]);
    });

    it("removes from selection when selecting already selected option", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: ["a", "b"],
        onChange,
        multiSelect: true,
      });

      controller.selectIndex(0);

      expect(onChange).toHaveBeenCalledWith(["b"]);
    });

    it("keeps dropdown open after selecting in multi-select mode", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
        multiSelect: true,
      });

      controller.open();
      controller.selectIndex(0);

      expect(controller.getState().isOpen).toBe(true);
    });
  });

  describe("isSelected", () => {
    it("returns true for selected values", () => {
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: ["a", "c"],
        onChange: vi.fn(),
      });

      expect(controller.isSelected("a")).toBe(true);
      expect(controller.isSelected("c")).toBe(true);
      expect(controller.isSelected("b")).toBe(false);
    });
  });

  describe("toggle", () => {
    it("opens when closed and closes when open", () => {
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange: vi.fn(),
      });

      expect(controller.getState().isOpen).toBe(false);

      controller.toggle();
      expect(controller.getState().isOpen).toBe(true);

      controller.toggle();
      expect(controller.getState().isOpen).toBe(false);
    });
  });

  describe("accessibility attributes", () => {
    it("returns correct dropdown attributes", () => {
      const props: FilterDropdownProps<string> = {
        options: stringOptions,
        selected: [],
        onChange: vi.fn(),
        placeholder: "Filter by status",
      };

      const controller = createFilterDropdownController(props);
      const attrs = getDropdownAttributes(props, controller.getState());

      expect(attrs.role).toBe("combobox");
      expect(attrs["aria-expanded"]).toBe(false);
      expect(attrs["aria-haspopup"]).toBe("listbox");
      expect(attrs["aria-label"]).toBe("Filter by status");
    });

    it("returns correct option attributes", () => {
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: ["a"],
        onChange: vi.fn(),
      });

      controller.open();
      const state = controller.getState();

      const selectedAttrs = getOptionAttributes(
        stringOptions[0]!,
        0,
        state,
        true,
      );
      expect(selectedAttrs.role).toBe("option");
      expect(selectedAttrs["aria-selected"]).toBe(true);
      expect(selectedAttrs.tabIndex).toBe(0);

      const unselectedAttrs = getOptionAttributes(
        stringOptions[1]!,
        1,
        state,
        false,
      );
      expect(unselectedAttrs["aria-selected"]).toBe(false);
      expect(unselectedAttrs.tabIndex).toBe(-1);
    });

    it("returns correct listbox attributes", () => {
      const attrs = getListboxAttributes();
      expect(attrs.role).toBe("listbox");
    });
  });

  describe("edge cases", () => {
    it("ignores selectIndex with out-of-range index", () => {
      const onChange = vi.fn();
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: [],
        onChange,
      });

      controller.selectIndex(-1);
      controller.selectIndex(10);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("opens with focus on first selected option", () => {
      const controller = createFilterDropdownController({
        options: stringOptions,
        selected: ["c"],
        onChange: vi.fn(),
      });

      controller.open();

      expect(controller.getState().focusedIndex).toBe(2);
    });
  });
});

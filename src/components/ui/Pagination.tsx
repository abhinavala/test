/**
 * Pagination component for navigating through pages of data.
 *
 * Displays page numbers, previous/next buttons, and total count info.
 * All numeric data uses monospace font class for consistent alignment.
 */

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

/** Calculate the range of items shown on the current page. */
export function getPageRange(
  currentPage: number,
  pageSize: number,
  totalItems: number,
): { start: number; end: number } {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  return { start, end };
}

/** Generate the list of page numbers to display with ellipsis gaps. */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 7,
): (number | "ellipsis")[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];
  const halfVisible = Math.floor((maxVisible - 2) / 2);

  let rangeStart = Math.max(2, currentPage - halfVisible);
  let rangeEnd = Math.min(totalPages - 1, currentPage + halfVisible);

  if (currentPage <= halfVisible + 1) {
    rangeEnd = maxVisible - 2;
  }

  if (currentPage >= totalPages - halfVisible) {
    rangeStart = totalPages - maxVisible + 3;
  }

  if (rangeStart > 2) {
    pages.push("ellipsis");
  }

  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  if (rangeEnd < totalPages - 1) {
    pages.push("ellipsis");
  }

  pages.push(totalPages);

  return pages;
}

/** Check if the previous page button should be disabled. */
export function isPrevDisabled(currentPage: number, disabled?: boolean): boolean {
  return currentPage <= 1 || disabled === true;
}

/** Check if the next page button should be disabled. */
export function isNextDisabled(
  currentPage: number,
  totalPages: number,
  disabled?: boolean,
): boolean {
  return currentPage >= totalPages || disabled === true;
}

/** Format the pagination summary text. */
export function formatPaginationSummary(
  currentPage: number,
  pageSize: number,
  totalItems: number,
): string {
  if (totalItems === 0) {
    return "No items";
  }

  const { start, end } = getPageRange(currentPage, pageSize, totalItems);
  return `Showing ${start}–${end} of ${totalItems}`;
}

export default PaginationProps;
